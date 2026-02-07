"use client"

import { useEffect, useState } from "react"
import { verifyFirebaseConfig } from "@/lib/verifyFirebaseConfig"

export default function FirebaseConfigVerifier() {
  const [configError, setConfigError] = useState<string | null>(null)

  useEffect(() => {
    const configVerification = verifyFirebaseConfig()
    if (!configVerification.isValid) {
      setConfigError(configVerification.message)
      console.error(configVerification.message)
    }
  }, [])

  if (!configError) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
      <div className="bg-[#0a0a0c] border border-white/[0.06] p-6 rounded-2xl max-w-md w-full shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)]">
        <h2 className="text-xl font-bold text-red-400 mb-4">Firebase Configuration Error</h2>
        <p className="mb-4 text-[#EDEDEF] text-sm">{configError}</p>
        <p className="text-sm text-[#8A8F98]">
          Please check your environment variables and make sure they are correctly set in your Vercel project settings.
        </p>
      </div>
    </div>
  )
}
