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
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
      <div className="bg-[#0a0a0c] border border-white/[0.06] p-6 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)]">
        <h2 className="text-2xl font-bold text-[#5E6AD2] mb-4">Firebase Configuration Required</h2>

        <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-amber-400 text-sm">
            Your Firebase configuration is not properly set up. You need to update the Firebase configuration in your
            project.
          </p>
        </div>

        <button onClick={() => setShowInstructions(!showInstructions)} className="mb-4 text-[#5E6AD2] hover:text-[#6872D9] underline transition-colors">
          {showInstructions ? "Hide Instructions" : "Show Setup Instructions"}
        </button>

        {showInstructions && (
          <div className="mb-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#EDEDEF]">How to Set Up Firebase:</h3>

            <div>
              <h4 className="font-medium text-[#EDEDEF]">1. Create a Firebase Project</h4>
              <p className="text-sm text-[#8A8F98] ml-4">
                Go to the{" "}
                <a
                  href="https://console.firebase.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5E6AD2] underline"
                >
                  Firebase Console
                </a>{" "}
                and create a new project.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-[#EDEDEF]">2. Enable Authentication</h4>
              <p className="text-sm text-[#8A8F98] ml-4">
                In your Firebase project, go to Authentication and enable Email/Password authentication.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-[#EDEDEF]">3. Create a Web App</h4>
              <p className="text-sm text-[#8A8F98] ml-4">
                In your Firebase project settings, add a new Web App and register it.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-[#EDEDEF]">4. Get Your Firebase Configuration</h4>
              <p className="text-sm text-[#8A8F98] ml-4">
                After registering your app, Firebase will show you a configuration object. Copy this configuration.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-[#EDEDEF]">5. Update Your Firebase Configuration</h4>
              <p className="text-sm text-[#8A8F98] ml-4">
                Open the file <code className="bg-white/[0.08] px-1 py-0.5 rounded text-[#EDEDEF]">lib/firebase.ts</code> in your project
                and replace the <code className="bg-white/[0.08] px-1 py-0.5 rounded text-[#EDEDEF]">FIREBASE_CONFIG_FALLBACK</code> object
                with your actual Firebase configuration.
              </p>
              <pre className="bg-white/[0.05] border border-white/[0.06] p-2 rounded-lg text-xs mt-2 overflow-x-auto text-[#EDEDEF]">
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
              <h4 className="font-medium text-[#EDEDEF]">6. Set Up Environment Variables (Recommended)</h4>
              <p className="text-sm text-[#8A8F98] ml-4">
                For better security, set up environment variables in your Vercel project settings or in a{" "}
                <code className="bg-white/[0.08] px-1 py-0.5 rounded text-[#EDEDEF]">.env.local</code> file:
              </p>
              <pre className="bg-white/[0.05] border border-white/[0.06] p-2 rounded-lg text-xs mt-2 overflow-x-auto text-[#EDEDEF]">
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
            className="px-4 py-2 bg-[#5E6AD2] text-white rounded-lg hover:bg-[#6872D9] shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-colors font-medium text-sm"
          >
            Refresh Page
          </button>
        </div>
      </div>
    </div>
  )
}
