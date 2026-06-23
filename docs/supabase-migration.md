# Firebase → Supabase migration

Status: **Phase 2 in progress** — counters wired, dormant behind a flag; app still
runs 100% on Firebase until you opt in. (Phase 1 scaffolding done.)

## Activate the Phase 2 counters (when ready to test)

The high-frequency ephemeral counters (idempotency, send-budget, abuse/health,
AI-budget, chat rate-limit) can move off Firestore onto Supabase RPCs. They need no
data migration and fail open. To turn them on:

1. In the Supabase SQL editor, run `supabase/migrations/0001_schema.sql`, then
   `0002_rls.sql`, then `0003_counter_rpcs.sql`.
2. Set `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API → service_role).
   Server-only — never `NEXT_PUBLIC_*`.
3. Set `SUPABASE_AREAS=counters`. Deploy. Watch logs for `[... supabase] failing open`
   (means RPC/connection problem — bot still works on the fail-open path).
4. Roll back instantly by removing `SUPABASE_AREAS`.

Wired call sites: `lib/whatsapp/antiBan.ts` (`alreadyHandled`, `withinSendBudget`,
`assessInbound`, `withinAiBudget`) and `lib/whatsapp/sessionService.ts`
(`checkRateLimit`) — each branches to `lib/whatsapp/supabaseAdmin.ts` RPC wrappers
when `supabaseEnabled("counters")`, else uses the unchanged Firestore path.

Goal: cut Firebase cost by moving Firestore + Firebase Auth to Supabase, **without a
big-bang rewrite** and without changing any user-facing behaviour.

## The two access layers (what we're replacing)

| Layer | Entry point | Used by | Replace with |
|---|---|---|---|
| Browser client SDK | `lib/firebase.ts` + `lib/*Service.ts` + `contexts/AuthContext.tsx` + `lib/authedFetch.ts` | Dashboard pages | Supabase **browser** client (`utils/supabase/client.ts`), RLS-gated |
| Server REST shim | `lib/whatsapp/firebaseAdmin.ts` → `getAdminDb()` | **All** bot/API/cron/middleware code | Supabase **admin** client (`utils/supabase/server.ts → createAdminClient`), service-role |

`getAdminDb()` is the key seam: nearly all server code calls
`getAdminDb().collection(x).doc/where/orderBy/...`. We add a Supabase-backed
implementation of that **same interface** so server call sites stay unchanged, flipped
by `DATA_BACKEND=firebase|supabase`.

## Collection → table map

All tables follow `(id text PK, data jsonb, <generated indexed cols>, updated_at)`.
`data` holds the exact document with **original camelCase field names** → zero mapping
drift. Firestore doc IDs are preserved verbatim in `id` (requirement #6).

| Firestore collection | Table | Indexed/generated cols (from real query usage) |
|---|---|---|
| `patients` | `patients` | `phone`, `name` |
| `appointments` | `appointments` | `date`, `time`, `status`, `doctor_id`, `patient_phone` |
| `invoices` | `invoices` | `patient_name`, `patient_id`, `appointment_id`, `created_at_iso` |
| `lab_cases` | `lab_cases` | `patient_id`, `patient_name`, `created_at_iso` |
| `activity_logs` | `activity_logs` | `created_at_iso` |
| `users` | `users` | `email`, `role` |
| `whatsapp_sessions` | `whatsapp_sessions` | `last_active_at_iso` |
| `whatsapp_staff` | `whatsapp_staff` | `phone`, `active` |
| `whatsapp_blocks` | `whatsapp_blocks` | `date` |
| `callback_requests` | `callback_requests` | `created_at_iso` |
| `whatsapp_config` (`bot`,`reminders`) | `whatsapp_config` | — |
| `whatsapp_send_budget` | `whatsapp_send_budget` | RPC `wa_within_send_budget` |
| `whatsapp_deliveries` | `whatsapp_deliveries` | RPC `wa_already_handled` |
| `whatsapp_abuse` | `whatsapp_abuse` | RPC `wa_assess_inbound` |
| `whatsapp_ai_budget` | `whatsapp_ai_budget` | RPC `wa_within_ai_budget` |
| `chat_rate_limits` | `chat_rate_limits` | RPC `wa_check_rate_limit` |

> Note: `whatsapp_abuse` and `whatsapp_ai_budget` exist in code (`antiBan.ts`) but were
> **missing from the original migration brief's collection list** — included here.

## Function → query map (representative)

| Current function | Firestore query | Supabase equivalent |
|---|---|---|
| `getTodayAppointments` | `where date == today` | `.eq('date', today)`, sort in code (unchanged) |
| `getWeeklyAppointments` | `where date >= a AND date < b` | `.gte('date',a).lt('date',b)` |
| `checkOverlappingAppointments` | `where date== & time== & status in [...]` | `.eq.eq.in` |
| `getInvoicesByPatientId` | `where patientId ==` | `.eq('patient_id', …)` |
| `findPatientByPhone` | exact tries + bounded scan | `.eq('phone',…)`; fallback scan unchanged |
| `getAllSessions` | `orderBy lastActiveAt desc limit 100` | `.order('last_active_at_iso',desc).limit(100)` |
| `subscribeToActivities` / `subscribeToCollection` | `onSnapshot` real-time | **Supabase Realtime** `postgres_changes` (see Risks) |
| anti-abuse / budgets / dedupe | `runTransaction` | **RPCs** in `0003_counter_rpcs.sql` |

## Auth migration (requirement #5 — careful)

- Firebase Auth (email/password, ID tokens) → Supabase Auth (email/password, JWT in cookies).
- `middleware.ts` today: verify Firebase ID token + `isAuthorizedStaff(uid)` (a `users`
  row with role admin/doctor/receptionist). Supabase version: `supabase.auth.getUser()` +
  the same `users`-row role check. **Self-signup must never become staff** — enforced by
  RLS (`is_staff()` is false with no `users` row) and by no self-INSERT policy on `users`.
- `authedFetch` (attaches Firebase ID token) → Supabase session cookies are sent
  automatically; `/api/whatsapp/*` reads the session server-side instead of a Bearer token.
- Users must be re-provisioned in Supabase Auth; map each Firebase uid → new Supabase uid
  and update the `users.id`. Until cutover, both auth systems can coexist behind the flag.

## Implementation sequence (safe order)

1. **Phase 1 (done):** packages, `utils/supabase/*`, `.env.example`, SQL schema + RLS + RPCs.
2. **Phase 2:** Supabase-backed `getAdminDb()` adapter + `DATA_BACKEND` switch. Start on
   the lowest-risk collections (`whatsapp_abuse`, `chat_rate_limits`, `whatsapp_deliveries`).
3. **Phase 3:** dashboard services (`patient/appointment/invoice/lab/activity`) + AuthContext
   + middleware to Supabase. Real-time via Supabase Realtime.
4. **Phase 4:** remaining bot state (sessions, config, staff, blocks, budgets) onto the RPCs.
5. **Phase 5:** data export Firestore → Supabase, verify counts + samples, `tsc`/`build`,
   run the full test checklist, then flip `DATA_BACKEND=supabase` in prod.

## Risks / mismatches to resolve before each phase

- **Real-time:** Firestore `onSnapshot` re-fetches the whole collection on any change.
  Supabase Realtime delivers row-level deltas; the dashboard's "refetch on change" pattern
  maps to subscribing to `postgres_changes` and calling the same refetch callback. Must be
  validated per page. Realtime must be enabled per-table in Supabase.
- **Transactions:** ported to RPCs (`0003`). **Not yet executed against the DB — verify
  before Phase 4.** They fail-open in code, so a bug degrades to "allow", not data loss.
- **Doc IDs:** invoice/appointment IDs may be user-facing/linked; session IDs are phone/chat
  keys. The export script must preserve `id` exactly.
- **serverTimestamp:** the shim already writes ISO strings; generated `*_iso` columns rely on
  that. Legacy docs with non-ISO/missing timestamps need a backfill default.

## Safety rules (do not violate)

- Do **not** delete Firebase code/env until the Supabase path is proven in prod.
- Do **not** put the service-role key in any `NEXT_PUBLIC_*` var or browser bundle.
- Do **not** run destructive Firestore deletes during export (read-only export).
- Secrets live in `.env.local` (gitignored). If any secret was pasted into chat/logs, rotate it.
