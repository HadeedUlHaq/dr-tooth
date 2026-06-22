import type React from "react"
import type { Metadata } from "next"
import { Figtree } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/AuthContext"

const figtree = Figtree({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "Dr Tooth Dental Clinic",
  description: "Dental clinic operations, patient appointments, invoices, and staff workflows",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${figtree.className} antialiased`} suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
