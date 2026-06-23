-- ─────────────────────────────────────────────────────────────────────────────
-- Dr Tooth — Row Level Security (Phase 1)
--
-- Threat model mirrors the current app:
--   * Dashboard (browser) authenticates with Supabase Auth and reads/writes the
--     DOMAIN tables directly with the publishable key  -> gated by RLS to staff.
--   * The AI bot / cron / webhook run server-side with the SERVICE ROLE key, which
--     BYPASSES RLS entirely. So the bot-state + counter tables need no anon policy.
--   * Public patients (web /chat, WhatsApp) never authenticate; they reach data
--     only through the bot's service-role server code. No anon policies anywhere.
--
-- Self-signup protection (requirement #5): a freshly self-registered auth user has
-- NO row in public.users, so is_staff() is false and every domain policy denies
-- them. They also cannot INSERT their own users row (no such policy) — only the
-- service role / an admin can grant a role.
-- ─────────────────────────────────────────────────────────────────────────────

-- Is the current authenticated user a provisioned staff member?
-- SECURITY DEFINER so it can read public.users regardless of that table's RLS.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()::text
      and u.role in ('admin', 'doctor', 'receptionist')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()::text and u.role = 'admin'
  );
$$;

-- Enable RLS on every table (default-deny once enabled).
alter table public.patients            enable row level security;
alter table public.appointments        enable row level security;
alter table public.invoices            enable row level security;
alter table public.lab_cases           enable row level security;
alter table public.activity_logs       enable row level security;
alter table public.users               enable row level security;
alter table public.whatsapp_sessions   enable row level security;
alter table public.whatsapp_staff      enable row level security;
alter table public.whatsapp_blocks     enable row level security;
alter table public.callback_requests   enable row level security;
alter table public.whatsapp_config     enable row level security;
alter table public.whatsapp_send_budget enable row level security;
alter table public.whatsapp_deliveries  enable row level security;
alter table public.whatsapp_abuse       enable row level security;
alter table public.whatsapp_ai_budget   enable row level security;
alter table public.chat_rate_limits     enable row level security;

-- ── Domain tables: full access for authenticated staff (browser dashboard) ───
do $$
declare t text;
begin
  foreach t in array array['patients','appointments','invoices','lab_cases','activity_logs']
  loop
    execute format($f$
      create policy %1$s_staff_all on public.%1$I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t);
  end loop;
end $$;

-- ── users: a signed-in user may read THEIR OWN row (AuthContext needs the role).
--    Admins may read/write all. No self-INSERT (blocks self-promotion to staff). ──
create policy users_self_read on public.users
  for select to authenticated
  using (id = auth.uid()::text or public.is_admin());

create policy users_admin_write on public.users
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Everything else (whatsapp_*, counters, config): NO policies.
--    RLS is enabled with zero policies => denied for anon/authenticated, and only
--    the service-role bot/cron/API code (which bypasses RLS) can touch them.
--    This matches today's Firestore rule "deny all client access (Admin SDK only)".
