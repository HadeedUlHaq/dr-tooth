// Server-side Supabase access for the bot, mirroring lib/whatsapp/firebaseAdmin.ts.
// Phase 2 scope: the high-frequency ephemeral COUNTERS only (idempotency, send
// budget, abuse/health, AI budget, chat rate limit). Each Firestore multi-doc
// runTransaction is replaced by ONE atomic Postgres RPC (see
// supabase/migrations/0003_counter_rpcs.sql) — PostgREST has no interactive
// transactions, so RPCs are the correct atomic primitive.
//
// Activation (until all are set, every helper here is dormant and the bot keeps
// using Firestore unchanged):
//   1. Run supabase/migrations/0001_*, 0002_*, 0003_* in the Supabase SQL editor.
//   2. Set SUPABASE_SERVICE_ROLE_KEY (server-only; never NEXT_PUBLIC_*).
//   3. Set SUPABASE_AREAS=counters  (or DATA_BACKEND=supabase for a full cutover).
//
// All counters FAIL OPEN: if the RPC errors, callers fall back to "allow", exactly
// like the Firestore path, so a Supabase blip never blocks a real patient.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let _sb: SupabaseClient | null = null

// Lazy service-role client. Bypasses RLS — server-only. Throws if unconfigured so
// callers (which are all wrapped in try/catch + fail-open) degrade gracefully.
export function getSupabaseAdmin(): SupabaseClient {
  if (_sb) return _sb
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("Supabase admin not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
  }
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _sb
}

// Is a given migration "area" served by Supabase yet? Granular per-area opt-in so
// we never flip more than intended. DATA_BACKEND=supabase is a global override for
// the eventual full cutover.
export function supabaseEnabled(area: string): boolean {
  if ((process.env.DATA_BACKEND || "firebase").toLowerCase() === "supabase") return true
  return (process.env.SUPABASE_AREAS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .includes(area)
}

// Which migration "area" each collection belongs to. Flip an area with SUPABASE_AREAS
// (comma list) or DATA_BACKEND=supabase (everything).
//   counters  — ephemeral; LIVE in prod. The doc reads here (getPortalStats reads
//               whatsapp_send_budget) must route to Supabase too, to match the RPC writes.
//   wa_state  — bot-EXCLUSIVE state (never written by the dashboard browser); safe to
//               flip on its own after its data is exported.
//   domain    — shared by dashboard + bot; only flip once the dashboard data layer is
//               also on Supabase (otherwise writes split across two DBs).
const COLLECTION_AREA: Record<string, string> = {
  whatsapp_deliveries: "counters",
  whatsapp_send_budget: "counters",
  whatsapp_abuse: "counters",
  whatsapp_ai_budget: "counters",
  chat_rate_limits: "counters",
  whatsapp_sessions: "wa_state",
  whatsapp_config: "wa_state",
  whatsapp_staff: "wa_state",
  whatsapp_blocks: "wa_state",
  callback_requests: "wa_state",
  patients: "domain",
  appointments: "domain",
  invoices: "domain",
  lab_cases: "domain",
  activity_logs: "domain",
  // `users` is intentionally its OWN area (not "domain"): it backs login/role checks
  // (middleware isAuthorizedStaff, AuthContext). Kept on Firestore so the domain flip
  // never disturbs auth. Tiny + rarely changes, so negligible Firestore cost.
  users: "users_domain",
}

export function supabaseCollectionEnabled(name: string): boolean {
  const area = COLLECTION_AREA[name]
  return area ? supabaseEnabled(area) : false
}

// ── Counter RPC wrappers (1:1 with the antiBan.ts / sessionService.ts logic) ──

export async function rpcAlreadyHandled(deliveryId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("wa_already_handled", { p_id: deliveryId })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function rpcWithinSendBudget(
  contactKey: string
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("wa_within_send_budget", { p_contact: contactKey })
  if (error) throw new Error(error.message)
  return data as { ok: boolean; reason?: string }
}

export async function rpcAssessInbound(
  sessionKey: string,
  text: string
): Promise<{ allow: boolean; health: "green" | "yellow" | "red"; strikes: number; reason: string | null }> {
  const { data, error } = await getSupabaseAdmin().rpc("wa_assess_inbound", {
    p_session: sessionKey,
    p_text: text,
  })
  if (error) throw new Error(error.message)
  return data as { allow: boolean; health: "green" | "yellow" | "red"; strikes: number; reason: string | null }
}

export async function rpcWithinAiBudget(): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("wa_within_ai_budget", {})
  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function rpcCheckRateLimit(sessionId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("wa_check_rate_limit", { p_id: sessionId })
  if (error) throw new Error(error.message)
  return Boolean(data)
}
