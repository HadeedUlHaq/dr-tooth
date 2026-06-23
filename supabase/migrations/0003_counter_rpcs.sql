-- ─────────────────────────────────────────────────────────────────────────────
-- Dr Tooth — atomic counter RPCs (idempotency / send-budget / anti-abuse)
--
-- WHY THIS FILE EXISTS — the one Firestore->Postgres mismatch worth calling out:
-- the current bot does these as Firestore multi-doc `runTransaction` blocks
-- (lib/whatsapp/antiBan.ts, sessionService.ts). The Supabase adapter MUST NOT try
-- to re-implement Firestore transactions over PostgREST; instead each transaction
-- becomes one atomic Postgres function called via supabase.rpc(...). The bodies
-- below are a faithful port of the TS logic (same windows, caps, fail-open intent).
--
-- Time base: epoch milliseconds via clock_timestamp() to mirror JS Date.now().
-- Day key: UTC date (to_char(now() at time zone 'utc','YYYY-MM-DD')) to mirror
-- new Date().toISOString().slice(0,10).
--
-- ✓ VERIFIED 2026-06-23 against the live DB (functional + idempotency checks all
-- matched the antiBan.ts expectations). Wired behind SUPABASE_AREAS=counters.
-- ─────────────────────────────────────────────────────────────────────────────

-- alreadyHandled(deliveryId): true if this delivery was already processed.
create or replace function public.wa_already_handled(p_id text)
returns boolean language plpgsql as $$
declare v text;
begin
  if p_id is null or p_id = '' then return false; end if;
  insert into public.whatsapp_deliveries (id, data)
    values (p_id, jsonb_build_object('at', (extract(epoch from clock_timestamp()) * 1000)::bigint))
    on conflict (id) do nothing
    returning id into v;
  return v is null;            -- null => conflict => already handled
end $$;

-- withinAiBudget(): true while under the global daily LLM-invocation cap.
create or replace function public.wa_within_ai_budget(p_max int default 2000)
returns boolean language plpgsql as $$
declare
  v_day   text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  v_count int;
begin
  insert into public.whatsapp_ai_budget (id, data)
    values ('global_' || v_day, jsonb_build_object('count', 1, 'day', v_day))
    on conflict (id) do update
      set data = jsonb_set(public.whatsapp_ai_budget.data, '{count}',
                           to_jsonb((public.whatsapp_ai_budget.data ->> 'count')::int + 1))
    where (public.whatsapp_ai_budget.data ->> 'count')::int < p_max
    returning (data ->> 'count')::int into v_count;
  return v_count is not null;  -- null => cap reached (update skipped)
end $$;

-- checkRateLimit(sessionId): public-chat per-session sliding window.
create or replace function public.wa_check_rate_limit(
  p_id text, p_window_ms bigint default 60000, p_max int default 15)
returns boolean language plpgsql as $$
declare
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  d jsonb; v_start bigint; v_count int;
begin
  select data into d from public.chat_rate_limits where id = p_id for update;
  if d is null then
    insert into public.chat_rate_limits (id, data)
      values (p_id, jsonb_build_object('windowStart', v_now, 'count', 1))
      on conflict (id) do update set data = jsonb_build_object('windowStart', v_now, 'count', 1);
    return true;
  end if;
  v_start := (d ->> 'windowStart')::bigint;
  v_count := (d ->> 'count')::int;
  if v_now - v_start > p_window_ms then
    update public.chat_rate_limits set data = jsonb_build_object('windowStart', v_now, 'count', 1) where id = p_id;
    return true;
  elsif v_count >= p_max then
    return false;
  else
    update public.chat_rate_limits set data = jsonb_set(data, '{count}', to_jsonb(v_count + 1)) where id = p_id;
    return true;
  end if;
end $$;

-- withinSendBudget(contactKey): per-contact burst window + global daily cap.
create or replace function public.wa_within_send_budget(
  p_contact text, p_window_ms bigint default 60000,
  p_contact_max int default 8, p_global_max int default 300)
