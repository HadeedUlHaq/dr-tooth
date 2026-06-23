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
  console.error("DATABASE_URL missing in .env.local (Supabase → Settings → Database → Connection string → URI)")
  process.exit(1)
}
const file = process.argv[2]
if (!file) {
  console.error("usage: node scripts/run-sql.mjs <file.sql>")
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
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
