"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push("/dashboard")
      } else {
        router.push("/login")
      }
    }
  }, [user, loading, router])

  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#0891B2] border-t-transparent"></div>
    </div>
  )
}
