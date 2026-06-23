import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Server-side Supabase client bound to the request's cookies, for Server
// Components / Route Handlers that act AS THE SIGNED-IN USER (RLS-enforced).
// Uses the publishable (anon) key — RLS still applies. For privileged bot/cron
// writes that must bypass RLS, use createAdminClient() below instead.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component (read-only cookies). Safe to
            // ignore when a middleware refreshes the session; see utils/supabase/middleware.ts.
          }
        },
      },
    }
  )
}

// Privileged server client using the SERVICE ROLE key. Bypasses RLS — use ONLY in
// trusted server code (the WhatsApp/chat bot, cron jobs, webhook) that the patient
// never authenticates to. The service-role key MUST be a server-only env var
// (SUPABASE_SERVICE_ROLE_KEY, NOT NEXT_PUBLIC_*) so it is never sent to the browser.
//
// Lazy import of supabase-js keeps this file importable in edge/runtime contexts
// that only need the SSR client above.
export function createAdminClient() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js")
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
