import { NextRequest, NextResponse } from "next/server"
import { getAdminDb, FieldValue } from "@/lib/whatsapp/firebaseAdmin"
import { verifyFirebaseIdToken } from "@/lib/firebaseToken"
import { newSalt, hashCode, STAFF_COLLECTION } from "@/lib/whatsapp/staffAuth"

export const runtime = "nodejs"

// Staff-WhatsApp-access management. The middleware already requires a valid STAFF
// token for /api/whatsapp/*; these routes additionally require the ADMIN role
// (re-verify the bearer, read users/<uid>.role). Codes are stored hashed and are
// never returned to the client.
export async function requireAdmin(
  req: NextRequest
): Promise<{ ok: true; uid: string } | { ok: false; res: NextResponse }> {
  const authz = req.headers.get("authorization") || ""
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : ""
  const claims = token ? await verifyFirebaseIdToken(token) : null
  if (!claims) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }
  try {
    const snap = await getAdminDb().collection("users").doc(claims.sub).get()
    if (!snap.exists || String(snap.data()?.role || "") !== "admin") {
      return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
    }
  } catch {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  return { ok: true, uid: claims.sub }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res
  const snap = await getAdminDb().collection(STAFF_COLLECTION).get()
  const staff = snap.docs
    .map((d) => {
      const x = d.data() as Record<string, unknown>
      return {
        id: d.id,
        name: x.name ?? "",
        role: x.role === "receptionist" ? "receptionist" : "doctor",
        phone: x.phone ?? "",
        active: x.active !== false,
        createdAt: x.createdAt ?? null,
      }
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  return NextResponse.json({ staff })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res
  const body = (await req.json()) as { name?: string; role?: string; phone?: string; code?: string }
  const name = String(body.name ?? "").trim()
  const role = body.role === "receptionist" ? "receptionist" : "doctor"
  // Store the phone as entered; matching at login uses samePhone (last-9 tolerant).
  const phone = String(body.phone ?? "").trim()
  const code = String(body.code ?? "").trim()

  if (!name || !phone.replace(/\D/g, "") || !code) {
    return NextResponse.json({ error: "name, phone and code are required" }, { status: 400 })
  }
  if (code.length < 4) {
    return NextResponse.json({ error: "code must be at least 4 characters" }, { status: 400 })
  }

  const salt = newSalt()
  const ref = await getAdminDb().collection(STAFF_COLLECTION).add({
    name,
    role,
    phone,
    codeHash: hashCode(code, salt),
    codeSalt: salt,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: gate.uid,
  })
  return NextResponse.json({ id: ref.id })
}
