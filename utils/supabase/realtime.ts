"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getSupabasePublishableKey, getSupabaseUrl } from "./env"

let _client: SupabaseClient | null = null

// Public Realtime-only client. It intentionally does not use the Firebase token
// bridge, so notification fan-out is not coupled to Supabase DB RLS/JWT handling.
export function getDashboardRealtimeSupabase(): SupabaseClient {
  if (_client) return _client
  _client = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  return _client
}
