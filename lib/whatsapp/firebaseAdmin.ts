import { initializeApp, getApps, getApp, cert } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

function getAdminApp() {
  if (getApps().length > 0) return getApp()
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  })
}

// Lazy getter — only initializes at request time, not at module import
export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp())
}
