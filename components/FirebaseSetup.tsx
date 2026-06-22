"use client"

import { useState, useEffect } from "react"

export default function FirebaseSetup() {
  const [isConfigured, setIsConfigured] = useState(true)
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    // Check if Firebase is properly configured
    try {
      const config = (window as any).__FIREBASE_CONFIG__

      // Check if we're using the fallback configuration
      if (
        config.apiKey === "YOUR_API_KEY" ||
        config.authDomain === "YOUR_AUTH_DOMAIN" ||
        config.projectId === "YOUR_PROJECT_ID"
      ) {
        setIsConfigured(false)
      } else {
        setIsConfigured(true)
      }
    } catch (error) {
      console.error("Error checking Firebase configuration:", error)
      setIsConfigured(false)
    }
  }, [])

  if (isConfigured) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/[0.06] bg-[#061417] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] sm:p-6">
        <h2 className="text-2xl font-bold text-[#0891B2] mb-4">Firebase Configuration Required</h2>

        <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-amber-400 text-sm">
            Your Firebase configuration is not properly set up. You need to update the Firebase configuration in your
            project.
          </p>
        </div>

        <button onClick={() => setShowInstructions(!showInstructions)} className="mb-4 min-h-[44px] text-[#0891B2] underline transition-colors hover:text-[#0E7490]">
          {showInstructions ? "Hide Instructions" : "Show Setup Instructions"}
        </button>

        {showInstructions && (
          <div className="mb-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#F0FCFF]">How to Set Up Firebase:</h3>

            <div>
              <h4 className="font-medium text-[#F0FCFF]">1. Create a Firebase Project</h4>
              <p className="text-sm text-[#A9BFC5] ml-4">
                Go to the{" "}
                <a
                  href="https://console.firebase.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0891B2] underline"
                >
                  Firebase Console
                </a>{" "}
                and create a new project.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-[#F0FCFF]">2. Enable Authentication</h4>
              <p className="text-sm text-[#A9BFC5] ml-4">
                In your Firebase project, go to Authentication and enable Email/Password authentication.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-[#F0FCFF]">3. Create a Web App</h4>
              <p className="text-sm text-[#A9BFC5] ml-4">
                In your Firebase project settings, add a new Web App and register it.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-[#F0FCFF]">4. Get Your Firebase Configuration</h4>
              <p className="text-sm text-[#A9BFC5] ml-4">
                After registering your app, Firebase will show you a configuration object. Copy this configuration.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-[#F0FCFF]">5. Update Your Firebase Configuration</h4>
              <p className="text-sm text-[#A9BFC5] ml-4">
                Open the file <code className="bg-white/[0.08] px-1 py-0.5 rounded text-[#F0FCFF]">lib/firebase.ts</code> in your project
                and replace the <code className="bg-white/[0.08] px-1 py-0.5 rounded text-[#F0FCFF]">FIREBASE_CONFIG_FALLBACK</code> object
                with your actual Firebase configuration.
              </p>
              <pre className="bg-white/[0.05] border border-white/[0.06] p-2 rounded-lg text-xs mt-2 overflow-x-auto text-[#F0FCFF]">
                {`const FIREBASE_CONFIG_FALLBACK = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "YOUR_ACTUAL_AUTH_DOMAIN",
  projectId: "YOUR_ACTUAL_PROJECT_ID",
  storageBucket: "YOUR_ACTUAL_STORAGE_BUCKET",
  messagingSenderId: "YOUR_ACTUAL_MESSAGING_SENDER_ID",
  appId: "YOUR_ACTUAL_APP_ID"
};`}
              </pre>
            </div>

            <div>
              <h4 className="font-medium text-[#F0FCFF]">6. Set Up Environment Variables (Recommended)</h4>
              <p className="text-sm text-[#A9BFC5] ml-4">
                For better security, set up environment variables in your Vercel project settings or in a{" "}
                <code className="bg-white/[0.08] px-1 py-0.5 rounded text-[#F0FCFF]">.env.local</code> file:
              </p>
              <pre className="bg-white/[0.05] border border-white/[0.06] p-2 rounded-lg text-xs mt-2 overflow-x-auto text-[#F0FCFF]">
                {`NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id`}
              </pre>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => window.location.reload()}
            className="min-h-[44px] w-full rounded-lg bg-[#0891B2] px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(8,145,178,0.5),0_4px_12px_rgba(8,145,178,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-colors hover:bg-[#0E7490] sm:w-auto"
          >
            Refresh Page
          </button>
        </div>
      </div>
    </div>
  )
}
