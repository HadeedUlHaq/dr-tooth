import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

// Using the provided Firebase configuration directly
const firebaseConfig = {
  apiKey: "AIzaSyA_WaKoumy4DSXsIPs2GPgmldvCAupfOg4",
  authDomain: "dr-tooth-dental-clinic.firebaseapp.com",
  projectId: "dr-tooth-dental-clinic",
  storageBucket: "dr-tooth-dental-clinic.firebasestorage.app",
  messagingSenderId: "838583387515",
  appId: "1:838583387515:web:5e29ed10b98e3d78f829de",
  measurementId: "G-2K7HNJPXVY",
}

// The Firebase client SDK is browser-only here (auth + Firestore are used purely
// from client components / effects). Calling getAuth()/getFirestore() sets up the
// SDK's internal transport, which performs runtime codegen (`new Function`) that
// the Cloudflare Workers runtime forbids — so doing it during SSR throws
// "EvalError: Code generation from strings disallowed" and 500s every page. Guard
// the init so it only runs in the browser; on the server these stay undefined and
// nothing dereferences them (no server code uses the client SDK).
const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const isBrowser = typeof window !== "undefined"
const auth = (isBrowser ? getAuth(app) : undefined) as Auth
const db = (isBrowser ? getFirestore(app) : undefined) as Firestore

export { app, auth, db }

