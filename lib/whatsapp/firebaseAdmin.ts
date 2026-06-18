import { initializeApp, getApps, getApp, cert } from "firebase-admin/app"
import { getFirestore, initializeFirestore, type Firestore } from "firebase-admin/firestore"

function getAdminApp() {
  if (getApps().length > 0) return getApp()
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      // Strip any accidental wrapping quotes (dotenv strips them locally, but a
      // value pasted into a Cloudflare secret keeps them) before fixing newlines.
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!
        .replace(/^"|"$/g, "")
        .replace(/\\n/g, "\n"),
    }),
  })
}

let _db: Firestore | null = null

// Lazy getter — only initializes at request time, not at module import.
// `preferRest: true` forces Firestore to use its HTTP/REST transport instead of
// gRPC over HTTP/2, which the Cloudflare Workers (workerd) runtime does not
// support. Without this the Admin SDK crashes the worker.
export function getAdminDb(): Firestore {
  if (_db) return _db
  const app = getAdminApp()
  try {
    _db = initializeFirestore(app, { preferRest: true })
  } catch {
    // initializeFirestore throws if settings were already applied to this app;
    // fall back to the existing instance.
    _db = getFirestore(app)
  }
  return _db
}
