import { supabaseCollectionEnabled } from "./supabaseAdmin"
import { getSupabaseDb } from "./supabaseDb"

// Firestore access for the WhatsApp/chat agent, implemented against the Firestore
// REST API rather than `firebase-admin`.
//
// Why: the Admin SDK pulls in `protobufjs`, whose codegen calls `new Function()`
// at module-evaluation time. The Cloudflare Workers (workerd) runtime forbids
// runtime code generation ("EvalError: Code generation from strings disallowed"),
// so merely bundling firebase-admin into the worker poisons the whole server
// bundle and every route returns 500. `preferRest:true` does not help — the
// protobufjs module is still evaluated on import.
//
// This module talks to Firestore over plain HTTPS + JSON using a service-account
// OAuth token minted with WebCrypto (all of which workerd supports). It exposes a
// small subset of the firebase-admin Firestore API — only the methods the agent
// actually uses — so the call sites in tools.ts / sessionService.ts are unchanged.

// ──────────────────────────────────────────────────────────────────────────
// Credentials & auth
// ──────────────────────────────────────────────────────────────────────────

function getProjectId(): string {
  return process.env.FIREBASE_ADMIN_PROJECT_ID!
}

function getClientEmail(): string {
  return process.env.FIREBASE_ADMIN_CLIENT_EMAIL!
}

function getPrivateKeyPem(): string {
  // Strip any accidental wrapping quotes (dotenv strips them locally, but a value
  // pasted into a Cloudflare secret keeps them) before fixing escaped newlines.
  return process.env
    .FIREBASE_ADMIN_PRIVATE_KEY!.replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n")
}

const te = new TextEncoder()

function bytesToB64url(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function strToB64url(str: string): string {
  return bytesToB64url(te.encode(str))
}

// Decode a PEM PKCS#8 private key into the DER bytes WebCrypto expects.
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "")
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

let _token: { value: string; expiresAt: number } | null = null
let _signingKey: CryptoKey | null = null

async function getSigningKey(): Promise<CryptoKey> {
  if (_signingKey) return _signingKey
  _signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(getPrivateKeyPem()),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return _signingKey
}

// Mint (and cache) a Google OAuth2 access token via the service-account JWT-bearer
// flow. Scope is limited to Firestore (`datastore`).
async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt - 60_000) return _token.value

  const iat = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const claim = {
    iss: getClientEmail(),
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  }
  const signingInput = `${strToB64url(JSON.stringify(header))}.${strToB64url(JSON.stringify(claim))}`
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await getSigningKey(),
    te.encode(signingInput)
  )
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  if (!res.ok) {
    throw new Error(`Failed to mint Firestore access token: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  _token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return _token.value
}

function documentsBase(): string {
  return `https://firestore.googleapis.com/v1/projects/${getProjectId()}/databases/(default)/documents`
}

async function fsFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
}

