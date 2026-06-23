// Validates the query shapes the Supabase adapter (lib/whatsapp/supabaseDb.ts)
// generates, against the real exported data. Read-only. Does not touch prod.
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

function loadEnv(p = ".env.local") {
  const o = {}
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || l.startsWith("#")) continue
    const i = l.indexOf("=")
    if (i === -1) continue
    let v = l.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    o[l.slice(0, i).trim()] = v
  }
  return o
}
const env = loadEnv()
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function show(label, { data, error, count }) {
  if (error) return console.log(`✗ ${label}: ${error.message}`)
  const n = count ?? (Array.isArray(data) ? data.length : data ? 1 : 0)
  const sample = Array.isArray(data) ? data.slice(0, 2).map((r) => r.data?.name || r.id) : data?.id
  console.log(`✓ ${label}: ${n}${sample ? "  e.g. " + JSON.stringify(sample) : ""}`)
}

// orderBy("name").startAt(x).endAt(x+high) — patient prefix search (mapped column)
const firstPatient = await sb.from("patients").select("id,data").order("name").limit(1).single()
const prefix = (firstPatient.data?.data?.name || "A").slice(0, 1)
show("patients orderBy name asc limit 3", await sb.from("patients").select("id,data").order("name").limit(3))
show(
  `patients name prefix '${prefix}' (startAt/endAt)`,
  await sb.from("patients").select("id,data").gte("name", prefix).lte("name", prefix + "￿").order("name").limit(5)
)
// jsonb-path fallback filter (unmapped field)
const knownName = firstPatient.data?.data?.name
show(
  "patients where data->>name == (jsonb path)",
  await sb.from("patients").select("id,data").eq("data->>name", knownName)
)
// appointments where status in [...]
show(
  "appointments where status in [scheduled,confirmed]",
  await sb.from("appointments").select("id", { count: "exact", head: true }).in("status", ["scheduled", "confirmed"])
)
// appointments where date == (range/eq on mapped col)
const anAppt = await sb.from("appointments").select("data").limit(1).single()
const aDate = anAppt.data?.data?.date
if (aDate) show(`appointments where date == ${aDate}`, await sb.from("appointments").select("id,data").eq("date", aDate))
// sessions orderBy lastActiveAt desc limit (getAllSessions)
show(
  "whatsapp_sessions orderBy last_active desc limit 100",
  await sb.from("whatsapp_sessions").select("id,data").order("last_active_at_iso", { ascending: false }).limit(100)
)
// config doc get
show("whatsapp_config doc 'bot'", await sb.from("whatsapp_config").select("id,data").eq("id", "bot").maybeSingle())
// invoices orderBy created_at_iso desc (getInvoices)
show(
  "invoices orderBy created_at_iso desc",
  await sb.from("invoices").select("id,data").order("created_at_iso", { ascending: false }).limit(5)
)
console.log("\nValidation complete.")
