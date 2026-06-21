import { NextRequest, NextResponse } from "next/server"
import { getAdminDb, FieldValue } from "@/lib/whatsapp/firebaseAdmin"
import { newSalt, hashCode, STAFF_COLLECTION } from "@/lib/whatsapp/staffAuth"
import { requireAdmin } from "../route"

export const runtime = "nodejs"

// Update a staff member: name / role / phone / active, and reset the code when a
// new `code` is supplied. Admin-only (see requireAdmin).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res
  const { id } = await params
  const body = (await req.json()) as {
    name?: string
    role?: string
    phone?: string
    active?: boolean
    code?: string
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (body.name !== undefined) update.name = String(body.name).trim()
  if (body.role !== undefined) update.role = body.role === "receptionist" ? "receptionist" : "doctor"
  if (body.phone !== undefined) update.phone = String(body.phone).trim()
  if (body.active !== undefined) update.active = !!body.active
  if (body.code) {
    const code = String(body.code).trim()
    if (code.length < 4) {
      return NextResponse.json({ error: "code must be at least 4 characters" }, { status: 400 })
    }
    const salt = newSalt()
    update.codeSalt = salt
    update.codeHash = hashCode(code, salt)
  }

  await getAdminDb().collection(STAFF_COLLECTION).doc(id).update(update)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res
  const { id } = await params
  await getAdminDb().collection(STAFF_COLLECTION).doc(id).delete()
  return NextResponse.json({ ok: true })
}
