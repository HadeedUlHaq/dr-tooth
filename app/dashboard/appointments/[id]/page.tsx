"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { getAppointment, updateAppointment, deleteAppointment, createAppointment } from "@/lib/appointmentService"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Appointment, User } from "@/lib/types"
import { Edit, Trash } from "lucide-react"
import Link from "next/link"

export default function AppointmentDetail({ params }: { params: { id: string } }) {
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
  const [status, setStatus] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState("")
  const [showFollowUpForm, setShowFollowUpForm] = useState(false)
  const [followUpDate, setFollowUpDate] = useState("")
  const [followUpTime, setFollowUpTime] = useState("")
  const [followUpIsOnCall, setFollowUpIsOnCall] = useState(false)
  const [followUpNotes, setFollowUpNotes] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    const fetchAppointment = async () => {
      try {
        const appointmentData = await getAppointment(params.id)
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
          doctorsList.push({ ...doc.data(), id: doc.id } as User)
        })

        setDoctors(doctorsList)
      } catch (error) {
        console.error("Error fetching doctors:", error)
      }
    }

    fetchAppointment()
    fetchDoctors()
  }, [params.id])

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
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
        return "bg-blue-100 text-blue-800"
      case "confirmed":
        return "bg-green-100 text-green-800"
      case "completed":
        return "bg-purple-100 text-purple-800"
      case "missed":
        return "bg-red-100 text-red-800"
      case "cancelled":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
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
        doctorId: doctorId || null,
        doctorName: selectedDoctor ? selectedDoctor.name : null,
        notes,
        status,
        updatedBy: user?.uid || "",
      }

      await updateAppointment(params.id, appointmentData)

      // Refresh appointment data
      const updatedAppointment = await getAppointment(params.id)
      setAppointment(updatedAppointment)

      setIsEditing(false)
    } catch (error: any) {
      setError(error.message || "Failed to update appointment")
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true)

    try {
      await updateAppointment(params.id, {
        status: newStatus,
        updatedBy: user?.uid || "",
      })

      // Refresh appointment data
      const updatedAppointment = await getAppointment(params.id)
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
        doctorId: doctorId || null,
        doctorName: selectedDoctor ? selectedDoctor.name : null,
        notes: followUpNotes,
        status: "scheduled",
        isFollowUp: true,
        previousAppointmentId: params.id,
        createdBy: user?.uid || "",
      }

      await createAppointment(followUpData as any)
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
      await deleteAppointment(params.id)
      router.push("/dashboard/appointments")
    } catch (error: any) {
      setError(error.message || "Failed to delete appointment")
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!appointment) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-semibold text-gray-900">Appointment Not Found</h2>
        <p className="mt-2 text-gray-500">The appointment you're looking for doesn't exist or has been deleted.</p>
        <Link
          href="/dashboard/appointments"
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90"
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
          <h1 className="text-2xl font-semibold text-gray-900">Appointment Details</h1>
          <p className="mt-1 text-sm text-gray-500">View and manage appointment information</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          {!isEditing &&
            (userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </button>
                {(userData?.role === "receptionist" || userData?.role === "admin") && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center px-4 py-2 border border-error rounded-md shadow-sm text-sm font-medium text-white bg-error hover:bg-error/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error"
                  >
                    <Trash className="h-4 w-4 mr-2" />
                    Delete
                  </button>
                )}
              </>
            )}
        </div>
      </div>

      {error && <div className="bg-error/10 border border-error text-error px-4 py-3 rounded">{error}</div>}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900">Delete Appointment</h3>
            <p className="mt-2 text-sm text-gray-500">
              Are you sure you want to delete this appointment? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={updating}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-error hover:bg-error/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error disabled:opacity-50"
              >
                {updating ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {isEditing ? (
          <div className="px-4 py-5 sm:p-6">
            <form onSubmit={handleUpdate} className="space-y-6">
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

                <div className="sm:col-span-3">
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                    Date *
                  </label>
                  <div className="mt-1">
                    <input
                      type="date"
                      id="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
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
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
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

                <div className="sm:col-span-3">
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <div className="mt-1">
                    <select
                      id="status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
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
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="bg-gray-200 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                >
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="px-4 py-5 sm:p-6">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Patient Information</h3>
                <div className="mt-5 border-t border-gray-200">
                  <dl className="divide-y divide-gray-200">
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-gray-500">Name</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{appointment.patientName}</dd>
                    </div>
                    {appointment.patientPhone && (
                      <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                        <dt className="text-sm font-medium text-gray-500">Phone</dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{appointment.patientPhone}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Appointment Details</h3>
                <div className="mt-5 border-t border-gray-200">
                  <dl className="divide-y divide-gray-200">
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-gray-500">Date</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {formatDate(appointment.date)}
                      </dd>
                    </div>
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-gray-500">Time</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {formatTime(appointment.time)}
                      </dd>
                    </div>
                    <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                      <dt className="text-sm font-medium text-gray-500">Status</dt>
                      <dd className="mt-1 sm:mt-0 sm:col-span-2">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                            appointment.status,
                          )}`}
                        >
                          {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                        </span>
                      </dd>
                    </div>
                    {appointment.doctorName && (
                      <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                        <dt className="text-sm font-medium text-gray-500">Doctor</dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          Dr. {appointment.doctorName}
                        </dd>
                      </div>
                    )}
                    {appointment.isFollowUp && (
                      <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                        <dt className="text-sm font-medium text-gray-500">Type</dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-accent/20 text-accent">
                            Follow-up Appointment
                          </span>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {appointment.notes && (
                <div className="sm:col-span-2">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Notes</h3>
                  <div className="mt-5 border-t border-gray-200 py-4">
                    <p className="text-sm text-gray-900 whitespace-pre-line">{appointment.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {appointment.status === "scheduled" && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Appointment Actions</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => handleStatusChange("confirmed")}
                    disabled={updating}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-success hover:bg-success/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-success disabled:opacity-50"
                  >
                    Confirm Appointment
                  </button>
                  <button
                    onClick={() => handleStatusChange("cancelled")}
                    disabled={updating}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-error hover:bg-error/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error disabled:opacity-50"
                  >
                    Cancel Appointment
                  </button>
                </div>
              </div>
            )}

            {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Patient Attendance</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => handleStatusChange("completed")}
                    disabled={updating}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-success hover:bg-success/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-success disabled:opacity-50"
                  >
                    Patient Attended
                  </button>
                  <button
                    onClick={() => handleStatusChange("missed")}
                    disabled={updating}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-error hover:bg-error/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error disabled:opacity-50"
                  >
                    Patient Missed
                  </button>
                </div>
              </div>
            )}

            {appointment.status === "missed" && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Reschedule Missed Appointment</h3>
                <div className="mt-4">
                  <Link
                    href={{
                      pathname: "/dashboard/appointments/new",
                      query: { patientName: appointment.patientName, patientPhone: appointment.patientPhone },
                    }}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  >
                    Reschedule Appointment
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showFollowUpForm && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Schedule Follow-up Appointment</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Create a follow-up appointment for this patient.</p>
            </div>

            <form onSubmit={handleCreateFollowUp} className="mt-5 space-y-6">
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label htmlFor="followUpDate" className="block text-sm font-medium text-gray-700">
                    Follow-up Date *
                  </label>
                  <div className="mt-1">
                    <input
                      type="date"
                      id="followUpDate"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                      required
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="followUpTime" className="block text-sm font-medium text-gray-700">
                    Follow-up Time
                  </label>
                  <div className="mt-1">
                    <input
                      type="time"
                      id="followUpTime"
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                      disabled={followUpIsOnCall}
                      className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="followUpOnCall"
                        checked={followUpIsOnCall}
                        onChange={(e) => setFollowUpIsOnCall(e.target.checked)}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <label htmlFor="followUpOnCall" className="ml-2 block text-sm text-gray-900">
                        On Call (No specific time)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <label htmlFor="followUpNotes" className="block text-sm font-medium text-gray-700">
                    Follow-up Notes
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="followUpNotes"
                      rows={3}
                      value={followUpNotes}
                      onChange={(e) => setFollowUpNotes(e.target.value)}
                      className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md"
                      placeholder="Reason for follow-up appointment"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowFollowUpForm(false)}
                  className="bg-gray-200 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
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

