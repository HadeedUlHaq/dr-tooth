"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { createAppointment, checkOverlappingAppointments } from "@/lib/appointmentService"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { User } from "@/lib/types"
import { AlertTriangle, CheckCircle } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { PatientSearch } from "@/components/ui/patient-search"
import { logActivity } from "@/lib/activityService"
import type { Patient } from "@/lib/types"

export default function NewAppointment() {
  const { user, userData } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [patientName, setPatientName] = useState(searchParams.get("patientName") || "")
  const [patientPhone, setPatientPhone] = useState(searchParams.get("patientPhone") || "")
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
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  const handlePatientSelect = (patient: Patient) => {
    setPatientName(patient.name)
    setPatientPhone(patient.phone)
    setSelectedPatient(patient)
  }

  const handlePatientNameChange = (value: string) => {
    setPatientName(value)
    // Clear selected patient if user edits the name after selection
    if (selectedPatient && value !== selectedPatient.name) {
      setSelectedPatient(null)
      setPatientPhone("")
    }
  }

  const handleRegisterNewPatient = (name: string) => {
    // Navigate to patients page with name pre-filled
    router.push(`/dashboard/patients?register=${encodeURIComponent(name)}`)
  }

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const doctorsRef = collection(db, "users")
        const q = query(doctorsRef, where("role", "==", "doctor"))
        const querySnapshot = await getDocs(q)

        const doctorsList: User[] = []
        querySnapshot.forEach((doc) => {
          doctorsList.push({ ...doc.data(), uid: doc.id } as User)
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
        doctorId: doctorId || undefined,
        doctorName: selectedDoctor ? selectedDoctor.name : undefined,
        notes,
        status: "scheduled" as const,
        isFollowUp: false,
        createdBy: user?.uid || "",
      }

      await createAppointment(appointmentData)
      await logActivity({
        type: "appointment_created",
        message: `${userData?.name || "Someone"} created an appointment for ${patientName}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
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
        <h1 className="text-2xl font-semibold text-[#EDEDEF]">New Appointment</h1>
        <p className="mt-1 text-sm text-[#8A8F98]">Schedule a new appointment for a patient</p>
      </div>

      <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="mb-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="quickAppointment"
                checked={isQuickAppointment}
                onChange={(e) => setIsQuickAppointment(e.target.checked)}
                className="h-4 w-4 accent-[#5E6AD2] rounded"
              />
              <label htmlFor="quickAppointment" className="ml-2 block text-sm text-[#EDEDEF]">
                Quick Appointment (Name, Date, Time only)
              </label>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="patientName" className="block text-sm font-medium text-[#8A8F98]">
                  Patient Name *
                </label>
                <div className="mt-1">
                  <PatientSearch
                    onSelect={handlePatientSelect}
                    onChange={handlePatientNameChange}
                    onRegisterNew={handleRegisterNewPatient}
                    initialValue={patientName}
                    placeholder="Search or type patient name"
                  />
                </div>
                {selectedPatient && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Patient selected from directory
                  </div>
                )}
              </div>

              {!isQuickAppointment && (
                <div className="sm:col-span-3">
                  <label htmlFor="patientPhone" className="block text-sm font-medium text-[#8A8F98]">
                    Patient Phone
                  </label>
                  <div className="mt-1">
                    <input
                      type="tel"
                      id="patientPhone"
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5"
                    />
                  </div>
                </div>
              )}

              <div className="sm:col-span-3">
                <label htmlFor="date" className="block text-sm font-medium text-[#8A8F98]">
                  Date *
                </label>
                <div className="mt-1">
                  <DatePicker
                    value={date}
                    onChange={(val) => handleDateChange(val)}
                    minDate={new Date()}
                    placeholder="Select date"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="time" className="block text-sm font-medium text-[#8A8F98]">
                  Time
                </label>
                <div className="mt-1">
                  <TimePicker
                    value={time !== "on-call" ? time : ""}
                    onChange={(val) => handleTimeChange(val)}
                    disabled={isOnCall}
                  />
                </div>
                <div className="mt-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="onCall"
                      checked={isOnCall}
                      onChange={(e) => setIsOnCall(e.target.checked)}
                      className="h-4 w-4 accent-[#5E6AD2] rounded"
                    />
                    <label htmlFor="onCall" className="ml-2 block text-sm text-[#EDEDEF]">
                      On Call (No specific time)
                    </label>
                  </div>
                </div>
              </div>

              {overlappingAppointment && (
                <div className="sm:col-span-6">
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden="true" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-amber-400">Overlapping Appointment</h3>
                        <div className="mt-2 text-sm text-amber-400">
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
                    <label htmlFor="doctor" className="block text-sm font-medium text-[#8A8F98]">
                      Assign Doctor
                    </label>
                    <div className="mt-1">
                      <select
                        id="doctor"
                        value={doctorId}
                        onChange={(e) => setDoctorId(e.target.value)}
                        className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5"
                        disabled={userData?.role === "doctor"}
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
                    <label htmlFor="notes" className="block text-sm font-medium text-[#8A8F98]">
                      Notes
                    </label>
                    <div className="mt-1">
                      <textarea
                        id="notes"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5"
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
                className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="ml-3 inline-flex justify-center py-2 px-4 text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/20 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create Appointment"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
