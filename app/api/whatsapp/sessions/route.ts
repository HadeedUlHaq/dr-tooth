import { NextResponse } from "next/server"
import { getAllSessions } from "@/lib/whatsapp/sessionService"
import { getAdminDb } from "@/lib/whatsapp/firebaseAdmin"
import { normalizePhone } from "@/lib/whatsapp/phone"

export const runtime = "nodejs"

export async function GET() {
  try {
    const sessions = await getAllSessions()

    // Display enrichment: for any conversation without a name, look it up in the
    // patients directory by (normalised) phone and show the patient's name instead
    // of "Guest". One patients read + in-memory match; does not modify stored data.
    try {
      const snap = await getAdminDb().collection("patients").limit(5000).get()
      const byPhone = new Map<string, string>()
      for (const d of snap.docs) {
        const ph = normalizePhone(d.data().phone)
        if (ph) byPhone.set(ph, d.data().name as string)
      }
      for (const s of sessions) {
        if (s.patientName) continue
        const cand = s.realPhone || s.patientPhone
        const name = cand ? byPhone.get(normalizePhone(cand)) : undefined
        if (name) s.patientName = name
      }
    } catch (enrichErr) {
      console.error("[WhatsApp Sessions name enrich]", String(enrichErr))
    }

    return NextResponse.json({ sessions })
  } catch (err) {
    console.error("[WhatsApp Sessions Error]", err)
    return NextResponse.json({ sessions: [], error: String(err) }, { status: 500 })
  }
}
