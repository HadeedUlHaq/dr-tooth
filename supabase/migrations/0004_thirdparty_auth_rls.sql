-- ─────────────────────────────────────────────────────────────────────────────
-- Dr Tooth — Third-Party (Firebase) Auth support + Realtime (Phase: domain)
--
-- We keep Firebase login. The dashboard browser sends its Firebase ID token to
-- Supabase via the client's accessToken bridge; Supabase validates it once Firebase
-- is registered as a Third-Party Auth provider (Dashboard → Authentication →
-- Third-Party Auth → add Firebase, project id = dr-tooth-dental-clinic).
--
-- Firebase uids are NOT UUIDs, so auth.uid() (which casts sub::uuid) returns null
-- for them. RLS must therefore read the raw text subject: auth.jwt() ->> 'sub'.
-- Our public.users.id == Firebase uid (exported that way), so the role check matches.
-- ─────────────────────────────────────────────────────────────────────────────

-- Redefine the staff/admin helpers to use the text subject claim.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = (auth.jwt() ->> 'sub')
      and u.role in ('admin', 'doctor', 'receptionist')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = (auth.jwt() ->> 'sub') and u.role = 'admin'
  );
$$;

-- users self-read must also use the text subject.
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users
  for select to authenticated
  using (id = (auth.jwt() ->> 'sub') or public.is_admin());

-- ── Enable Realtime on the domain tables (so the dashboard keeps live updates) ──
-- Adds each table to the supabase_realtime publication if not already present.
do $$
declare t text;
begin
  foreach t in array array[
    'patients','appointments','invoices','lab_cases','activity_logs','users'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;  -- already published
      when undefined_object then
        raise notice 'publication supabase_realtime missing; create it or enable Realtime in the dashboard';
    end;
  end loop;
end $$;
