import { NextResponse } from "next/server"
import { getAllSessions, updateSession, findPatientByPhone } from "@/lib/whatsapp/sessionService"
import { getAdminDb } from "@/lib/whatsapp/firebaseAdmin"
import { resolveContactPhone } from "@/lib/whatsapp/openwaClient"
import { normalizePhone } from "@/lib/whatsapp/phone"
import type { WhatsAppSession } from "@/lib/types"

export const runtime = "nodejs"

export async function GET() {
  try {
    const sessions = await getAllSessions()

    // One-time backfill: resolve the real number for dormant @lid chats that haven't
    // been resolved yet (so old conversations get named without needing a new message).
    // Bounded per request + persisted (phoneResolved) so it's cheap after the first
    // couple of loads.
    try {
      let resolved = 0
      for (const s of sessions) {
        if (resolved >= 8) break
        if (s.phoneResolved || s.realPhone) continue
        if (!s.chatId || !s.chatId.endsWith("@lid")) continue
        const real = await resolveContactPhone(s.chatId)
        resolved++
        const upd: Partial<WhatsAppSession> = { phoneResolved: true, realPhone: real }
        if (real) {
          if (!s.patientPhone) upd.patientPhone = real
          if (!s.patientId) {
            const m = await findPatientByPhone(real)
            if (m) {
              upd.patientId = m.id
              upd.patientName = m.name
            }
          }
        }
        await updateSession(s.phoneNumber, upd)
        s.phoneResolved = true
        s.realPhone = real
        if (real && !s.patientPhone) s.patientPhone = real
        if (upd.patientName) s.patientName = upd.patientName
      }
    } catch (resolveErr) {
      console.error("[WhatsApp Sessions backfill]", String(resolveErr))
    }

    // Display enrichment: for any conversation without a name, look it up in the
    // patients directory by (normalised) phone and show the patient's name instead
    // of "Guest". One patients read + in-memory match; does not modify stored data.
    try {
      const snap = await getAdminDb().collection("patients").limit(5000).get()
      // Key by the last 9 digits so stray trunk-0s / country-code quirks still match
      // (e.g. a record saved "+4407774067432" matches the resolved "447774067432").
      const last9 = (v: unknown): string => {
        const n = normalizePhone(v)
        return n.length >= 9 ? n.slice(-9) : n
      }
      const byPhone = new Map<string, string>()
      for (const d of snap.docs) {
        const k = last9(d.data().phone)
        if (k) byPhone.set(k, d.data().name as string)
      }
      for (const s of sessions) {
        if (s.patientName) continue
        const cand = s.realPhone || s.patientPhone
        const name = cand ? byPhone.get(last9(cand)) : undefined
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
