"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { getAppointment, updateAppointment, deleteAppointment, createAppointment } from "@/lib/appointmentService"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Appointment, AppointmentStatus, User } from "@/lib/types"
import { Edit, Trash, Calendar, Clock, UserIcon, Phone, FileText, CheckCircle, XCircle, UserPlus, BadgeCheck, Receipt } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { searchPatients, createPatient } from "@/lib/patientService"
import { logActivity } from "@/lib/activityService"
import { getInvoiceByAppointment } from "@/lib/invoiceService"
import { PhoneInput } from "@/components/ui/phone-input"
import { CallButton } from "@/components/ui/call-button"
import type { Patient, Invoice } from "@/lib/types"

export default function AppointmentDetailClient() {
  const params = useParams()
  const id = params.id as string

  const { user, userData } = useAuth()
  const router = useRouter()
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [patientName, setPatientName] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [isOnCall, setIsOnCall] = useState(false)
  const [notes, setNotes] = useState("")
  const [doctorId, setDoctorId] = useState("")
  const [doctors, setDoctors] = useState<User[]>([])
  const [status, setStatus] = useState<AppointmentStatus>("scheduled")
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState("")
  const [showFollowUpForm, setShowFollowUpForm] = useState(false)
  const [followUpDate, setFollowUpDate] = useState("")
  const [followUpTime, setFollowUpTime] = useState("")
  const [followUpIsOnCall, setFollowUpIsOnCall] = useState(false)
  const [followUpNotes, setFollowUpNotes] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [registeredPatient, setRegisteredPatient] = useState<Patient | null>(null)
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [registerTreatment, setRegisterTreatment] = useState("Consultation")
  const [registerAddress, setRegisterAddress] = useState("")
  const [registerNotes, setRegisterNotes] = useState("")
  const [registering, setRegistering] = useState(false)
  const [checkingPatient, setCheckingPatient] = useState(true)
  const [linkedInvoice, setLinkedInvoice] = useState<Invoice | null>(null)
  const registerFormRef = useRef<HTMLDivElement>(null)
  const registerTreatmentInputRef = useRef<HTMLInputElement>(null)

  const handleShowRegisterForm = () => {
    setShowRegisterForm(true)
    // Wait for form to render, then scroll and focus
    setTimeout(() => {
      registerFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      setTimeout(() => {
        registerTreatmentInputRef.current?.focus()
      }, 400)
    }, 50)
  }

  useEffect(() => {
    const fetchAppointment = async () => {
      try {
        const appointmentData = await getAppointment(id)
        setAppointment(appointmentData)

        if (appointmentData) {
          setPatientName(appointmentData.patientName)
          setPatientPhone(appointmentData.patientPhone || "")
          setDate(appointmentData.date)
          setTime(appointmentData.time === "on-call" ? "" : appointmentData.time)
          setIsOnCall(appointmentData.time === "on-call")
          setNotes(appointmentData.notes || "")
          setDoctorId(appointmentData.doctorId || "")
          setStatus(appointmentData.status)
        }
      } catch (error) {
        console.error("Error fetching appointment:", error)
        setError("Failed to load appointment details")
      } finally {
        setLoading(false)
      }
    }

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
      } catch (error) {
        console.error("Error fetching doctors:", error)
      }
    }

    if (id) {
      fetchAppointment()
      fetchDoctors()
    }
  }, [id])

  useEffect(() => {
    if (isOnCall) {
      setTime("")
    }
  }, [isOnCall])

  useEffect(() => {
    if (followUpIsOnCall) {
      setFollowUpTime("")
    }
  }, [followUpIsOnCall])

  // Check if patient is registered in the directory
  useEffect(() => {
    const checkPatientRegistration = async () => {
      if (!appointment?.patientName) {
        setCheckingPatient(false)
        return
      }
      try {
        const results = await searchPatients(appointment.patientName)
        const exactMatch = results.find(
          (p) => p.name.toLowerCase() === appointment.patientName.toLowerCase()
        )
        setRegisteredPatient(exactMatch || null)
      } catch (error) {
        console.error("Error checking patient registration:", error)
      } finally {
        setCheckingPatient(false)
      }
    }

    if (appointment) {
      checkPatientRegistration()
    }
  }, [appointment])

  // Check if an invoice exists for this appointment
  useEffect(() => {
    const checkInvoice = async () => {
      if (!id) return
      try {
        const inv = await getInvoiceByAppointment(id)
        setLinkedInvoice(inv)
      } catch (error) {
        console.error("Error checking invoice:", error)
      }
    }
    if (appointment) {
      checkInvoice()
    }
  }, [appointment, id])

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appointment) return

    setRegistering(true)
    try {
      await createPatient({
        name: appointment.patientName,
        phone: appointment.patientPhone || "",
        treatmentRequired: registerTreatment,
        address: registerAddress,
        notes: registerNotes,
        createdBy: user?.uid || "",
      })

      await logActivity({
        type: "patient_added",
        message: `${userData?.name || "Someone"} registered patient ${appointment.patientName} from appointment`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })

      // Re-check registration
      const results = await searchPatients(appointment.patientName)
      const exactMatch = results.find(
        (p) => p.name.toLowerCase() === appointment.patientName.toLowerCase()
      )
      setRegisteredPatient(exactMatch || null)
      setShowRegisterForm(false)
    } catch (error: any) {
      setError(error.message || "Failed to register patient")
    } finally {
      setRegistering(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00")
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const formatTime = (time: string | "on-call") => {
    if (time === "on-call") return "On Call"

    try {
      const [hours, minutes] = time.split(":")
      const hour = Number.parseInt(hours)
      const ampm = hour >= 12 ? "PM" : "AM"
      const formattedHour = hour % 12 || 12
      return `${formattedHour}:${minutes} ${ampm}`
    } catch (error) {
      return time
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-500/15 text-blue-400"
      case "confirmed":
        return "bg-green-500/15 text-green-400"
      case "completed":
        return "bg-purple-500/15 text-purple-400"
      case "missed":
        return "bg-red-500/15 text-red-400"
      case "cancelled":
        return "bg-white/[0.05] text-[#8A8F98]"
      default:
        return "bg-white/[0.05] text-[#8A8F98]"
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
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

    setUpdating(true)

    try {
      const selectedDoctor = doctors.find((doctor) => doctor.uid === doctorId)

      const appointmentData = {
        patientName,
        patientPhone,
        date,
        time: isOnCall ? "on-call" : time,
        doctorId: doctorId || undefined,
        doctorName: selectedDoctor ? selectedDoctor.name : undefined,
        notes,
        status,
        updatedBy: user?.uid || "",
      }

      await updateAppointment(id, appointmentData)
      await logActivity({
        type: "appointment_updated",
        message: `${userData?.name || "Someone"} updated appointment for ${patientName}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })

      // Refresh appointment data
      const updatedAppointment = await getAppointment(id)
      setAppointment(updatedAppointment)

      setIsEditing(false)
    } catch (error: any) {
      setError(error.message || "Failed to update appointment")
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusChange = async (newStatus: AppointmentStatus) => {
    setUpdating(true)

    try {
      await updateAppointment(id, {
        status: newStatus,
        updatedBy: user?.uid || "",
      })
      await logActivity({
        type: "appointment_status_changed",
        message: `${userData?.name || "Someone"} marked ${appointment?.patientName || "appointment"} as ${newStatus}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })

      // Refresh appointment data
      const updatedAppointment = await getAppointment(id)
      setAppointment(updatedAppointment)
      setStatus(newStatus)

      if (newStatus === "completed") {
        setShowFollowUpForm(true)
      }
    } catch (error: any) {
      setError(error.message || "Failed to update appointment status")
    } finally {
      setUpdating(false)
    }
  }

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!followUpDate) {
      setError("Follow-up date is required")
      return
    }

    if (!followUpIsOnCall && !followUpTime) {
      setError("Please select a time or mark as 'On Call'")
      return
    }

    setUpdating(true)

    try {
      const selectedDoctor = doctors.find((doctor) => doctor.uid === doctorId)

      const followUpData = {
        patientName: appointment?.patientName || "",
        patientPhone: appointment?.patientPhone || "",
        date: followUpDate,
        time: followUpIsOnCall ? "on-call" : followUpTime,
        doctorId: doctorId || undefined,
        doctorName: selectedDoctor ? selectedDoctor.name : undefined,
        notes: followUpNotes,
        status: "scheduled" as const,
        isFollowUp: true,
        previousAppointmentId: id,
        createdBy: user?.uid || "",
      }

      await createAppointment(followUpData)
      await logActivity({
        type: "appointment_created",
        message: `${userData?.name || "Someone"} scheduled a follow-up for ${appointment?.patientName || "patient"}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
      router.push("/dashboard/appointments")
    } catch (error: any) {
      setError(error.message || "Failed to create follow-up appointment")
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    setUpdating(true)

    try {
      await logActivity({
        type: "appointment_deleted",
        message: `${userData?.name || "Someone"} deleted appointment for ${appointment?.patientName || "patient"}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
      await deleteAppointment(id)
      router.push("/dashboard/appointments")
    } catch (error: any) {
      setError(error.message || "Failed to delete appointment")
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!appointment) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-semibold text-[#EDEDEF]">Appointment Not Found</h2>
        <p className="mt-2 text-[#8A8F98]">The appointment you&apos;re looking for doesn&apos;t exist or has been deleted.</p>
        <Link
          href="/dashboard/appointments"
          className="mt-4 inline-flex items-center px-4 py-2 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-sm font-medium transition-colors"
        >
          Back to Appointments
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#EDEDEF]">Appointment Details</h1>
          <p className="mt-1 text-sm text-[#8A8F98]">View and manage appointment information</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          {!isEditing &&
            (userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center px-4 py-2 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-sm font-medium transition-colors"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </button>
                {(userData?.role === "receptionist" || userData?.role === "admin") && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Trash className="h-4 w-4 mr-2" />
                    Delete
                  </button>
                )}
              </>
            )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-[#EDEDEF]">Delete Appointment</h3>
            <p className="mt-2 text-sm text-[#8A8F98]">
              Are you sure you want to delete this appointment? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={updating}
                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {updating ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
        {isEditing ? (
          <div className="px-4 py-5 sm:p-6">
            <form onSubmit={handleUpdate} className="space-y-6">
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label htmlFor="patientName" className="block text-sm font-medium text-[#8A8F98]">
                    Patient Name *
                  </label>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-gray-500" />
                    </div>
                    <input
                      type="text"
                      id="patientName"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="pl-10 pr-3 py-2.5 block w-full text-sm bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="patientPhone" className="block text-sm font-medium text-[#8A8F98]">
                    Patient Phone
                  </label>
                  <div className="mt-1">
                    <PhoneInput
                      id="patientPhone"
                      value={patientPhone}
                      onChange={setPatientPhone}
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="date" className="block text-sm font-medium text-[#8A8F98]">
                    Date *
                  </label>
                  <div className="mt-1">
                    <DatePicker
                      value={date}
                      onChange={(val) => setDate(val)}
                      minDate={new Date()}
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="time" className="block text-sm font-medium text-[#8A8F98]">
                    Time
                  </label>
                  <div className="mt-1">
                    <TimePicker
                      value={time}
                      onChange={(val) => setTime(val)}
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
                        className="h-4 w-4 text-[#5E6AD2] focus:ring-[#5E6AD2] border-white/10 rounded bg-[#0F0F12]"
                      />
                      <label htmlFor="onCall" className="ml-2 block text-sm text-[#EDEDEF]">
                        On Call (No specific time)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="status" className="block text-sm font-medium text-[#8A8F98]">
                    Status
                  </label>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CheckCircle className="h-5 w-5 text-gray-500" />
                    </div>
                    <select
                      id="status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                      className="pl-10 pr-3 py-2.5 block w-full text-sm bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="missed">Missed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="doctor" className="block text-sm font-medium text-[#8A8F98]">
                    Assign Doctor
                  </label>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-gray-500" />
                    </div>
                    <select
                      id="doctor"
                      value={doctorId}
                      onChange={(e) => setDoctorId(e.target.value)}
                      className="pl-10 pr-3 py-2.5 block w-full text-sm bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
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
                  <div className="mt-1 relative">
                    <div className="absolute top-3 left-3 flex items-start pointer-events-none">
                      <FileText className="h-5 w-5 text-gray-500" />
                    </div>
                    <textarea
                      id="notes"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="pl-10 pr-3 py-2.5 block w-full text-sm bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2 px-4 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="ml-3 inline-flex justify-center py-2 px-4 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="px-4 py-5 sm:p-6">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
                <h3 className="text-lg font-medium leading-6 text-[#EDEDEF] flex items-center">
                  <UserIcon className="h-5 w-5 mr-2 text-[#5E6AD2]" />
                  Patient Information
                </h3>
                <div className="mt-5 border-t border-white/[0.06]">
                  <dl className="divide-y divide-white/[0.06]">
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-[#8A8F98]">Name</dt>
                      <dd className="mt-1 text-sm text-[#EDEDEF] sm:mt-0 sm:col-span-2">{appointment.patientName}</dd>
                    </div>
                    {appointment.patientPhone && (
                      <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                        <dt className="text-sm font-medium text-[#8A8F98]">Phone</dt>
                        <dd className="mt-1 text-sm text-[#EDEDEF] sm:mt-0 sm:col-span-2">
                          <div className="flex items-center gap-3">
                            <span>{appointment.patientPhone}</span>
                            <CallButton phone={appointment.patientPhone} size="md" />
                          </div>
                        </dd>
                      </div>
                    )}
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-[#8A8F98]">Directory</dt>
                      <dd className="mt-1 sm:mt-0 sm:col-span-2">
                        {checkingPatient ? (
                          <span className="text-xs text-[#8A8F98]">Checking...</span>
                        ) : registeredPatient ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                            <BadgeCheck className="h-3.5 w-3.5" />
                            Registered patient
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleShowRegisterForm}
                            className="inline-flex items-center gap-1.5 text-xs text-[#5E6AD2] hover:text-[#6872D9] transition-colors"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Register this patient
                          </button>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
                <h3 className="text-lg font-medium leading-6 text-[#EDEDEF] flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-[#5E6AD2]" />
                  Appointment Details
                </h3>
                <div className="mt-5 border-t border-white/[0.06]">
                  <dl className="divide-y divide-white/[0.06]">
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-[#8A8F98]">Date</dt>
                      <dd className="mt-1 text-sm text-[#EDEDEF] sm:mt-0 sm:col-span-2">
                        {formatDate(appointment.date)}
                      </dd>
                    </div>
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-[#8A8F98]">Time</dt>
                      <dd className="mt-1 text-sm text-[#EDEDEF] sm:mt-0 sm:col-span-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {formatTime(appointment.time)}
                          {appointment.isLate && appointment.originalTime && (appointment.status === "scheduled" || appointment.status === "confirmed") && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full animate-pulse bg-orange-500/15 text-orange-400 border border-orange-500/30">
                              Running {(() => {
                                const [origH, origM] = appointment.originalTime!.split(":").map(Number)
                                const t = typeof appointment.time === "string" && appointment.time !== "on-call" ? appointment.time : "00:00"
                                const [newH, newM] = t.split(":").map(Number)
                                let diff = (newH * 60 + newM) - (origH * 60 + origM)
                                if (diff < 0) diff += 24 * 60
                                return diff
                              })()}m Late (Originally {formatTime(appointment.originalTime)})
                            </span>
                          )}
                        </div>
                      </dd>
                    </div>
                    {appointment.isLate && appointment.delayReason && (appointment.status === "scheduled" || appointment.status === "confirmed") && (
                      <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                        <dt className="text-sm font-medium text-[#8A8F98]">Delay Reason</dt>
                        <dd className="mt-1 text-sm text-orange-400 sm:mt-0 sm:col-span-2">
                          {appointment.delayReason}
                        </dd>
                      </div>
                    )}
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-[#8A8F98]">Status</dt>
                      <dd className="mt-1 sm:mt-0 sm:col-span-2">
                        <span
                          className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                            appointment.status,
                          )}`}
                        >
                          {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                        </span>
                      </dd>
                    </div>
                    {appointment.doctorName && (
                      <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                        <dt className="text-sm font-medium text-[#8A8F98]">Doctor</dt>
                        <dd className="mt-1 text-sm text-[#EDEDEF] sm:mt-0 sm:col-span-2">
                          Dr. {appointment.doctorName}
                        </dd>
                      </div>
                    )}
                    {appointment.isFollowUp && (
                      <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                        <dt className="text-sm font-medium text-[#8A8F98]">Type</dt>
                        <dd className="mt-1 text-sm sm:mt-0 sm:col-span-2">
                          <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-[#5E6AD2]/15 text-[#5E6AD2] border border-[#5E6AD2]/30">
                            Follow-up Appointment
                          </span>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {appointment.notes && (
                <div className="sm:col-span-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
                  <h3 className="text-lg font-medium leading-6 text-[#EDEDEF] flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-[#5E6AD2]" />
                    Notes
                  </h3>
                  <div className="mt-5 border-t border-white/[0.06] py-4">
                    <p className="text-sm text-[#EDEDEF] whitespace-pre-line">{appointment.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {showRegisterForm && !registeredPatient && (
              <div ref={registerFormRef} className="mt-6 border-t border-white/[0.06] pt-6">
                <h3 className="text-lg font-medium leading-6 text-[#EDEDEF] flex items-center">
                  <UserPlus className="h-5 w-5 mr-2 text-[#5E6AD2]" />
                  Register Patient to Directory
                </h3>
                <p className="mt-1 text-sm text-[#8A8F98]">
                  Add <strong className="text-[#EDEDEF]">{appointment.patientName}</strong> to the patient directory
                </p>
                <form onSubmit={handleRegisterPatient} className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-[#8A8F98]">Name</label>
                      <div className="mt-1">
                        <input
                          type="text"
                          value={appointment.patientName}
                          disabled
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-400 block w-full text-sm px-3 py-2.5 min-h-[44px] opacity-60"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#8A8F98]">Phone</label>
                      <div className="mt-1">
                        <input
                          type="text"
                          value={appointment.patientPhone || ""}
                          disabled
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-400 block w-full text-sm px-3 py-2.5 min-h-[44px] opacity-60"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#8A8F98]">Treatment Required</label>
                      <div className="mt-1">
                        <input
                          ref={registerTreatmentInputRef}
                          type="text"
                          value={registerTreatment}
                          onChange={(e) => setRegisterTreatment(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
                          placeholder="e.g. Consultation, Root Canal"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#8A8F98]">Address</label>
                      <div className="mt-1">
                        <input
                          type="text"
                          value={registerAddress}
                          onChange={(e) => setRegisterAddress(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
                          placeholder="Patient address"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-[#8A8F98]">Notes</label>
                      <div className="mt-1">
                        <textarea
                          rows={2}
                          value={registerNotes}
                          onChange={(e) => setRegisterNotes(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
                          placeholder="Additional notes about the patient"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowRegisterForm(false)}
                      className="px-4 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg text-sm font-medium transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={registering}
                      className="inline-flex items-center justify-center px-4 py-2.5 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      {registering ? "Registering..." : "Register Patient"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {appointment.status === "scheduled" && (
              <div className="mt-6 border-t border-white/[0.06] pt-6">
                <h3 className="text-lg font-medium leading-6 text-[#EDEDEF]">Appointment Actions</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => handleStatusChange("confirmed")}
                    disabled={updating}
                    className="inline-flex items-center px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirm Appointment
                  </button>
                  <button
                    onClick={() => handleStatusChange("cancelled")}
                    disabled={updating}
                    className="inline-flex items-center px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Appointment
                  </button>
                </div>
              </div>
            )}

            {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
              <div className="mt-6 border-t border-white/[0.06] pt-6">
                <h3 className="text-lg font-medium leading-6 text-[#EDEDEF]">Patient Attendance</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => handleStatusChange("completed")}
                    disabled={updating}
                    className="inline-flex items-center px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Patient Attended
                  </button>
                  <button
                    onClick={() => handleStatusChange("missed")}
                    disabled={updating}
                    className="inline-flex items-center px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Patient Missed
                  </button>
                </div>
              </div>
            )}

            {appointment.status === "missed" && (
              <div className="mt-6 border-t border-white/[0.06] pt-6">
                <h3 className="text-lg font-medium leading-6 text-[#EDEDEF]">Reschedule Missed Appointment</h3>
                <div className="mt-4">
                  <Link
                    href={{
                      pathname: "/dashboard/appointments/new",
                      query: { patientName: appointment.patientName, patientPhone: appointment.patientPhone },
                    }}
                    className="inline-flex items-center px-4 py-2 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-sm font-medium transition-colors"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Reschedule Appointment
                  </Link>
                </div>
              </div>
            )}

            {/* Invoice Action — admin and receptionist only */}
            {(userData?.role === "admin" || userData?.role === "receptionist") && (
              <div className="mt-6 border-t border-white/[0.06] pt-6">
                <h3 className="text-lg font-medium leading-6 text-[#EDEDEF] flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-[#5E6AD2]" />
                  Invoice
                </h3>
                <div className="mt-4">
                  {linkedInvoice ? (
                    <Link
                      href={`/dashboard/invoices/${linkedInvoice.id}`}
                      className="inline-flex items-center px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg text-sm font-medium transition-colors"
                    >
                      <Receipt className="h-4 w-4 mr-2" />
                      View Invoice
                      <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${
                        linkedInvoice.status === "paid" ? "bg-emerald-500/15 text-emerald-400" :
                        linkedInvoice.status === "partial" ? "bg-amber-500/15 text-amber-400" :
                        "bg-red-500/15 text-red-400"
                      }`}>
                        {linkedInvoice.status}
                      </span>
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/invoices/new?appointmentId=${id}&patientName=${encodeURIComponent(appointment.patientName)}&patientPhone=${encodeURIComponent(appointment.patientPhone || "")}`}
                      className="inline-flex items-center px-4 py-2 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-sm font-medium transition-colors"
                    >
                      <Receipt className="h-4 w-4 mr-2" />
                      Create Invoice
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showFollowUpForm && (
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-[#EDEDEF] flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-[#5E6AD2]" />
              Schedule Follow-up Appointment
            </h3>
            <div className="mt-2 max-w-xl text-sm text-[#8A8F98]">
              <p>Create a follow-up appointment for this patient.</p>
            </div>

            <form onSubmit={handleCreateFollowUp} className="mt-5 space-y-6">
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label htmlFor="followUpDate" className="block text-sm font-medium text-[#8A8F98]">
                    Follow-up Date *
                  </label>
                  <div className="mt-1">
                    <DatePicker
                      value={followUpDate}
                      onChange={(val) => setFollowUpDate(val)}
                      minDate={new Date()}
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="followUpTime" className="block text-sm font-medium text-[#8A8F98]">
                    Follow-up Time
                  </label>
                  <div className="mt-1">
                    <TimePicker
                      value={followUpTime}
                      onChange={(val) => setFollowUpTime(val)}
                      disabled={followUpIsOnCall}
                    />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="followUpOnCall"
                        checked={followUpIsOnCall}
                        onChange={(e) => setFollowUpIsOnCall(e.target.checked)}
                        className="h-4 w-4 text-[#5E6AD2] focus:ring-[#5E6AD2] border-white/10 rounded bg-[#0F0F12]"
                      />
                      <label htmlFor="followUpOnCall" className="ml-2 block text-sm text-[#EDEDEF]">
                        On Call (No specific time)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <label htmlFor="followUpNotes" className="block text-sm font-medium text-[#8A8F98]">
                    Follow-up Notes
                  </label>
                  <div className="mt-1 relative">
                    <div className="absolute top-3 left-3 flex items-start pointer-events-none">
                      <FileText className="h-5 w-5 text-gray-500" />
                    </div>
                    <textarea
                      id="followUpNotes"
                      rows={3}
                      value={followUpNotes}
                      onChange={(e) => setFollowUpNotes(e.target.value)}
                      className="pl-10 pr-3 py-2.5 block w-full text-sm bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                      placeholder="Reason for follow-up appointment"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowFollowUpForm(false)}
                  className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2 px-4 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="ml-3 inline-flex justify-center py-2 px-4 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {updating ? "Scheduling..." : "Schedule Follow-up"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
