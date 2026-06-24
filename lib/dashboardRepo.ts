"use client"

// Client-side data layer for the dashboard when running on Supabase. Branched into
// the existing lib/*Service.ts files behind NEXT_PUBLIC_DATA_BACKEND === "supabase"
// (browser-visible flag, flipped together with the server's DATA_BACKEND/SUPABASE_AREAS
// for the domain area). Uses the Firebase-token-bridged browser client, so every
// read/write is RLS-gated to the signed-in staff member. Cross-tab/dashboard live
// refresh uses Supabase Broadcast (not postgres_changes) so it does not depend on
// database publication setup or Firebase-token Realtime joins.
//
// Rows are shaped { id, data }, where data is the document with original field names
// (timestamps already ISO strings) — so mapRow just spreads data over the id.

import { getDashboardSupabase } from "@/utils/supabase/browser"
import { getDashboardRealtimeSupabase } from "@/utils/supabase/realtime"

export const dashboardUsesSupabase = process.env.NEXT_PUBLIC_DATA_BACKEND === "supabase"

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
const TABLE_CHANGE_TOPIC = "dashboard_table_changes"
const TABLE_CHANGE_EVENT = "table_changed"
const POLL_FALLBACK_MS = 20_000

type TableChangePayload = {
  table: string
  at: string
}

type RealtimeChannel = ReturnType<ReturnType<typeof getDashboardRealtimeSupabase>["channel"]>

let tableChangeChannel: RealtimeChannel | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
const tableListeners = new Map<string, Set<() => void>>()

export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(20))
  let s = ""
  for (let i = 0; i < 20; i++) s += ID_ALPHABET[b[i] % ID_ALPHABET.length]
  return s
}

function emitTableListeners(table: string): void {
  const seen = new Set<() => void>()
  for (const key of [table, "*"]) {
    const listeners = tableListeners.get(key)
    if (!listeners) continue
    for (const listener of listeners) {
      if (seen.has(listener)) continue
      seen.add(listener)
      listener()
    }
  }
}

function ensureTableChangeSubscription(): void {
  if (tableChangeChannel) return

  const sb = getDashboardRealtimeSupabase()
  tableChangeChannel = sb
    .channel(TABLE_CHANGE_TOPIC)
    .on("broadcast", { event: TABLE_CHANGE_EVENT }, ({ payload }: { payload: TableChangePayload }) => {
      if (payload?.table) emitTableListeners(payload.table)
    })
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[Supabase broadcast] table-change subscription ${status}`, err)
      }
    })

  pollTimer = setInterval(() => {
    for (const table of tableListeners.keys()) emitTableListeners(table)
  }, POLL_FALLBACK_MS)
}

function cleanupTableChangeSubscription(): void {
  if (tableListeners.size > 0) return

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  if (tableChangeChannel) {
    void getDashboardRealtimeSupabase().removeChannel(tableChangeChannel)
    tableChangeChannel = null
  }
}

async function broadcastTableChange(table: string): Promise<void> {
  try {
    const sb = getDashboardRealtimeSupabase()
    const ch = tableChangeChannel ?? sb.channel(TABLE_CHANGE_TOPIC)
    await ch.httpSend(TABLE_CHANGE_EVENT, { table, at: new Date().toISOString() } satisfies TableChangePayload)
    if (!tableChangeChannel) void sb.removeChannel(ch)
    emitTableListeners(table)
  } catch (err) {
    console.error(`[Supabase broadcast] failed to publish ${table} change`, err)
    emitTableListeners(table)
  }
}

export function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

export function mapRow<T>(r: { id: string; data: any }): T {
  return { id: r.id, ...(r.data || {}) } as T
}

export async function sbSelectAll<T>(table: string): Promise<T[]> {
  const { data, error } = await getDashboardSupabase().from(table).select("id,data")
  if (error) throw error
  return (data || []).map((r: any) => mapRow<T>(r))
}

export async function sbGetById<T>(table: string, id: string): Promise<T | null> {
  const { data, error } = await getDashboardSupabase().from(table).select("id,data").eq("id", id).maybeSingle()
  if (error) throw error
  return data ? mapRow<T>(data as any) : null
}

// Run a custom query (filters on the generated/indexed columns: status, date,
// patient_id, created_at_iso, …). `build` receives the supabase query builder.
export async function sbQuery<T>(table: string, build: (q: any) => any): Promise<T[]> {
  const q = build(getDashboardSupabase().from(table).select("id,data"))
  const { data, error } = await q
  if (error) throw error
  return (data || []).map((r: any) => mapRow<T>(r))
}

export async function sbInsert(table: string, data: Record<string, any>): Promise<string> {
  const id = newId()
  const clean = stripUndefined(data)
  if (!clean.createdAt) clean.createdAt = new Date().toISOString()
  const { error } = await getDashboardSupabase().from(table).insert({ id, data: clean })
  if (error) throw error
  void broadcastTableChange(table)
  return id
}

// Merge top-level fields into the existing document (read-modify-write; dashboard
// writes are low-frequency staff actions). Keys listed in `remove` are deleted from
// the document (mirrors Firestore deleteField()).
export async function sbUpdate(
  table: string,
  id: string,
  patch: Record<string, any>,
  remove: string[] = []
): Promise<void> {
  const sb = getDashboardSupabase()
  const { data: existing, error: e1 } = await sb.from(table).select("data").eq("id", id).maybeSingle()
  if (e1) throw e1
  const merged: Record<string, any> = {
    ...((existing as any)?.data || {}),
    ...stripUndefined(patch),
    updatedAt: new Date().toISOString(),
  }
  for (const k of remove) delete merged[k]
  const { error } = await sb.from(table).update({ data: merged }).eq("id", id)
  if (error) throw error
  void broadcastTableChange(table)
}

export async function sbDelete(table: string, id: string): Promise<void> {
  const { error } = await getDashboardSupabase().from(table).delete().eq("id", id)
  if (error) throw error
  void broadcastTableChange(table)
}

export async function sbDeleteAll(table: string): Promise<void> {
  // Delete every row (used by clearAllActivities). neq on a never-null PK matches all.
  const { error } = await getDashboardSupabase().from(table).delete().neq("id", "")
  if (error) throw error
  void broadcastTableChange(table)
}

// Subscribe to app-level change broadcasts for a table and invoke cb (the dashboard
// pattern: refetch on change). Returns an unsubscribe fn. This deliberately does
// not use postgres_changes, so it is unaffected by Supabase publication/RLS setup.
export function sbSubscribe(table: string, cb: () => void): () => void {
  const listeners = tableListeners.get(table) ?? new Set<() => void>()
  listeners.add(cb)
  tableListeners.set(table, listeners)
  ensureTableChangeSubscription()

  return () => {
    const current = tableListeners.get(table)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) tableListeners.delete(table)
    cleanupTableChangeSubscription()
  }
}
