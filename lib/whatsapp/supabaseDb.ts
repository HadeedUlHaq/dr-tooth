// Supabase-backed implementation of the firebase-admin-compatible surface that
// lib/whatsapp/firebaseAdmin.ts exposes via getAdminDb(). It mirrors only the
// methods the server actually uses (verified against tools.ts / sessionService.ts
// / cron): doc get/set/update/delete, collection.add, and Query
// where(==,in,range) / orderBy (incl. documentId) / startAt+endAt (prefix search)
// / limit. runTransaction is NOT implemented — the only transaction callers are the
// 5 counters, which branch to Postgres RPCs before reaching here.
//
// Each Firestore collection maps to a table shaped (id text pk, data jsonb, …).
// `data` is the exact document (camelCase preserved), so snapshots .data() returns
// the document object unchanged — identical to the Firestore REST shim.

import { getSupabaseAdmin } from "./supabaseAdmin"

// FieldValue.serverTimestamp() sentinel (shared with firebaseAdmin). We replace it
// with an ISO string on write — exactly what the REST shim stores.
export const SB_SERVER_TIMESTAMP = Symbol.for("drtooth.serverTimestamp")

function materialize(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === SB_SERVER_TIMESTAMP ? new Date().toISOString() : v
  }
  return out
}

// camelCase document field -> generated/indexed column. Fields not listed fall
// back to a jsonb path expression (data->>field), which still works (just not
// index-backed). Most filtered/ordered fields are mapped, so indexes are used.
const COLUMN_MAP: Record<string, Record<string, string>> = {
  patients: { phone: "phone", name: "name" },
  appointments: { date: "date", time: "time", status: "status", doctorId: "doctor_id", patientPhone: "patient_phone" },
  invoices: { patientName: "patient_name", patientId: "patient_id", appointmentId: "appointment_id", createdAt: "created_at_iso" },
  lab_cases: { patientId: "patient_id", patientName: "patient_name", createdAt: "created_at_iso" },
  activity_logs: { createdAt: "created_at_iso" },
  users: { role: "role", email: "email" },
  whatsapp_sessions: { lastActiveAt: "last_active_at_iso" },
  whatsapp_staff: { phone: "phone", active: "active" },
  whatsapp_blocks: { date: "date" },
  callback_requests: { createdAt: "created_at_iso" },
}

const DOCUMENT_ID_FIELD = "__name__"

function resolveColumn(collection: string, field: string): string {
  if (field === DOCUMENT_ID_FIELD) return "id"
  const mapped = COLUMN_MAP[collection]?.[field]
  return mapped || `data->>${field}`
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
function newDocId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let s = ""
  for (let i = 0; i < 20; i++) s += ID_ALPHABET[bytes[i] % ID_ALPHABET.length]
  return s
}

// ── Snapshots / references ───────────────────────────────────────────────────

export class SbDocumentSnapshot {
  readonly exists: boolean
  readonly id: string
  readonly ref: SbDocumentReference
  private readonly _data: Record<string, any> | null
  constructor(ref: SbDocumentReference, data: Record<string, any> | null) {
    this.ref = ref
    this.id = ref.id
    this.exists = data !== null
    this._data = data
  }
  data(): Record<string, any> {
    return this._data ? this._data : {}
  }
}

export class SbDocumentReference {
  constructor(
    readonly collection: string,
    readonly id: string
  ) {}

  async get(): Promise<SbDocumentSnapshot> {
    const { data, error } = await getSupabaseAdmin()
      .from(this.collection)
      .select("data")
      .eq("id", this.id)
      .maybeSingle()
    if (error) throw new Error(`Supabase get ${this.collection}/${this.id}: ${error.message}`)
    return new SbDocumentSnapshot(this, data ? ((data as any).data ?? {}) : null)
  }

