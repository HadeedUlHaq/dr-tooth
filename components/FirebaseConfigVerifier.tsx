"use client"

import { useEffect, useState } from "react"
import { verifyFirebaseConfig } from "@/lib/verifyFirebaseConfig"

export default function FirebaseConfigVerifier() {
  const [configError, setConfigError] = useState<string | null>(null)

  useEffect(() => {
    const configVerification = verifyFirebaseConfig()
    if (!configVerification.isValid) {
      setConfigError(configVerification.message ?? "Firebase configuration is invalid.")
      console.error(configVerification.message)
    }
  }, [])

  if (!configError) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg border border-white/[0.06] bg-[#061417] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] sm:p-6">
        <h2 className="text-xl font-bold text-red-400 mb-4">Firebase Configuration Error</h2>
        <p className="mb-4 text-[#F0FCFF] text-sm">{configError}</p>
        <p className="text-sm text-[#A9BFC5]">
          Please check your environment variables and make sure they are correctly set in your Vercel project settings.
        </p>
      </div>
    </div>
  )
}
