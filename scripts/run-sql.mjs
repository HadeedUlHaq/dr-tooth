// Runs a .sql file against the Supabase Postgres using DATABASE_URL from .env.local.
// Usage: node scripts/run-sql.mjs supabase/migrations/0006_fix_tpa_roles.sql
import { readFileSync } from "node:fs"
import pg from "pg"

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
const url = env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL missing in .env.local")
  process.exit(1)
}
const file = process.argv[2]
if (!file) {
  console.error("usage: node scripts/run-sql.mjs <file.sql>")
  process.exit(1)
}

// Parse postgresql://USER:PASS@HOST:PORT/DB by hand (robust to '@'/':' in the
// password, which break the URL parser). Split userinfo on the LAST '@'.
function parsePg(u) {
  const s = u.replace(/^postgres(ql)?:\/\//, "")
  const at = s.lastIndexOf("@")
  const userinfo = s.slice(0, at)
  const hostpart = s.slice(at + 1)
  const ci = userinfo.indexOf(":")
  const user = userinfo.slice(0, ci)
  const password = userinfo.slice(ci + 1)
  const [hostport, database = "postgres"] = hostpart.split("/")
  const [host, port = "5432"] = hostport.split(":")
  return { user, password, host, port: Number(port), database }
}

let cfg = parsePg(url)
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0]
// If the host still has the unreplaced <region> placeholder, fall back to the
// region-less DIRECT host (user 'postgres').
if (/<region>/.test(cfg.host) && ref) {
  console.log(`(host had <region> placeholder — using direct host db.${ref}.supabase.co)`)
  cfg = { ...cfg, host: `db.${ref}.supabase.co`, user: "postgres" }
}
console.log(`connecting host=${cfg.host} port=${cfg.port} user=${cfg.user} db=${cfg.database}`)

const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const sql = readFileSync(file, "utf8")
  await client.query(sql)
  console.log(`✓ applied ${file}`)
} catch (e) {
  console.error(`✗ ${file}: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
