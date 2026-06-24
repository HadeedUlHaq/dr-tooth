import { createBrowserClient } from "@supabase/ssr"
import { getSupabasePublishableKey, getSupabaseUrl } from "./env"

// Browser-side Supabase client for the dashboard (client components / effects).
// Uses ONLY the publishable (anon) key — safe to ship to the browser. All access
// is therefore governed by Row Level Security (see supabase/migrations/*_rls.sql).
// NEVER import a service-role key here.
//
// Phase 1: this helper exists but no caller uses it yet. Dashboard services are
// migrated in Phase 3 behind the DATA_BACKEND flag, so importing this file has no
// effect on the running (Firebase) app.
export function createClient() {
  return createBrowserClient(
    getSupabaseUrl(),
    getSupabasePublishableKey()
  )
}
