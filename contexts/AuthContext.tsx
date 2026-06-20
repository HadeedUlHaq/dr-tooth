"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import {
  type User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"

type UserRole = "receptionist" | "doctor" | "admin"

interface UserData {
  uid: string
  email: string
  role: UserRole
  name: string
}

interface AuthContextType {
  user: User | null
  userData: UserData | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, role: UserRole) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    // Instead of throwing an error, return a default context with loading=true
    return {
      user: null,
      userData: null,
      loading: true,
      login: async () => {
        throw new Error("Auth provider not initialized")
      },
      register: async () => {
        throw new Error("Auth provider not initialized")
      },
      logout: async () => {
        throw new Error("Auth provider not initialized")
      },
    } as AuthContextType
  }
  return context
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)

      if (user) {
        // Fetch user data from Firestore
        const userDocRef = doc(db, "users", user.uid)
        const userDoc = await getDoc(userDocRef)

        if (userDoc.exists()) {
          setUserData(userDoc.data() as UserData)
        }
      } else {
        setUserData(null)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      console.error("Login error:", error)
      throw error
    }
  }

  // Public self-registration is DISABLED (security): it let anyone create an
  // account and pick their own role (incl. admin). Staff are now provisioned by an
  // admin out-of-band. Kept in the type for compatibility; always rejects.
  const register = async (_email: string, _password: string, _name: string, _role: UserRole) => {
    void createUserWithEmailAndPassword
    void setDoc
    void doc
    throw new Error("Registration is disabled. Ask an administrator to create your account.")
  }

  const logout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error("Logout error:", error)
      throw error
    }
  }

  const value = {
    user,
    userData,
    loading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

