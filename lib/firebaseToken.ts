// Verify a Firebase ID token (RS256) using Google's public JWKs + WebCrypto.
// Dependency-free (no firebase-admin) so it runs in edge middleware AND node
// routes — matching this project's "REST + WebCrypto" approach to Firebase.

import { getAdminDb } from "./whatsapp/firebaseAdmin"

const STAFF_ROLES = new Set(["admin", "doctor", "receptionist"])

// A valid token is not enough — the uid must be a PROVISIONED staff member, i.e.
// have a users/<uid> doc with a staff role. This blocks anyone who self-creates a
// Firebase Auth account (the web API key is public) from reaching the portal APIs.
// Fails CLOSED on error (deny) — correct for an auth gate.
export async function isAuthorizedStaff(uid: string): Promise<boolean> {
  try {
    const snap = await getAdminDb().collection("users").doc(uid).get()
    if (!snap.exists) return false
    return STAFF_ROLES.has(String(snap.data().role || ""))
  } catch (err) {
    console.error("[isAuthorizedStaff] error", String(err))
    return false
  }
}

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

type Jwk = { kid: string; n: string; e: string; kty: string; alg?: string }
let _jwks: { keys: Jwk[]; expiresAt: number } | null = null

async function getJwks(): Promise<Jwk[]> {
  if (_jwks && Date.now() < _jwks.expiresAt) return _jwks.keys
  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const json = (await res.json()) as { keys: Jwk[] }
  const cc = res.headers.get("cache-control") || ""
  const m = cc.match(/max-age=(\d+)/)
  const ttl = m ? Number(m[1]) * 1000 : 3_600_000
  _jwks = { keys: json.keys, expiresAt: Date.now() + ttl }
  return json.keys
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/")
  while (s.length % 4) s += "="
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s))
}

export interface FirebaseClaims {
  sub: string
  email?: string
  [k: string]: unknown
}

// Returns the decoded claims if the token is a valid, unexpired Firebase ID token
// for THIS project, else null. Validates signature + iss/aud/exp/sub.
export async function verifyFirebaseIdToken(token: string): Promise<FirebaseClaims | null> {
  try {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
    if (!projectId || !token) return null
    const parts = token.split(".")
    if (parts.length !== 3) return null

    const header = JSON.parse(b64urlToString(parts[0])) as { kid?: string; alg?: string }
    if (header.alg !== "RS256" || !header.kid) return null

    const jwk = (await getJwks()).find((k) => k.kid === header.kid)
    if (!jwk) return null

    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    )
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), signed)
    if (!ok) return null

    const claims = JSON.parse(b64urlToString(parts[1])) as FirebaseClaims & {
      iss?: string
      aud?: string
      exp?: number
    }
    const now = Math.floor(Date.now() / 1000)
    if (claims.aud !== projectId) return null
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) return null
    if (!claims.exp || claims.exp < now) return null
    if (!claims.sub) return null
    return claims
  } catch (err) {
    console.error("[verifyFirebaseIdToken] error", String(err))
    return null
  }
}
