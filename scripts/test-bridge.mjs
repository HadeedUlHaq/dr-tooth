// Tests the Firebase -> Supabase Third-Party Auth bridge end-to-end WITHOUT a
// browser: mint a real Firebase ID token for a staff uid (admin custom token ->
// exchange for ID token), then call Supabase REST as that user and see if RLS lets
// the patients through. Read-only.
import { readFileSync } from "node:fs"
import { initializeApp, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

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

const FIREBASE_WEB_API_KEY = "AIzaSyA_WaKoumy4DSXsIPs2GPgmldvCAupfOg4"
const SUPA_URL = "https://cflrtbpmujrsvruncqwj.supabase.co"
const SUPA_PUB = "sb_publishable_ZE-3RHcmoqjIuUwP8yesyg_RtA7NAzX"
const STAFF_UID = "hNhocP4U9tWgXQbviRY68bQBcaf1" // hadeedulhaq@gmail.com (receptionist)

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
  }),
})

// 1) mint custom token, 2) exchange for a real ID token
const customToken = await getAuth().createCustomToken(STAFF_UID)
const exch = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
)
const exchJson = await exch.json()
const idToken = exchJson.idToken
if (!idToken) {
  console.log("FAILED to mint ID token:", JSON.stringify(exchJson))
  process.exit(1)
}
// decode payload (no verify) to show iss/aud/sub Supabase will check
const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString())
console.log("ID token claims: iss=%s aud=%s sub=%s", payload.iss, payload.aud, payload.sub)

// 3) call Supabase as this Firebase user
const r = await fetch(`${SUPA_URL}/rest/v1/patients?select=id,data&limit=2`, {
  headers: { apikey: SUPA_PUB, Authorization: `Bearer ${idToken}` },
})
console.log("SUPABASE patients STATUS:", r.status)
console.log("SUPABASE patients BODY:", (await r.text()).slice(0, 300))

// Diagnostic: what does Supabase see for this token? (needs 0006 applied)
const w = await fetch(`${SUPA_URL}/rest/v1/rpc/debug_whoami`, {
  method: "POST",
  headers: { apikey: SUPA_PUB, Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
  body: "{}",
})
console.log("debug_whoami STATUS:", w.status, "BODY:", (await w.text()).slice(0, 300))
