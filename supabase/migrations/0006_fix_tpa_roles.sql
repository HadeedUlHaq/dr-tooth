-- ─────────────────────────────────────────────────────────────────────────────
-- Dr Tooth — fix Third-Party (Firebase) Auth RLS.
--
-- Firebase ID tokens carry no `role` claim, so PostgREST executes the request as
-- the `anon` Postgres role even though the token is validly verified by Supabase.
-- Our domain policies were restricted `TO authenticated`, so they never applied and
-- every staff read returned []. Fix: let the policies apply to any role and gate on
-- the VERIFIED identity via is_staff() (which reads auth.jwt()->>'sub'). An
-- unauthenticated request has no sub, so is_staff() is false and it stays denied.
-- ─────────────────────────────────────────────────────────────────────────────

alter policy patients_staff_all      on public.patients      to public;
alter policy appointments_staff_all  on public.appointments  to public;
alter policy invoices_staff_all      on public.invoices      to public;
alter policy lab_cases_staff_all     on public.lab_cases     to public;
alter policy activity_logs_staff_all on public.activity_logs to public;
alter policy users_self_read         on public.users         to public;
alter policy users_admin_write       on public.users         to public;

-- Temporary diagnostic: shows exactly what Supabase sees for the calling token.
-- Safe (read-only, no data); drop it after verifying. Callable by anon/authenticated.
create or replace function public.debug_whoami()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'jwt_role',   auth.jwt() ->> 'role',
    'sub',        auth.jwt() ->> 'sub',
    'is_staff',   public.is_staff(),
    'user_match', exists (select 1 from public.users u where u.id = (auth.jwt() ->> 'sub'))
  );
$$;
grant execute on function public.debug_whoami() to anon, authenticated;