async function fsJson(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fsFetch(url, init)
  if (!res.ok) {
    throw new Error(`Firestore ${init.method || "GET"} ${url} failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

// ──────────────────────────────────────────────────────────────────────────
// Value encoding / decoding (Firestore typed-value JSON)
// ──────────────────────────────────────────────────────────────────────────

// Sentinel returned by FieldValue.serverTimestamp(). We encode it as the current
// time as a real Firestore timestamp, which keeps the stored type identical to
// what the rest of the app (which uses serverTimestamp) writes.
// Shared sentinel (Symbol.for) so the Supabase adapter recognises the same
// serverTimestamp() value and materialises it to an ISO string on write.
const SERVER_TIMESTAMP = Symbol.for("drtooth.serverTimestamp")

export const FieldValue = {
  serverTimestamp: () => SERVER_TIMESTAMP as unknown,
}

// Sentinel returned by FieldPath.documentId(); orderBy() maps it to "__name__".
const DOCUMENT_ID = { __documentId: true } as const

export const FieldPath = {
  documentId: () => DOCUMENT_ID,
}

type FsValue = Record<string, unknown>

function encodeValue(v: unknown): FsValue {
  if (v === SERVER_TIMESTAMP) return { timestampValue: new Date().toISOString() }
  if (v === null || v === undefined) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === "boolean") return { booleanValue: v }
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  }
  if (typeof v === "string") return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } }
  return { stringValue: String(v) }
}

function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const fields: Record<string, FsValue> = {}
  for (const [k, val] of Object.entries(obj)) fields[k] = encodeValue(val)
  return fields
}

function decodeValue(v: FsValue): unknown {
  if ("nullValue" in v) return null
  if ("booleanValue" in v) return v.booleanValue
  if ("integerValue" in v) return Number(v.integerValue)
  if ("doubleValue" in v) return v.doubleValue
  if ("stringValue" in v) return v.stringValue
  if ("timestampValue" in v) return v.timestampValue // ISO string
  if ("referenceValue" in v) return v.referenceValue
  if ("mapValue" in v) return decodeFields((v.mapValue as any).fields || {})
  if ("arrayValue" in v) return ((v.arrayValue as any).values || []).map(decodeValue)
  if ("geoPointValue" in v) return v.geoPointValue
  if ("bytesValue" in v) return v.bytesValue
  return null
}

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(fields || {})) out[k] = decodeValue(val)
  return out
}

function idFromName(name: string): string {
  return name.substring(name.lastIndexOf("/") + 1)
}

// ──────────────────────────────────────────────────────────────────────────
// Snapshot / reference / query classes (firebase-admin-compatible subset)
// ──────────────────────────────────────────────────────────────────────────

export class DocumentSnapshot {
  readonly exists: boolean
  readonly id: string
  readonly ref: DocumentReference
  private readonly _fields: Record<string, FsValue> | null

  constructor(ref: DocumentReference, fields: Record<string, FsValue> | null) {
    this.ref = ref
    this.id = ref.id
    this.exists = fields !== null
    this._fields = fields
  }

  // Always returns an object (empty when the document does not exist). Call sites
  // guard with `.exists` before relying on the contents, and query results only
  // ever contain existing documents, so this keeps them free of undefined checks.
  data(): Record<string, any> {
    return this._fields ? decodeFields(this._fields) : {}
  }
}

export class DocumentReference {
  constructor(
    readonly collection: string,
    readonly id: string
  ) {}

  get path(): string {
    return `${documentsBase()}/${this.collection}/${encodeURIComponent(this.id)}`
  }

  // Full resource name (used as Firestore reference values / write targets).
  get name(): string {
    return `projects/${getProjectId()}/databases/(default)/documents/${this.collection}/${this.id}`
  }

  async get(): Promise<DocumentSnapshot> {
    const res = await fsFetch(this.path)
    if (res.status === 404) return new DocumentSnapshot(this, null)
    if (!res.ok) throw new Error(`Firestore GET ${this.path} failed: ${res.status} ${await res.text()}`)
    const doc = await res.json()
    return new DocumentSnapshot(this, doc.fields || {})
  }

  // Overwrite (create or replace) the document.
  async set(data: Record<string, any>): Promise<void> {
    await fsJson(this.path, {
      method: "PATCH",
      body: JSON.stringify({ fields: encodeFields(data) }),
    })
  }

  // Merge-update existing fields; fails if the document does not exist (matching
  // firebase-admin's update() semantics).
  async update(data: Record<string, any>): Promise<void> {
    const params = Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join("&")
    await fsJson(`${this.path}?${params}&currentDocument.exists=true`, {
      method: "PATCH",
      body: JSON.stringify({ fields: encodeFields(data) }),
    })
  }

  // Delete the document. A 404 (already gone) is treated as success, matching
  // firebase-admin's idempotent delete().
  async delete(): Promise<void> {
    const res = await fsFetch(this.path, { method: "DELETE" })
    if (!res.ok && res.status !== 404) {
      throw new Error(`Firestore DELETE ${this.path} failed: ${res.status} ${await res.text()}`)
    }
  }
}

export class QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[]) {}
  get empty(): boolean {
    return this.docs.length === 0
  }
  get size(): number {
    return this.docs.length
  }
}

type Filter = { field: string; op: string; value: unknown }
type Order = { field: string; direction: "ASCENDING" | "DESCENDING" }

export class Query {
  protected filters: Filter[] = []
  protected orders: Order[] = []
  protected startVals: unknown[] | null = null
  protected endVals: unknown[] | null = null
  protected limitN: number | null = null

  constructor(readonly collection: string) {}

  where(field: string, op: string, value: unknown): this {
    this.filters.push({ field, op, value })
    return this
  }

  orderBy(field: string | typeof DOCUMENT_ID, direction: "asc" | "desc" = "asc"): this {
    const fieldPath = typeof field === "object" && (field as any).__documentId ? "__name__" : (field as string)
    this.orders.push({ field: fieldPath, direction: direction === "desc" ? "DESCENDING" : "ASCENDING" })
    return this
  }

  startAt(...values: unknown[]): this {
    this.startVals = values
    return this
  }

  endAt(...values: unknown[]): this {
    this.endVals = values
    return this
  }

  limit(n: number): this {
    this.limitN = n
    return this
  }

  // Encode a cursor value against the order field at the same position. When the
  // order is by document id, the cursor must be a reference value (full path).
  private cursorValue(value: unknown, index: number): FsValue {
    const order = this.orders[index]
    if (order && order.field === "__name__") {
      return {
        referenceValue: `projects/${getProjectId()}/databases/(default)/documents/${this.collection}/${value}`,
      }
    }
    return encodeValue(value)
  }

  private buildFilter(f: Filter): FsValue {
    if (f.op === "in") {
      return {
        fieldFilter: {
          field: { fieldPath: f.field },
          op: "IN",
          value: { arrayValue: { values: (f.value as unknown[]).map(encodeValue) } },
        },
      }
    }
    const opMap: Record<string, string> = {
      "==": "EQUAL",
      "<": "LESS_THAN",
      "<=": "LESS_THAN_OR_EQUAL",
      ">": "GREATER_THAN",
      ">=": "GREATER_THAN_OR_EQUAL",
      "!=": "NOT_EQUAL",
    }
    return {
      fieldFilter: {
        field: { fieldPath: f.field },
        op: opMap[f.op] || "EQUAL",
        value: encodeValue(f.value),
      },
    }
  }

  async get(): Promise<QuerySnapshot> {
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId: this.collection }] }

    if (this.filters.length === 1) {
      structuredQuery.where = this.buildFilter(this.filters[0])
    } else if (this.filters.length > 1) {
      structuredQuery.where = {
        compositeFilter: { op: "AND", filters: this.filters.map((f) => this.buildFilter(f)) },
      }
    }
    if (this.orders.length) {
      structuredQuery.orderBy = this.orders.map((o) => ({
        field: { fieldPath: o.field },
        direction: o.direction,
      }))
    }
    if (this.startVals) {
      structuredQuery.startAt = { values: this.startVals.map((v, i) => this.cursorValue(v, i)), before: true }
    }
    if (this.endVals) {
      structuredQuery.endAt = { values: this.endVals.map((v, i) => this.cursorValue(v, i)), before: false }
    }
    if (this.limitN != null) structuredQuery.limit = this.limitN

    const rows: any[] = await fsJson(`${documentsBase()}:runQuery`, {
      method: "POST",
      body: JSON.stringify({ structuredQuery }),
    })

    const docs = rows
      .filter((r) => r.document)
      .map((r) => {
        const ref = new DocumentReference(this.collection, idFromName(r.document.name))
        return new DocumentSnapshot(ref, r.document.fields || {})
      })
    return new QuerySnapshot(docs)
  }
}

export class CollectionReference extends Query {
  doc(id: string): DocumentReference {
    return new DocumentReference(this.collection, id)
  }

  async add(data: Record<string, any>): Promise<DocumentReference> {
    const doc = await fsJson(`${documentsBase()}/${this.collection}`, {
      method: "POST",
      body: JSON.stringify({ fields: encodeFields(data) }),
    })
    return new DocumentReference(this.collection, idFromName(doc.name))
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Transactions
// ──────────────────────────────────────────────────────────────────────────

type Write =
  | { update: { name: string; fields: Record<string, FsValue> } }
  | {
      update: { name: string; fields: Record<string, FsValue> }
      updateMask: { fieldPaths: string[] }
      currentDocument: { exists: boolean }
    }

export class Transaction {
  readonly writes: Write[] = []
  constructor(private readonly token: string) {}

  async get(ref: DocumentReference): Promise<DocumentSnapshot> {
    const res = await fsFetch(`${ref.path}?transaction=${encodeURIComponent(this.token)}`)
    if (res.status === 404) return new DocumentSnapshot(ref, null)
    if (!res.ok) throw new Error(`Firestore tx GET failed: ${res.status} ${await res.text()}`)
    const doc = await res.json()
    return new DocumentSnapshot(ref, doc.fields || {})
  }

  set(ref: DocumentReference, data: Record<string, any>): void {
    this.writes.push({ update: { name: ref.name, fields: encodeFields(data) } })
  }

  update(ref: DocumentReference, data: Record<string, any>): void {
    this.writes.push({
      update: { name: ref.name, fields: encodeFields(data) },
      updateMask: { fieldPaths: Object.keys(data) },
      currentDocument: { exists: true },
    })
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Firestore entry point
// ──────────────────────────────────────────────────────────────────────────

export class Firestore {
  collection(name: string): CollectionReference {
    // Per-collection routing: when a collection's migration area is enabled, serve
    // it from Supabase via the structurally-compatible adapter. Otherwise Firestore.
    if (supabaseCollectionEnabled(name)) {
      return getSupabaseDb().collection(name) as unknown as CollectionReference
    }
    return new CollectionReference(name)
  }

  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const begin = await fsJson(`${documentsBase()}:beginTransaction`, {
      method: "POST",
      body: JSON.stringify({ options: { readWrite: {} } }),
    })
    const token: string = begin.transaction
    const tx = new Transaction(token)
    const result = await fn(tx)
    await fsJson(`${documentsBase()}:commit`, {
      method: "POST",
      body: JSON.stringify({ transaction: token, writes: tx.writes }),
    })
    return result
  }
}

let _db: Firestore | null = null

// Lazy getter — nothing here touches the network or env at module-import time,
// so importing this file is safe in the workerd runtime.
export function getAdminDb(): Firestore {
  if (!_db) _db = new Firestore()
  return _db
}
