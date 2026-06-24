# Firebase → Supabase migration

**Goal:** move data off Firebase Firestore (which was costing too much per day) onto
Supabase Postgres — **incrementally, reversibly, and without a big-bang rewrite or a
visible behaviour change**. Each slice is gated by an env flag and fails safely.

> **One-line status (2026-06-23):** Counters + all WhatsApp/bot state are **live on
> Supabase in production**. The dashboard domain data (patients/appointments/invoices/
> lab/activity) is **built, data-migrated, and verified in a preview** — awaiting the
> final production flip. **Firebase Auth (login) is unchanged.**

> **Current status (2026-06-24):** Counters + WhatsApp/bot state are on Supabase,
> and the dashboard domain data path is Supabase-only in the current codebase.
> Firebase Auth/login remains unchanged. Dashboard live notifications now use
> Supabase Broadcast, not Firebase realtime and not `postgres_changes`.

---

## 1. What we kept on Firebase (and why)

| Thing | Status | Why |
|---|---|---|
| **Firebase Authentication** (staff login) | **Kept, unchanged** | Auth is essentially free; the cost was Firestore. Migrating logins would force every staff member to reset passwords for ~zero saving. Login, sessions, and the `signInWithEmailAndPassword` flow are exactly as before. |
| **`users` collection** (uid → role) | **Kept on Firestore** | It backs the login/role path (`AuthContext`, middleware `isAuthorizedStaff`). Tiny (6 rows), rarely changes, negligible cost. Keeping it means the auth path is never disturbed by the data migration. |
| Firebase client SDK + Admin REST shim | **Kept as the fallback** | Still the default backend; only superseded per-collection when a flag is set. Nothing is deleted until Supabase is proven in prod. |

## 2. What moved to Supabase

| Area (flag) | Collections | Status |
|---|---|---|
| **counters** | whatsapp_deliveries, whatsapp_send_budget, whatsapp_abuse, whatsapp_ai_budget, chat_rate_limits | ✅ **Live in prod** |
| **wa_state** | whatsapp_sessions, whatsapp_config, whatsapp_staff, whatsapp_blocks, callback_requests | ✅ **Live in prod** |
| **domain** | patients, appointments, invoices, lab_cases, activity_logs | 🟡 **Staged + preview-verified; prod flip pending** |
| (users_domain) | users | ⬜ Intentionally **not** migrated (stays on Firestore) |

---

## 3. How authentication works now (the important part)

Login is still **Firebase Auth**. The new piece is letting the browser read/write
**Supabase** while staying logged in with Firebase — done via **Supabase Third-Party
Auth**, with no Supabase passwords and no shadow accounts:

```
Staff logs in with Firebase (email/password)  ──►  Firebase ID token (JWT)
        │
        ├─ Dashboard browser: utils/supabase/browser.ts creates a Supabase client whose
        │   accessToken callback returns the live Firebase ID token. Supabase validates
        │   that token against Firebase's public keys (Firebase registered as a
        │   Third-Party Auth provider, project id `dr-tooth-dental-clinic`).
        │   → RLS + Realtime authorize as that Firebase user.
        │
        └─ Server (bot/cron/webhook): uses the Supabase SERVICE-ROLE key (bypasses RLS),
            never exposed to the browser.
```

**Key subtlety we hit and fixed:** a Firebase ID token has no `role` claim, so Postgres
runs the request as the `anon` role even though the token is validly verified. Also,
`auth.uid()` casts the subject to a UUID, but Firebase uids aren't UUIDs. So our RLS:

- reads the raw subject `auth.jwt() ->> 'sub'` (not `auth.uid()`), and
- gates on `public.is_staff()` (a `users` row with a staff role) applied `TO public` —
  **not** restricted to the `authenticated` Postgres role.

A request with no valid token has no `sub`, so `is_staff()` is false and it's denied.
`public.users.id == Firebase uid`, so the staff check matches exactly. (See migrations
`0004` and `0006`.)

**Server-side auth gate is unchanged:** `middleware.ts` still verifies the Firebase ID
token and checks `isAuthorizedStaff` for `/api/whatsapp/*`. Only the data that lookup
reads can move backends; the auth mechanism is the same.

## 4. What happened to real-time (`onSnapshot`)

