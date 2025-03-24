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
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full">
        <h2 className="text-xl font-bold text-error mb-4">Firebase Configuration Error</h2>
        <p className="mb-4">{configError}</p>
        <p className="text-sm text-gray-600">
          Please check your environment variables and make sure they are correctly set in your Vercel project settings.
        </p>
      </div>
    </div>
  )
}

