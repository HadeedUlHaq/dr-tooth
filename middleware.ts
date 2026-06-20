import { NextRequest, NextResponse } from "next/server"
import { verifyFirebaseIdToken, isAuthorizedStaff } from "@/lib/firebaseToken"

// Auth gate for the WhatsApp portal APIs (security finding C1). Every
// /api/whatsapp/* route requires a valid Firebase ID token EXCEPT:
//   - /api/whatsapp/webhook  (gateway → app; authenticated by its HMAC signature)
// The public web chat (/api/chat) is not matched here, so it stays public.
const PUBLIC_PREFIXES = ["/api/whatsapp/webhook"]

export const config = {
  matcher: ["/api/whatsapp/:path*"],
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return NextResponse.next()
  }

  const authz = req.headers.get("authorization") || ""
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : ""
  const claims = token ? await verifyFirebaseIdToken(token) : null
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  // Valid token AND a provisioned staff role (blocks self-signup accounts).
  if (!(await isAuthorizedStaff(claims.sub))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  return NextResponse.next()
}
