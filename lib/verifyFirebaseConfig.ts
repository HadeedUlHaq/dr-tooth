import { getApps } from "firebase/app"

// Utility function to verify Firebase configuration
export function verifyFirebaseConfig() {
  try {
    const apps = getApps()
    if (apps.length === 0) {
      return {
        isValid: false,
        message: "Firebase app is not initialized. Please check your Firebase configuration in lib/firebase.ts.",
      }
    }

    const app = apps[0]
    const options = app.options

    // Check for placeholder values
    if (
      !options.apiKey ||
      options.apiKey === "YOUR_API_KEY" ||
      !options.projectId ||
      options.projectId === "YOUR_PROJECT_ID"
    ) {
      return {
        isValid: false,
        message:
          "Firebase configuration contains placeholder values. Please update lib/firebase.ts with your actual Firebase project credentials.",
      }
    }

    return { isValid: true }
  } catch (error) {
    return {
      isValid: false,
      message: "Error verifying Firebase configuration. Please check your setup.",
    }
  }
}
