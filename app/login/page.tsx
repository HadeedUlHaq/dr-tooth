"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import { ToothLogo } from "@/components/ui-kit/ToothLogo"
import { LockKeyhole, Mail } from "lucide-react"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { login, loading: authLoading } = useAuth()
  const router = useRouter()

  // Don't proceed with login if auth is still loading
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (authLoading) return

    setError("")
    setLoading(true)

    try {
      await login(email, password)
      router.push("/dashboard")
    } catch (error: any) {
      setError(error.message || "Failed to log in")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-lg border border-white/[0.1] bg-[#0A2228]/92 p-6 shadow-[0_1px_0_rgba(255,255,255,0.06),0_20px_48px_rgba(0,0,0,0.32)] sm:p-8">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-[#22D3EE]/25 bg-[#0891B2]/12 shadow-[0_12px_28px_rgba(8,145,178,0.18)]">
            <ToothLogo className="h-8 w-8 text-[#22D3EE]" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#F0FCFF]">
            Dr Tooth Dental Clinic
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#A9BFC5]">Secure staff access for appointments, patients, invoices, and clinic operations.</p>
        </div>

        <h2 className="mb-6 text-center text-xl font-semibold text-[#F0FCFF]">Staff login</h2>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4">
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-[#A9BFC5]">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E989F]" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-white/10 bg-[#082127] px-3 py-2.5 pl-10 text-sm text-[#F0FCFF] placeholder:text-[#7E989F] transition-colors focus:border-[#22D3EE] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/25"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-[#A9BFC5]">
              Password
            </label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E989F]" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-white/10 bg-[#082127] px-3 py-2.5 pl-10 text-sm text-[#F0FCFF] placeholder:text-[#7E989F] transition-colors focus:border-[#22D3EE] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/25"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] w-full rounded-lg bg-[#0891B2] px-4 py-2.5 font-medium text-white shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_6px_18px_rgba(8,145,178,0.22),inset_0_1px_0_0_rgba(255,255,255,0.14)] transition-colors hover:bg-[#0E7490] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/60 focus:ring-offset-2 focus:ring-offset-[#061417] disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </main>
  )
}