**Current implementation (2026-06-24): dashboard live refresh uses Supabase
Realtime Broadcast.** `lib/dashboardRepo.ts -> sbSubscribe(table, cb)` listens on
the `dashboard_table_changes` Broadcast channel. `sbInsert`, `sbUpdate`,
`sbDelete`, and `sbDeleteAll` publish a `table_changed` event after a successful
Supabase write, then notify same-tab listeners locally. `utils/supabase/realtime.ts`
creates a separate public Realtime client with no Firebase-token bridge, so the
notification path is not coupled to Firebase realtime, Supabase DB publication
settings, or Firebase Third-Party Auth socket joins. A 20-second polling fallback
keeps active dashboard subscriptions fresh if a Broadcast is missed or a server-side
write occurs.

The older `postgres_changes` notes below are retained as migration history only.

**We kept true real-time.** Firestore's `onSnapshot` (which re-fired the dashboard's
refetch on any change) is replaced by **Supabase Realtime** (`postgres_changes`):

- `lib/dashboardRepo.ts → sbSubscribe(table, cb)` opens a Realtime channel and calls the
  same refetch callback on any insert/update/delete — so the dashboard's existing
  "refetch on change" pattern is preserved.
- `subscribeToCollection()` and `subscribeToActivities()` in `lib/activityService.ts`
  branch to `sbSubscribe` when on Supabase.
- Realtime authorizes over the **same Firebase-token bridge** (so it's RLS-gated to
  staff), and the domain tables are added to the `supabase_realtime` publication
  (migration `0004`).

Net effect for staff: live updates across tabs/devices work exactly like before — no
switch to polling.

---

## 5. Architecture & the two seams

The whole migration turns on two abstraction seams that already existed:

1. **Server seam — `getAdminDb()`** (`lib/whatsapp/firebaseAdmin.ts`): a
   firebase-admin-compatible Firestore subset used by **all** bot/API/cron/middleware
   code. We added a Supabase implementation of the **same interface**
   (`lib/whatsapp/supabaseDb.ts`) and made `getAdminDb().collection(name)` **route
   per-collection** based on the flags. Flipping a collection moves every server caller
   at once, with no call-site changes.

2. **Dashboard seam — `lib/*Service.ts`**: each service function (e.g. `getPatients`,
   `createInvoice`) gained a branch: when `NEXT_PUBLIC_DATA_BACKEND === "supabase"`, it
   uses the Supabase browser client (`lib/dashboardRepo.ts`); otherwise the existing
   Firebase path. Page components are unchanged.

### Schema design — jsonb-document tables
Every collection became a table shaped `(id text PK, data jsonb, <generated indexed
columns>, timestamps)`. `data` holds the **exact** document with its original camelCase
field names, so both seams map documents ↔ rows with **zero field-name drift**. Generated
columns (e.g. `status`, `date`, `patient_id`, `created_at_iso`) expose the fields the code
actually filters/orders on, giving real indexes. **Firestore doc IDs are preserved
verbatim** (invoice/appointment IDs, phone/session keys).

### Transactions → RPCs
Firestore `runTransaction` doesn't map to PostgREST. The only transaction callers are the
5 counters; each became one atomic Postgres function (`supabase/migrations/0003_*`),
called via `supabase.rpc(...)`. All fail **open** (on error they "allow"), exactly like
the Firestore versions, so a Supabase blip never blocks a patient.

---

## 6. The flag system (how each slice is turned on/off)

| Flag | Scope | Meaning |
|---|---|---|
| `DATA_BACKEND` | server | `firebase` (default) or `supabase` (global override for all areas) |
| `SUPABASE_AREAS` | server | comma list of enabled areas, e.g. `counters,wa_state` (current prod) |
| `NEXT_PUBLIC_DATA_BACKEND` | browser | `supabase` makes the dashboard services use Supabase (must be flipped together with the server `domain` area) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | privileged Supabase client for bot/cron; **never** `NEXT_PUBLIC_*` |

Collection → area mapping lives in `lib/whatsapp/supabaseAdmin.ts` (`COLLECTION_AREA`).
**Rollback = remove the area from `SUPABASE_AREAS` (and `NEXT_PUBLIC_DATA_BACKEND`) and
redeploy** — instantly back on Firestore.

