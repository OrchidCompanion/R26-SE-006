import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function DashboardScreen({ user, onSelectUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6">
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

      {/* Registered Users Selection */}
      <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm">
        <h2 className="text-[#1f2937] text-xl font-bold mb-2">Select User to Inspect</h2>
        <p className="text-gray-500 text-sm mb-4">
          Click on any user below to view their registered orchid plants and telemetry history.
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
                  <span className="text-emerald-600 font-semibold">View Plants →</span>
                  <span className="text-gray-400">
                    Joined {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}