"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { User } from "@/lib/types"
import { Edit, Trash, UserIcon } from "lucide-react"
import ProtectedRoute from "@/components/ProtectedRoute"

export default function UsersManagement() {
  const { userData } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editRole, setEditRole] = useState<string>("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersRef = collection(db, "users")
        const querySnapshot = await getDocs(usersRef)

        const usersList: User[] = []
        querySnapshot.forEach((doc) => {
          const userData = doc.data() as User
          usersList.push({
            ...userData,
            uid: doc.id,
          })
        })

        setUsers(usersList)
      } catch (error) {
        console.error("Error fetching users:", error)
        setError("Failed to load users")
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [])

  const handleRoleChange = async () => {
    if (!editingUser) return

    try {
      const userRef = doc(db, "users", editingUser.uid)
      await updateDoc(userRef, {
        role: editRole,
      })

      // Update local state
      setUsers(users.map((user) => (user.uid === editingUser.uid ? { ...user, role: editRole as any } : user)))

      setEditingUser(null)
    } catch (error) {
      console.error("Error updating user role:", error)
      setError("Failed to update user role")
    }
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      const userRef = doc(db, "users", userId)
      await deleteDoc(userRef)

      // Update local state
      setUsers(users.filter((user) => user.uid !== userId))

      setShowDeleteConfirm(null)
    } catch (error) {
      console.error("Error deleting user:", error)
      setError("Failed to delete user")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#EDEDEF]">User Management</h1>
          <p className="mt-1 text-sm text-[#8A8F98]">Manage user roles and permissions</p>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">{error}</div>}

        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="px-4 py-5 border-b border-white/[0.06] sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-[#EDEDEF]">Users</h3>
          </div>
          <div className="overflow-hidden">
            {users.length === 0 ? (
              <div className="text-center py-8 text-[#8A8F98]">No users found.</div>
            ) : (
              <table className="min-w-full divide-y divide-white/[0.06]">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider"
                    >
                      Name
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider"
                    >
                      Email
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider"
                    >
                      Role
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-[#8A8F98] uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-transparent divide-y divide-white/[0.06]">
                  {users.map((user) => (
                    <tr key={user.uid} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 rounded-full">
                            <UserIcon className="h-5 w-5 text-[#5E6AD2]" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-[#EDEDEF]">{user.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[#8A8F98]">{user.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingUser?.uid === user.uid ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/20 focus:border-[#5E6AD2] block w-full px-3 py-2.5 transition-colors"
                          >
                            <option value="receptionist">Receptionist</option>
                            <option value="doctor">Doctor</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              user.role === "admin"
                                ? "bg-purple-500/15 text-purple-400"
                                : user.role === "doctor"
                                  ? "bg-green-500/15 text-green-400"
                                  : "bg-blue-500/15 text-blue-400"
                            }`}
                          >
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {editingUser?.uid === user.uid ? (
                          <div className="flex justify-end space-x-2">
                            <button onClick={handleRoleChange} className="text-[#5E6AD2] hover:text-[#6872D9] transition-colors">
                              Save
                            </button>
                            <button onClick={() => setEditingUser(null)} className="text-[#8A8F98] hover:text-[#EDEDEF] transition-colors">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => {
                                setEditingUser(user)
                                setEditRole(user.role)
                              }}
                              className="text-[#8A8F98] hover:text-[#EDEDEF] transition-colors"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(user.uid)}
                              className="text-red-400/70 hover:text-red-400 transition-colors"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl p-6 max-w-md w-full">
              <h3 className="text-lg font-medium text-[#EDEDEF]">Delete User</h3>
              <p className="mt-2 text-sm text-[#8A8F98]">
                Are you sure you want to delete this user? This action cannot be undone.
              </p>
              <div className="mt-4 flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg text-sm font-medium transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteUser(showDeleteConfirm)}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors focus:outline-none"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
