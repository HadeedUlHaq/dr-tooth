"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Public self-registration is disabled for security (it previously let anyone
// create an account with a self-chosen role, including admin). Staff accounts are
// provisioned by an administrator. This route just redirects to login.
export default function RegisterDisabled() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/login")
  }, [router])
  return null
}
