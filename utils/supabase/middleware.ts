import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabasePublishableKey, getSupabaseUrl } from "./env"

// Refreshes the Supabase auth session (rotates the access/refresh-token cookies)
// on each request, and returns the response with the updated cookies attached.
// Call this from the root middleware (middleware.ts) ONCE Supabase Auth is live
// (Phase 3). Until then it is unused, so it changes nothing.
//
// IMPORTANT: do not run other logic between createServerClient and getUser() — the
// @supabase/ssr docs warn it can cause hard-to-debug session bugs.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Touch the session so expired access tokens are refreshed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabaseResponse, user }
}
