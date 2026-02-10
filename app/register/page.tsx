"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { UserRole } from "@/lib/types"
import { ShieldCheck, Lock } from "lucide-react"

const REGISTRATION_PASSCODE = "Systems@@123456789"

export default function Register() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [role, setRole] = useState<UserRole>("receptionist")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { register, loading: authLoading } = useAuth()
  const router = useRouter()

  // Passcode gate
  const [passcode, setPasscode] = useState("")
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [passcodeError, setPasscodeError] = useState("")

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPasscodeError("")

    if (passcode === REGISTRATION_PASSCODE) {
      setIsUnlocked(true)
    } else {
      setPasscodeError("Invalid passcode. Contact your administrator.")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (authLoading) return

    setError("")

    if (password !== confirmPassword) {
      return setError("Passwords do not match")
    }

    setLoading(true)

    try {
      await register(email, password, name, role)
      router.push("/dashboard")
    } catch (error: any) {
      setError(error.message || "Failed to create an account")
    } finally {
      setLoading(false)
    }
  }

  // Passcode gate screen
  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] p-8 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
              Dr Tooth Dental Clinic
            </h1>
            <p className="text-[#8A8F98] mt-1">Patient Appointment System</p>
          </div>

          <div className="flex flex-col items-center mb-6">
            <div className="bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 rounded-2xl p-4 mb-4">
              <Lock className="h-8 w-8 text-[#5E6AD2]" />
            </div>
            <h2 className="text-xl font-semibold text-[#EDEDEF]">Protected Registration</h2>
            <p className="text-sm text-[#8A8F98] mt-1 text-center">
              Enter the system passcode to create a new account
            </p>
          </div>

          {passcodeError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
              {passcodeError}
            </div>
          )}

          <form onSubmit={handlePasscodeSubmit}>
            <div className="mb-6">
              <label htmlFor="passcode" className="block text-sm font-medium text-[#8A8F98] mb-1">
                System Passcode
              </label>
              <input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                placeholder="Enter passcode..."
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#5E6AD2] text-white py-2.5 px-4 rounded-lg hover:bg-[#6872D9] focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/50 focus:ring-offset-2 focus:ring-offset-[#050506] transition-colors shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] font-medium"
            >
              Unlock Registration
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-[#8A8F98]">
            Already have an account?{" "}
            <Link href="/login" className="text-[#5E6AD2] hover:text-[#6872D9] transition-colors">
              Login
            </Link>
          </p>
        </div>
      </div>
    )
  }

  // Registration form (only visible after passcode)
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] p-8 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
            Dr Tooth Dental Clinic
          </h1>
          <p className="text-[#8A8F98] mt-1">Patient Appointment System</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <h2 className="text-2xl font-semibold text-[#EDEDEF]">Register</h2>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-[#8A8F98] mb-1">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
              placeholder="John Doe"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-[#8A8F98] mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="role" className="block text-sm font-medium text-[#8A8F98] mb-1">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
              required
            >
              <option value="receptionist">Receptionist</option>
              <option value="doctor">Doctor</option>
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-[#8A8F98] mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#8A8F98] mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5E6AD2] text-white py-2.5 px-4 rounded-lg hover:bg-[#6872D9] focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/50 focus:ring-offset-2 focus:ring-offset-[#050506] disabled:opacity-50 transition-colors shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] font-medium"
          >
            {loading ? "Creating Account..." : "Register"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[#8A8F98]">
          Already have an account?{" "}
          <Link href="/login" className="text-[#5E6AD2] hover:text-[#6872D9] transition-colors">
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
