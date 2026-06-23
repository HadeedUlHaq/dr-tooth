-- ─────────────────────────────────────────────────────────────────────────────
-- Dr Tooth — keep-alive table for the GitHub Actions cron that pings Supabase so a
-- quiet week doesn't pause the free project. Holds nothing sensitive; the publishable
-- (anon) key may read the single seed row.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.keep_alive_checks (
  id          int primary key,
  note        text not null default 'keep-alive',
  checked_at  timestamptz not null default now()
);

insert into public.keep_alive_checks (id, note)
values (1, 'keep-alive')
on conflict (id) do nothing;

alter table public.keep_alive_checks enable row level security;

-- Allow anyone (incl. the anon/publishable key the cron uses) to SELECT this row.
drop policy if exists keepalive_public_read on public.keep_alive_checks;
create policy keepalive_public_read on public.keep_alive_checks
  for select using (true);
