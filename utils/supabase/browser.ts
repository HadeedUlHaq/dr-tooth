"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { auth } from "@/lib/firebase"
import { getSupabasePublishableKey, getSupabaseUrl } from "./env"

// Dashboard Supabase client that authenticates with the signed-in user's FIREBASE
// ID token (Third-Party Auth). Supabase validates the token against Firebase's
// public keys, so RLS (is_staff(), keyed on the Firebase uid in public.users) and
// Realtime both authorize off the existing Firebase login — no Supabase passwords,
// no shadow accounts.
//
// Prereq (one-time, in the Supabase dashboard): Authentication → Third-Party Auth →
// add Firebase with project id `dr-tooth-dental-clinic`, and run
// supabase/migrations/0004_thirdparty_auth_rls.sql.
//
// The `accessToken` callback is consulted for every REST request AND the Realtime
// socket, so live subscriptions stay authenticated as the Firebase user.
let _client: SupabaseClient | null = null

async function getFirebaseIdToken(): Promise<string | null> {
  if (!auth) return null
  await auth.authStateReady()
  const user = auth.currentUser
  return user ? await user.getIdToken() : null
}

export function getDashboardSupabase(): SupabaseClient {
  if (_client) return _client
  _client = createClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      accessToken: async () => {
        return getFirebaseIdToken()
      },
    }
  )
  return _client
}
