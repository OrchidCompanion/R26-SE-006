import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function DashboardScreen({
  user,
  onSelectUser,
  onNavigateToIdentifySpecies,
  onNavigateToAnalyseLocation,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add User Modal State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    role: "user",
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreatingUser(true);
    setModalError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to create user.");
      }

      setShowAddUserModal(false);
      setNewUser({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        role: "user",
      });
      fetchUsers();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Action Navigation Bar */}
      <div className="flex flex-wrap justify-center items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
        <button
          onClick={onNavigateToIdentifySpecies}
          className="flex items-center space-x-2 px-5 py-3 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-md transition transform hover:-translate-y-0.5 text-sm"
        >
          <span className="text-lg">🌸</span>
          <span>Identify Orchid Species</span>
        </button>
        <button
          onClick={onNavigateToAnalyseLocation}
          className="flex items-center space-x-2 px-5 py-3 bg-linear-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white font-bold rounded-xl shadow-md transition transform hover:-translate-y-0.5 text-sm"
        >
          <span className="text-lg">📡</span>
          <span>Analyse Location</span>
        </button>
        <button
          onClick={() => setShowAddUserModal(true)}
          className="flex items-center space-x-2 px-5 py-3 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold rounded-xl shadow-md transition transform hover:-translate-y-0.5 text-sm"
        >
          <span className="text-lg">👤</span>
          <span>+ Add User</span>
        </button>
      </div>

      {/* System Overview Card */}
      <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm">
        <h2 className="text-[#1f2937] text-xl font-bold mb-4">System Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-4 bg-[#ecfdf5] rounded-lg border border-[#10b981]/20">
            <h3 className="text-[#059669] text-sm font-semibold">Registered Users</h3>
            <p className="text-[#1f2937] text-2xl font-extrabold mt-1">
              {loading ? "..." : users.length}
            </p>
          </div>
          <div className="p-4 bg-[#ecfdf5] rounded-lg border border-[#10b981]/20">
            <h3 className="text-[#059669] text-sm font-semibold">User Role</h3>
            <p className="text-[#1f2937] text-xl font-extrabold mt-1 uppercase">
              {user.role}
            </p>
          </div>
          <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
            <h3 className="text-[#0284c7] text-sm font-semibold">Admin Account</h3>
            <p className="text-[#1f2937] text-base font-semibold mt-1 truncate">
              {user.email}
            </p>
          </div>
        </div>
      </div>

      {/* Registered Users Section */}
      <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-[#1f2937] text-xl font-bold">Select User to Inspect</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          Click on any user below to inspect their locations, plants, and sensor telemetry.
        </p>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-gray-500 text-sm">No regular users registered yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {users.map((u) => (
              <div
                key={u.user_id}
                onClick={() => onSelectUser(u)}
                className="p-4 border border-gray-200 rounded-lg hover:border-[#059669] hover:bg-emerald-50/30 cursor-pointer transition shadow-xs"
              >
                <h3 className="font-bold text-gray-800 text-lg">
                  {u.first_name} {u.last_name}
                </h3>
                <p className="text-sm text-gray-500 truncate">{u.email}</p>
                <div className="mt-3 flex justify-between items-center text-xs">
                  <span className="text-emerald-600 font-semibold">View Locations & Plants →</span>
                  <span className="text-gray-400">
                    Joined {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Register User Popup Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Register New User</h3>

            {modalError && (
              <div className="bg-rose-50 text-rose-700 text-xs p-3 rounded-lg border border-rose-200">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newUser.first_name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, first_name: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newUser.last_name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, last_name: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 text-xs bg-gray-200 hover:bg-gray-300 font-semibold rounded-lg text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold rounded-lg text-white disabled:opacity-50"
                >
                  {creatingUser ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}