"use client"

// Client-side data layer for the dashboard when running on Supabase. Branched into
// the existing lib/*Service.ts files behind NEXT_PUBLIC_DATA_BACKEND === "supabase"
// (browser-visible flag, flipped together with the server's DATA_BACKEND/SUPABASE_AREAS
// for the domain area). Uses the Firebase-token-bridged browser client, so every
// read/write/Realtime subscription is RLS-gated to the signed-in staff member.
//
// Rows are shaped { id, data }, where data is the document with original field names
// (timestamps already ISO strings) — so mapRow just spreads data over the id.

import { getDashboardSupabase } from "@/utils/supabase/browser"

export const dashboardUsesSupabase = process.env.NEXT_PUBLIC_DATA_BACKEND === "supabase"

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(20))
  let s = ""
  for (let i = 0; i < 20; i++) s += ID_ALPHABET[b[i] % ID_ALPHABET.length]
  return s
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
}

export async function sbDelete(table: string, id: string): Promise<void> {
  const { error } = await getDashboardSupabase().from(table).delete().eq("id", id)
  if (error) throw error
}

export async function sbDeleteAll(table: string): Promise<void> {
  // Delete every row (used by clearAllActivities). neq on a never-null PK matches all.
  const { error } = await getDashboardSupabase().from(table).delete().neq("id", "")
  if (error) throw error
}

// Subscribe to any change on a table and invoke cb (the dashboard pattern: refetch on
// change). Returns an unsubscribe fn. Realtime auth rides the Firebase-token bridge.
export function sbSubscribe(table: string, cb: () => void): () => void {
  const sb = getDashboardSupabase()
  let cancelled = false
  let ch: ReturnType<typeof sb.channel> | null = null

  const start = async () => {
    try {
      // Supabase Realtime reads the token from the socket when the channel joins.
      // With Firebase Third-Party Auth, force a fresh token onto the socket first.
      await sb.realtime.setAuth()
      if (cancelled) return

      ch = sb
        .channel(`rt_${table}_${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, () => cb())
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`[Supabase realtime] ${table} subscription ${status}`, err)
          }
        })
    } catch (err) {
      console.error(`[Supabase realtime] failed to subscribe to ${table}`, err)
    }
  }

  void start()
  return () => {
    cancelled = true
    if (ch) void sb.removeChannel(ch)
  }
}
