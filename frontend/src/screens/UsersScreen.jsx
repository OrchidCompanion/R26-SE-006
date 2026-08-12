import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function UsersScreen({ onSelectUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ first_name: "", last_name: "", email: "" });

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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (u) => {
    setEditingUser(u.user_id);
    setFormData({ first_name: u.first_name, last_name: u.last_name, email: u.email });
  };

  const handleUpdate = async (userId) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setEditingUser(null);
        fetchUsers();
      } else {
        alert("Failed to update user.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        fetchUsers();
      } else {
        alert("Failed to delete user.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-[#1f2937] text-xl font-bold">User Directory</h2>
          <p className="text-gray-500 text-sm">Manage user accounts and view user-specific plant telemetry.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading user list...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#1f2937]">
            <thead className="bg-[#f9fafb] text-[#6b7280] uppercase text-xs border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">User Name</th>
                <th className="px-4 py-3">Email Address</th>
                <th className="px-4 py-3">Joined Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {users.map((u) => (
                <tr key={u.user_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    {editingUser === u.user_id ? (
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                          className="border p-1 rounded text-xs w-24"
                        />
                        <input
                          type="text"
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          className="border p-1 rounded text-xs w-24"
                        />
                      </div>
                    ) : (
                      `${u.first_name} ${u.last_name}`
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === u.user_id ? (
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="border p-1 rounded text-xs w-48"
                      />
                    ) : (
                      u.email
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {editingUser === u.user_id ? (
                      <>
                        <button
                          onClick={() => handleUpdate(u.user_id)}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingUser(null)}
                          className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => onSelectUser(u)}
                          className="px-3 py-1 bg-emerald-100 text-emerald-700 font-semibold rounded text-xs hover:bg-emerald-200"
                        >
                          View Plants
                        </button>
                        <button
                          onClick={() => handleEditClick(u)}
                          className="px-2 py-1 bg-sky-100 text-sky-700 font-semibold rounded text-xs hover:bg-sky-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(u.user_id)}
                          className="px-2 py-1 bg-rose-100 text-rose-700 font-semibold rounded text-xs hover:bg-rose-200"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}