**Current prod env:** `SUPABASE_AREAS=counters,wa_state`, `SUPABASE_SERVICE_ROLE_KEY` set,
`NEXT_PUBLIC_SUPABASE_URL` set. (Domain flip will add `domain` + `NEXT_PUBLIC_DATA_BACKEND=supabase`.)

---

## 7. Files added / changed

**New (Supabase):**
- `utils/supabase/env.ts` - shared public Supabase env lookup. Accepts either
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `utils/supabase/realtime.ts` - dashboard Broadcast client with no Firebase-token bridge.
- `utils/supabase/client.ts`, `server.ts`, `middleware.ts` — SSR/admin helper clients
- `utils/supabase/browser.ts` — dashboard client with the Firebase-token bridge
- `lib/whatsapp/supabaseAdmin.ts` — service-role client, counter RPC wrappers, area routing
- `lib/whatsapp/supabaseDb.ts` — Supabase impl of the `getAdminDb()` interface
- `lib/dashboardRepo.ts` — client CRUD/query/Realtime for the dashboard
- `supabase/migrations/0001..0006*.sql` — schema, RLS, RPCs, TPA RLS, keep-alive, TPA fix
- `scripts/` — `migrate-to-supabase.mjs` (export), `validate-supabase-reads.mjs`,
  `test-bridge.mjs`, `run-sql.mjs`
- `.github/workflows/supabase-keep-alive.yml`

**Branched (Firebase default, Supabase when flagged):**
- `lib/patientService.ts`, `appointmentService.ts`, `invoiceService.ts`, `labService.ts`,
  `activityService.ts` (incl. real-time)
- `lib/whatsapp/firebaseAdmin.ts` (per-collection routing), `antiBan.ts`,
  `sessionService.ts` (counters → RPCs)

**Migrations:** `0001` schema · `0002` RLS · `0003` counter RPCs · `0004` Firebase
Third-Party Auth RLS + Realtime · `0005` keep-alive table · `0006` TPA role fix +
`debug_whoami()`.

---

## 8. Data migration & verification

- **`scripts/migrate-to-supabase.mjs`** — read-only on Firestore, idempotent upsert into
  Supabase (Firestore Timestamps → ISO strings, IDs preserved). Re-runnable for a delta
  re-sync right before a flip.
- Verified counts match: 967 patients, 51 appointments, 12 invoices, 6 users, 37 sessions,
  etc. (all 11 persistent collections ✓).
- **`scripts/validate-supabase-reads.mjs`** — confirmed every adapter query shape against
  the real data.
- **`scripts/test-bridge.mjs`** — mints a real Firebase token for a staff uid and hits
  Supabase to prove the Third-Party Auth bridge + RLS (now returns patients ✓).

## 9. Keep-alive (free tier)

Supabase free projects pause after ~7 days idle. `.github/workflows/supabase-keep-alive.yml`
pings the DB twice a week (`cron '0 20 * * 1,4'` = ~01:00 Asia/Karachi Tue & Fri) against
the `keep_alive_checks` table (migration `0005`). **To activate:** add GitHub repo secrets
`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) and run `0005`.

---

## 10. Next steps

1. **Flip prod domain** (the final cutover):
   - Re-sync domain data at a quiet moment (`node scripts/migrate-to-supabase.mjs patients appointments invoices lab_cases activity_logs`).
   - Set prod `NEXT_PUBLIC_DATA_BACKEND=supabase` and `SUPABASE_AREAS=counters,wa_state,domain`.
   - `vercel --prod`, then verify (token test + a sample write). Roll back by removing the
     two flag values and redeploying.
2. **Activate keep-alive** — add the 2 GitHub secrets + run `0005` (or via `run-sql.mjs`
   once `DATABASE_URL` is in `.env.local`).
3. **Cleanup** — drop the temporary `public.debug_whoami()` function.
4. **Later (optional):** once Supabase is proven in prod for a while, remove the dead
   Firebase code paths and the `firebase`/`firebase-admin` deps; consider moving `users`
   too (would require migrating auth — deferred on purpose).

## 11. Safety rules (still in force)

- Don't delete Firebase code/env until Supabase is proven in prod.
- Never put the service-role key (or `DATABASE_URL`) in any `NEXT_PUBLIC_*` var or the browser bundle.
- Data export is read-only on Firestore; no destructive Firestore deletes.
- `.env.local` (and `DATABASE_URL`) are gitignored. If a secret was ever pasted into chat/logs, rotate it.
