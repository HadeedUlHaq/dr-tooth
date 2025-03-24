import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

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

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const auth = getAuth(app)
const db = getFirestore(app)

export { app, auth, db }

