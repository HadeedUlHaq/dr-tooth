-- ─────────────────────────────────────────────────────────────────────────────
-- Dr Tooth — Supabase schema (Phase 1)
--
-- Design: each Firestore collection becomes a table shaped
--     (id text PK, data jsonb, <generated indexed columns>, updated_at)
-- `data` stores the EXACT document with its original camelCase field names, so the
-- server adapter (lib/whatsapp/firebaseAdmin.ts replacement) and the dashboard
-- services map documents <-> rows with zero field-name drift ("preserve behaviour
-- exactly"). Generated columns expose the fields that the existing code actually
-- filters / orders / RLS-gates on, so we still get real indexes and constraints.
--
-- Firestore doc IDs are preserved verbatim in `id` (requirement #6): auto-IDs for
-- patients/appointments/invoices/lab_cases/activity_logs, the phone/session key for
-- whatsapp_sessions, and the synthetic counter keys (c_*, global_YYYY-MM-DD, etc.).
--
-- Timestamps are kept as ISO-8601 TEXT generated columns. ISO-8601 sorts
-- lexicographically === chronologically, so `order by ... desc` is correct without
-- a timestamptz cast (text->timestamptz is STABLE, not IMMUTABLE, so it cannot be
-- used in a generated column anyway).
-- ─────────────────────────────────────────────────────────────────────────────

-- Maintain updated_at on every UPDATE.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Domain: patients ─────────────────────────────────────────────────────────
create table if not exists public.patients (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  phone       text generated always as (data ->> 'phone') stored,
  name        text generated always as (data ->> 'name') stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists patients_phone_idx on public.patients (phone);
create index if not exists patients_name_idx  on public.patients (lower(name));

create trigger patients_set_updated_at before update on public.patients
  for each row execute function public.set_updated_at();

-- ── Domain: appointments ─────────────────────────────────────────────────────
create table if not exists public.appointments (
  id             text primary key,
  data           jsonb not null default '{}'::jsonb,
  date           text generated always as (data ->> 'date') stored,
  "time"         text generated always as (data ->> 'time') stored,
  status         text generated always as (data ->> 'status') stored,
  doctor_id      text generated always as (data ->> 'doctorId') stored,
  patient_phone  text generated always as (data ->> 'patientPhone') stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Covers: where date == / range, where status in, where time ==, where doctorId ==
create index if not exists appointments_date_idx        on public.appointments (date);
create index if not exists appointments_date_status_idx on public.appointments (date, status);
create index if not exists appointments_status_idx      on public.appointments (status);
create index if not exists appointments_doctor_idx      on public.appointments (doctor_id);

create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

-- ── Domain: invoices ─────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id              text primary key,
  data            jsonb not null default '{}'::jsonb,
  patient_name    text generated always as (data ->> 'patientName') stored,
  patient_id      text generated always as (data ->> 'patientId') stored,
  appointment_id  text generated always as (data ->> 'appointmentId') stored,
  created_at_iso  text generated always as (data ->> 'createdAt') stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists invoices_patient_name_idx   on public.invoices (patient_name);
create index if not exists invoices_patient_id_idx      on public.invoices (patient_id);
create index if not exists invoices_appointment_id_idx  on public.invoices (appointment_id);
create index if not exists invoices_created_at_idx      on public.invoices (created_at_iso desc);

create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- ── Domain: lab_cases ────────────────────────────────────────────────────────
create table if not exists public.lab_cases (
  id              text primary key,
  data            jsonb not null default '{}'::jsonb,
  patient_id      text generated always as (data ->> 'patientId') stored,
  patient_name    text generated always as (data ->> 'patientName') stored,
  created_at_iso  text generated always as (data ->> 'createdAt') stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists lab_cases_patient_id_idx    on public.lab_cases (patient_id);
create index if not exists lab_cases_patient_name_idx  on public.lab_cases (patient_name);
create index if not exists lab_cases_created_at_idx    on public.lab_cases (created_at_iso desc);

create trigger lab_cases_set_updated_at before update on public.lab_cases
  for each row execute function public.set_updated_at();

-- ── Domain: activity_logs ────────────────────────────────────────────────────
create table if not exists public.activity_logs (
  id              text primary key,
  data            jsonb not null default '{}'::jsonb,
  created_at_iso  text generated always as (data ->> 'createdAt') stored,
  created_at      timestamptz not null default now()
);
create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at_iso desc);

-- ── Staff profiles (auth.users <-> role). id = auth uid after auth migration. ──
-- During migration the row may still be keyed by the legacy Firebase uid; the
-- backfill script remaps id -> Supabase auth uid (see docs/supabase-migration.md).
create table if not exists public.users (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  email       text generated always as (data ->> 'email') stored,
  role        text generated always as (data ->> 'role') stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists users_role_idx  on public.users (role);
create index if not exists users_email_idx on public.users (lower(email));

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- ── Bot: whatsapp_sessions (id = phone / chat_<uuid> session key) ─────────────
create table if not exists public.whatsapp_sessions (
  id                 text primary key,
  data               jsonb not null default '{}'::jsonb,
  last_active_at_iso text generated always as (data ->> 'lastActiveAt') stored,
  updated_at         timestamptz not null default now()
);
create index if not exists whatsapp_sessions_last_active_idx
  on public.whatsapp_sessions (last_active_at_iso desc);

create trigger whatsapp_sessions_set_updated_at before update on public.whatsapp_sessions
  for each row execute function public.set_updated_at();

-- ── Bot: whatsapp_staff (registered numbers + salted code hashes) ─────────────
create table if not exists public.whatsapp_staff (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  phone       text    generated always as (data ->> 'phone') stored,
  active      boolean generated always as ((data ->> 'active')::boolean) stored,
  updated_at  timestamptz not null default now()
);
create index if not exists whatsapp_staff_phone_idx on public.whatsapp_staff (phone);

create trigger whatsapp_staff_set_updated_at before update on public.whatsapp_staff
  for each row execute function public.set_updated_at();

-- ── Bot: whatsapp_blocks (staff time-off; queried by date) ───────────────────
create table if not exists public.whatsapp_blocks (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  date        text generated always as (data ->> 'date') stored,
  created_at  timestamptz not null default now()
);
create index if not exists whatsapp_blocks_date_idx on public.whatsapp_blocks (date);

-- ── Bot: callback_requests ───────────────────────────────────────────────────
create table if not exists public.callback_requests (
  id              text primary key,
  data            jsonb not null default '{}'::jsonb,
  created_at_iso  text generated always as (data ->> 'createdAt') stored,
  created_at      timestamptz not null default now()
);
create index if not exists callback_requests_created_at_idx
  on public.callback_requests (created_at_iso desc);

-- ── Bot: whatsapp_config (id = 'bot' | 'reminders') ──────────────────────────
create table if not exists public.whatsapp_config (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create trigger whatsapp_config_set_updated_at before update on public.whatsapp_config
  for each row execute function public.set_updated_at();

-- ── Operational counters / idempotency (pure transactional KV) ───────────────
-- These back the anti-abuse + send-budget + idempotency logic in antiBan.ts and
-- sessionService.ts. Atomic mutation is done via the RPCs in 0003_counter_rpcs.sql
-- (Postgres functions), NOT by emulating Firestore transactions client-side.
create table if not exists public.whatsapp_send_budget ( id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now() );
create table if not exists public.whatsapp_deliveries   ( id text primary key, data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now() );
create table if not exists public.whatsapp_abuse        ( id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now() );
create table if not exists public.whatsapp_ai_budget    ( id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now() );
create table if not exists public.chat_rate_limits      ( id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now() );