  // Overwrite (create or replace) the document.
  async set(value: Record<string, any>): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from(this.collection)
      .upsert({ id: this.id, data: materialize(value) }, { onConflict: "id" })
    if (error) throw new Error(`Supabase set ${this.collection}/${this.id}: ${error.message}`)
  }

  // Merge top-level fields; FAILS if the document does not exist (matches
  // firebase-admin update()). Read-modify-write (server processes one message per
  // session sequentially, so the lost-update window is not exercised in practice).
  async update(value: Record<string, any>): Promise<void> {
    const sb = getSupabaseAdmin()
    const { data: existing, error: readErr } = await sb
      .from(this.collection)
      .select("data")
      .eq("id", this.id)
      .maybeSingle()
    if (readErr) throw new Error(`Supabase update(read) ${this.collection}/${this.id}: ${readErr.message}`)
    if (!existing) throw new Error(`Supabase update: no document ${this.collection}/${this.id}`)
    const merged = { ...((existing as any).data ?? {}), ...materialize(value) }
    const { error } = await sb.from(this.collection).update({ data: merged }).eq("id", this.id)
    if (error) throw new Error(`Supabase update ${this.collection}/${this.id}: ${error.message}`)
  }

  async delete(): Promise<void> {
    const { error } = await getSupabaseAdmin().from(this.collection).delete().eq("id", this.id)
    if (error) throw new Error(`Supabase delete ${this.collection}/${this.id}: ${error.message}`)
  }
}

export class SbQuerySnapshot {
  constructor(readonly docs: SbDocumentSnapshot[]) {}
  get empty(): boolean {
    return this.docs.length === 0
  }
  get size(): number {
    return this.docs.length
  }
}

type Filter = { field: string; op: string; value: unknown }
type Order = { field: string; direction: "asc" | "desc" }

export class SbQuery {
  protected filters: Filter[] = []
  protected order: Order | null = null
  protected startVal: unknown = undefined
  protected endVal: unknown = undefined
  protected limitN: number | null = null

  constructor(readonly collection: string) {}

  where(field: string, op: string, value: unknown): this {
    this.filters.push({ field, op, value })
    return this
  }

  orderBy(field: string | { __documentId?: boolean }, direction: "asc" | "desc" = "asc"): this {
    const f = typeof field === "object" && (field as any).__documentId ? DOCUMENT_ID_FIELD : (field as string)
    this.order = { field: f, direction }
    return this
  }

  startAt(...values: unknown[]): this {
    this.startVal = values[0]
    return this
  }
  endAt(...values: unknown[]): this {
    this.endVal = values[0]
    return this
  }
  limit(n: number): this {
    this.limitN = n
    return this
  }

  async get(): Promise<SbQuerySnapshot> {
    let q: any = getSupabaseAdmin().from(this.collection).select("id,data")

    for (const f of this.filters) {
      const c = resolveColumn(this.collection, f.field)
      switch (f.op) {
        case "==": q = q.eq(c, f.value); break
        case "!=": q = q.neq(c, f.value); break
        case ">": q = q.gt(c, f.value); break
        case ">=": q = q.gte(c, f.value); break
        case "<": q = q.lt(c, f.value); break
        case "<=": q = q.lte(c, f.value); break
        case "in": q = q.in(c, f.value as unknown[]); break
        default: q = q.eq(c, f.value)
      }
    }

    if (this.order) {
      const oc = resolveColumn(this.collection, this.order.field)
      // startAt/endAt are inclusive cursors on the order field (prefix search idiom).
      if (this.startVal !== undefined) q = q.gte(oc, this.startVal)
      if (this.endVal !== undefined) q = q.lte(oc, this.endVal)
      q = q.order(oc, { ascending: this.order.direction === "asc" })
    }
    if (this.limitN != null) q = q.limit(this.limitN)

    const { data, error } = await q
    if (error) throw new Error(`Supabase query ${this.collection}: ${error.message}`)
    const docs = (data as any[]).map(
      (row) => new SbDocumentSnapshot(new SbDocumentReference(this.collection, row.id), row.data ?? {})
    )
    return new SbQuerySnapshot(docs)
  }
}

export class SbCollectionReference extends SbQuery {
  doc(id: string): SbDocumentReference {
    return new SbDocumentReference(this.collection, id)
  }
  async add(value: Record<string, any>): Promise<SbDocumentReference> {
    const id = newDocId()
    const { error } = await getSupabaseAdmin()
      .from(this.collection)
      .insert({ id, data: materialize(value) })
    if (error) throw new Error(`Supabase add ${this.collection}: ${error.message}`)
    return new SbDocumentReference(this.collection, id)
  }
}

export class SbFirestore {
  collection(name: string): SbCollectionReference {
    return new SbCollectionReference(name)
  }
  async runTransaction<T>(_fn: unknown): Promise<T> {
    throw new Error(
      "SbFirestore.runTransaction is not implemented — counter transactions use Postgres RPCs (see supabaseAdmin.ts)."
    )
  }
}

let _sbDb: SbFirestore | null = null
export function getSupabaseDb(): SbFirestore {
  if (!_sbDb) _sbDb = new SbFirestore()
  return _sbDb
}
