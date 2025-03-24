"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { createAppointment, checkOverlappingAppointments } from "@/lib/appointmentService"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { User } from "@/lib/types"
import { AlertTriangle } from "lucide-react"

export default function NewAppointment() {
  const { user, userData } = useAuth()
  const router = useRouter()
  const [patientName, setPatientName] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [isOnCall, setIsOnCall] = useState(false)
  const [notes, setNotes] = useState("")
  const [doctorId, setDoctorId] = useState("")
  const [doctors, setDoctors] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [overlappingAppointment, setOverlappingAppointment] = useState<any>(null)
  const [isQuickAppointment, setIsQuickAppointment] = useState(false)

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const doctorsRef = collection(db, "users")
        const q = query(doctorsRef, where("role", "==", "doctor"))
        const querySnapshot = await getDocs(q)

        const doctorsList: User[] = []
        querySnapshot.forEach((doc) => {
          doctorsList.push({ ...doc.data(), id: doc.id } as User)
        })

        setDoctors(doctorsList)

        // If current user is a doctor, set doctorId to their ID
        if (userData?.role === "doctor") {
          setDoctorId(userData.uid)
        }
        // Set default doctor if there's only one and user is not a doctor
        else if (doctorsList.length === 1) {
          setDoctorId(doctorsList[0].uid)
        }
      } catch (error) {
        console.error("Error fetching doctors:", error)
      }
    }

    fetchDoctors()
  }, [userData])

  useEffect(() => {
    if (isOnCall) {
      setTime("on-call")
    } else if (time === "on-call") {
      setTime("")
    }
  }, [isOnCall])

  const handleTimeChange = async (value: string) => {
    setTime(value)

    if (date && value && value !== "on-call") {
      try {
        const overlapping = await checkOverlappingAppointments(date, value)
        setOverlappingAppointment(overlapping)
      } catch (error) {
        console.error("Error checking overlapping appointments:", error)
      }
    } else {
      setOverlappingAppointment(null)
    }
  }

  const handleDateChange = async (value: string) => {
    setDate(value)

    if (value && time && time !== "on-call") {
      try {
        const overlapping = await checkOverlappingAppointments(value, time)
        setOverlappingAppointment(overlapping)
      } catch (error) {
        console.error("Error checking overlapping appointments:", error)
      }
    } else {
      setOverlappingAppointment(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!patientName || !date) {
      setError("Patient name and date are required")
      return
    }

    if (!isOnCall && !time) {
      setError("Please select a time or mark as 'On Call'")
      return
    }

    setLoading(true)

    try {
      const selectedDoctor = doctors.find((doctor) => doctor.uid === doctorId)

      const appointmentData = {
        patientName,
        patientPhone: isQuickAppointment ? "" : patientPhone,
        date,
        time: isOnCall ? "on-call" : time,
        doctorId: doctorId || null,
        doctorName: selectedDoctor ? selectedDoctor.name : null,
        notes,
        status: "scheduled",
        isFollowUp: false,
        createdBy: user?.uid || "",
      }

      await createAppointment(appointmentData as any)
      router.push("/dashboard/appointments")
    } catch (error: any) {
      setError(error.message || "Failed to create appointment")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Appointment</h1>
        <p className="mt-1 text-sm text-gray-500">Schedule a new appointment for a patient</p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          {error && <div className="mb-4 bg-error/10 border border-error text-error px-4 py-3 rounded">{error}</div>}

          <div className="mb-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="quickAppointment"
                checked={isQuickAppointment}
                onChange={(e) => setIsQuickAppointment(e.target.checked)}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="quickAppointment" className="ml-2 block text-sm text-gray-900">
                Quick Appointment (Name, Date, Time only)
              </label>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="patientName" className="block text-sm font-medium text-gray-700">
                  Patient Name *
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="patientName"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                    required
                  />
                </div>
              </div>

              {!isQuickAppointment && (
                <div className="sm:col-span-3">
                  <label htmlFor="patientPhone" className="block text-sm font-medium text-gray-700">
                    Patient Phone
                  </label>
                  <div className="mt-1">
                    <input
                      type="tel"
                      id="patientPhone"
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              )}

              <div className="sm:col-span-3">
                <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                  Date *
                </label>
                <div className="mt-1">
                  <input
                    type="date"
                    id="date"
                    value={date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                    required
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="time" className="block text-sm font-medium text-gray-700">
                  Time
                </label>
                <div className="mt-1">
                  <input
                    type="time"
                    id="time"
                    value={time !== "on-call" ? time : ""}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    disabled={isOnCall}
                    className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                  />
                </div>
                <div className="mt-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="onCall"
                      checked={isOnCall}
                      onChange={(e) => setIsOnCall(e.target.checked)}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="onCall" className="ml-2 block text-sm text-gray-900">
                      On Call (No specific time)
                    </label>
                  </div>
                </div>
              </div>

              {overlappingAppointment && (
                <div className="sm:col-span-6">
                  <div className="rounded-md bg-accent/10 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-accent" aria-hidden="true" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-accent">Overlapping Appointment</h3>
                        <div className="mt-2 text-sm text-accent">
                          <p>
                            There is already an appointment scheduled for{" "}
                            <strong>{overlappingAppointment.patientName}</strong> at this time.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isQuickAppointment && (
                <>
                  <div className="sm:col-span-3">
                    <label htmlFor="doctor" className="block text-sm font-medium text-gray-700">
                      Assign Doctor
                    </label>
                    <div className="mt-1">
                      <select
                        id="doctor"
                        value={doctorId}
                        onChange={(e) => setDoctorId(e.target.value)}
                        className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                        disabled={userData?.role === "doctor"} // Disable if the user is a doctor
                      >
                        <option value="">Select a doctor</option>
                        {doctors.map((doctor) => (
                          <option key={doctor.uid} value={doctor.uid}>
                            Dr. {doctor.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="sm:col-span-6">
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                      Notes
                    </label>
                    <div className="mt-1">
                      <textarea
                        id="notes"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => router.back()}
                className="bg-gray-200 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Appointment"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

