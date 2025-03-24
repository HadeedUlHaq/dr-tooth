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
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
      <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-primary mb-4">Firebase Configuration Required</h2>

        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-yellow-800">
            Your Firebase configuration is not properly set up. You need to update the Firebase configuration in your
            project.
          </p>
        </div>

        <button onClick={() => setShowInstructions(!showInstructions)} className="mb-4 text-primary underline">
          {showInstructions ? "Hide Instructions" : "Show Setup Instructions"}
        </button>

        {showInstructions && (
          <div className="mb-6 space-y-4">
            <h3 className="text-lg font-semibold">How to Set Up Firebase:</h3>

            <div>
              <h4 className="font-medium">1. Create a Firebase Project</h4>
              <p className="text-sm text-gray-600 ml-4">
                Go to the{" "}
                <a
                  href="https://console.firebase.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Firebase Console
                </a>{" "}
                and create a new project.
              </p>
            </div>

            <div>
              <h4 className="font-medium">2. Enable Authentication</h4>
              <p className="text-sm text-gray-600 ml-4">
                In your Firebase project, go to Authentication and enable Email/Password authentication.
              </p>
            </div>

            <div>
              <h4 className="font-medium">3. Create a Web App</h4>
              <p className="text-sm text-gray-600 ml-4">
                In your Firebase project settings, add a new Web App and register it.
              </p>
            </div>

            <div>
              <h4 className="font-medium">4. Get Your Firebase Configuration</h4>
              <p className="text-sm text-gray-600 ml-4">
                After registering your app, Firebase will show you a configuration object. Copy this configuration.
              </p>
            </div>

            <div>
              <h4 className="font-medium">5. Update Your Firebase Configuration</h4>
              <p className="text-sm text-gray-600 ml-4">
                Open the file <code className="bg-gray-100 px-1 py-0.5 rounded">lib/firebase.ts</code> in your project
                and replace the <code className="bg-gray-100 px-1 py-0.5 rounded">FIREBASE_CONFIG_FALLBACK</code> object
                with your actual Firebase configuration.
              </p>
              <pre className="bg-gray-100 p-2 rounded text-xs mt-2 overflow-x-auto">
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
              <h4 className="font-medium">6. Set Up Environment Variables (Recommended)</h4>
              <p className="text-sm text-gray-600 ml-4">
                For better security, set up environment variables in your Vercel project settings or in a{" "}
                <code className="bg-gray-100 px-1 py-0.5 rounded">.env.local</code> file:
              </p>
              <pre className="bg-gray-100 p-2 rounded text-xs mt-2 overflow-x-auto">
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
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
          >
            Refresh Page
          </button>
        </div>
      </div>
    </div>
  )
}

