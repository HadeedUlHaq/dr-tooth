// One-off / re-runnable data export: Firestore -> Supabase.
//
// Safe: READ-ONLY on Firestore; UPSERTs into Supabase (idempotent — re-run any time
// for a delta re-sync before the final flip). Does NOT touch the live app.
//
// Run:  node scripts/migrate-to-supabase.mjs
//       node scripts/migrate-to-supabase.mjs patients appointments   (subset)
//
// Reads creds from .env.local: FIREBASE_ADMIN_PROJECT_ID/_CLIENT_EMAIL/_PRIVATE_KEY,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from "node:fs"
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { createClient } from "@supabase/supabase-js"

// ── Load .env.local (no dotenv dependency) ──
function loadEnv(path = ".env.local") {
  const out = {}
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, eq).trim()] = v
  }
  return out
}
const env = loadEnv()

// Persistent collections only (ephemeral counters live on Supabase already and reset
// naturally, so there is nothing to copy).
const ALL_COLLECTIONS = [
  "patients",
  "appointments",
  "invoices",
  "lab_cases",
  "activity_logs",
  "users",
  "whatsapp_sessions",
  "whatsapp_config",
  "whatsapp_staff",
  "whatsapp_blocks",
  "callback_requests",
]
const collections = process.argv.slice(2).length ? process.argv.slice(2) : ALL_COLLECTIONS

// ── Init Firebase Admin ──
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
  }),
})
const fs = getFirestore()

// ── Init Supabase (service role) ──
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Deep-convert Firestore Timestamps -> ISO strings (what the app's server shim stores
// and what the *_iso generated columns expect). Recurses maps + arrays.
function normalize(value) {
  if (value === null || value === undefined) return value
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value === "object") {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v)
    return out
  }
  return value
}

async function migrate(name) {
  const snap = await fs.collection(name).get()
  const rows = snap.docs.map((d) => ({ id: d.id, data: normalize(d.data()) }))
  const fsCount = rows.length

  // Upsert in batches.
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await sb.from(name).upsert(chunk, { onConflict: "id" })
    if (error) throw new Error(`upsert ${name}: ${error.message}`)
  }

  const { count: sbCount, error: cErr } = await sb.from(name).select("id", { count: "exact", head: true })
  if (cErr) throw new Error(`count ${name}: ${cErr.message}`)

  const ok = sbCount === fsCount ? "✓" : "✗ MISMATCH"
  console.log(`${ok}  ${name.padEnd(20)} firestore=${fsCount}  supabase=${sbCount}`)
  return { name, fsCount, sbCount, ok: sbCount === fsCount }
}

console.log("Exporting Firestore -> Supabase (read-only on Firestore)\n")
const results = []
for (const name of collections) {
  try {
    results.push(await migrate(name))
  } catch (e) {
    console.log(`✗ ERROR ${name}: ${e.message}`)
    results.push({ name, ok: false })
  }
}
const bad = results.filter((r) => !r.ok)
console.log(`\nDone. ${results.length - bad.length}/${results.length} collections match.`)
if (bad.length) {
  console.log("Mismatches:", bad.map((r) => r.name).join(", "))
  process.exit(1)
}