returns jsonb language plpgsql as $$
declare
  v_now   bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_day   text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  v_gkey  text := 'global_' || v_day;
  v_ckey  text := 'c_' || p_contact;
  g jsonb; c jsonb; v_gcount int; v_cstart bigint; v_ccount int;
begin
  select data into g from public.whatsapp_send_budget where id = v_gkey for update;
  v_gcount := coalesce((g ->> 'count')::int, 0);
  if v_gcount >= p_global_max then
    return jsonb_build_object('ok', false, 'reason', 'global_daily_cap');
  end if;

  select data into c from public.whatsapp_send_budget where id = v_ckey for update;
  v_cstart := v_now; v_ccount := 1;
  if c is not null and v_now - (c ->> 'windowStart')::bigint < p_window_ms then
    if (c ->> 'count')::int >= p_contact_max then
      return jsonb_build_object('ok', false, 'reason', 'contact_rate');
    end if;
    v_cstart := (c ->> 'windowStart')::bigint;
    v_ccount := (c ->> 'count')::int + 1;
  end if;

  insert into public.whatsapp_send_budget (id, data)
    values (v_ckey, jsonb_build_object('windowStart', v_cstart, 'count', v_ccount))
    on conflict (id) do update set data = excluded.data;
  insert into public.whatsapp_send_budget (id, data)
    values (v_gkey, jsonb_build_object('count', v_gcount + 1, 'day', v_day))
    on conflict (id) do update set data = excluded.data;
  return jsonb_build_object('ok', true);
end $$;

-- assessInbound(sessionKey, text): conversation-health + flood/abuse heuristic.
create or replace function public.wa_assess_inbound(p_session text, p_text text)
returns jsonb language plpgsql as $$
declare
  v_now    bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_window bigint := 60000;  v_hard int := 12;  v_soft int := 6;
  v_decay  bigint := 600000; v_red  int := 3;
  v_body   text := lower(trim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')));
  d jsonb; v_start bigint; v_count int; v_strikes int; v_lasttext text; v_lastat bigint;
  v_repeated boolean := false; v_reason text := null; v_health text := 'green';
begin
  select data into d from public.whatsapp_abuse where id = p_session for update;
  v_start := v_now; v_count := 1; v_strikes := coalesce((d ->> 'strikes')::int, 0);
  v_lastat := (d ->> 'lastAt')::bigint;
  if v_lastat is not null and v_now - v_lastat > v_decay then v_strikes := 0; end if;
  if d is not null and v_now - (d ->> 'windowStart')::bigint < v_window then
    v_start := (d ->> 'windowStart')::bigint;
    v_count := (d ->> 'count')::int + 1;
  end if;
  v_lasttext := d ->> 'lastText';
  v_repeated := v_lasttext is not null and v_lasttext = v_body and length(v_body) > 0;

  if v_count > v_hard then
    v_strikes := v_strikes + 1; v_reason := 'flooding (' || v_count || ' msgs/min)';
  elsif v_repeated then
    v_strikes := v_strikes + 1; v_reason := 'repeated identical messages';
  end if;

  if v_strikes >= v_red or v_count > v_hard then
    v_health := 'red';
  elsif v_count > v_soft or v_strikes >= 1 or v_repeated then
    v_health := 'yellow';
    if v_reason is null then
      v_reason := case when v_count > v_soft then 'rapid messages' else 'flagged' end;
    end if;
  end if;

  insert into public.whatsapp_abuse (id, data)
    values (p_session, jsonb_build_object('windowStart', v_start, 'count', v_count,
            'strikes', v_strikes, 'lastText', v_body, 'lastAt', v_now))
    on conflict (id) do update set data = excluded.data;

  return jsonb_build_object('allow', v_count <= v_hard, 'health', v_health,
                            'strikes', v_strikes, 'reason', v_reason);
end $$;

-- Only the trusted server (service role) calls these.
grant execute on function public.wa_already_handled(text)            to service_role;
grant execute on function public.wa_within_ai_budget(int)            to service_role;
grant execute on function public.wa_check_rate_limit(text,bigint,int) to service_role;
grant execute on function public.wa_within_send_budget(text,bigint,int,int) to service_role;
grant execute on function public.wa_assess_inbound(text,text)        to service_role;
