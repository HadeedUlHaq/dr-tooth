"use client"

import { auth } from "@/lib/firebase"

// Client fetch wrapper that attaches the signed-in user's Firebase ID token as a
// Bearer header, so the WhatsApp portal API routes (now auth-gated by middleware)
// accept the request. Use this instead of fetch() for any /api/whatsapp/* call.
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const user = auth.currentUser
  const token = user ? await user.getIdToken() : null
  const headers = new Headers(init.headers || {})
  if (token) headers.set("Authorization", `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
