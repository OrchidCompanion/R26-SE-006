import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PlantsScreen({ selectedUser, onSelectPlant, onBack }) {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPlant, setEditingPlant] = useState(null);
  const [formData, setFormData] = useState({ plant_name: "", plant_species: "", plant_location: "" });

  useEffect(() => {
    if (selectedUser) {
      fetchPlants();
    }
  }, [selectedUser]);

  const fetchPlants = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/plants/user/${selectedUser.user_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPlants(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (p) => {
    setEditingPlant(p.plant_id);
    setFormData({ plant_name: p.plant_name, plant_species: p.plant_species, plant_location: p.plant_location });
  };

  const handleUpdate = async (plantId) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/plants/${plantId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setEditingPlant(null);
        fetchPlants();
      } else {
        alert("Failed to update plant.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (plantId) => {
    if (!window.confirm("Are you sure you want to delete this plant?")) return;

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/plants/${plantId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        fetchPlants();
      } else {
        alert("Failed to delete plant.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-4">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-emerald-600 hover:underline font-semibold mb-1"
          >
            ← Back to Users
          </button>
          <h2 className="text-[#1f2937] text-xl font-bold">
            Plants for {selectedUser.first_name} {selectedUser.last_name}
          </h2>
          <p className="text-gray-500 text-sm">{selectedUser.email}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading plants...</p>
      ) : plants.length === 0 ? (
        <p className="text-gray-500 text-sm">No active plants registered for this user.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#1f2937]">
            <thead className="bg-[#f9fafb] text-[#6b7280] uppercase text-xs border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Plant Name</th>
                <th className="px-4 py-3">Species</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {plants.map((p) => (
                <tr key={p.plant_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    {editingPlant === p.plant_id ? (
                      <input
                        type="text"
                        value={formData.plant_name}
                        onChange={(e) => setFormData({ ...formData, plant_name: e.target.value })}
                        className="border p-1 rounded text-xs w-32"
                      />
                    ) : (
                      p.plant_name
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingPlant === p.plant_id ? (
                      <input
                        type="text"
                        value={formData.plant_species}
                        onChange={(e) => setFormData({ ...formData, plant_species: e.target.value })}
                        className="border p-1 rounded text-xs w-32"
                      />
                    ) : (
                      p.plant_species
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingPlant === p.plant_id ? (
                      <input
                        type="text"
                        value={formData.plant_location}
                        onChange={(e) => setFormData({ ...formData, plant_location: e.target.value })}
                        className="border p-1 rounded text-xs w-32"
                      />
                    ) : (
                      p.plant_location
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {editingPlant === p.plant_id ? (
                      <>
                        <button
                          onClick={() => handleUpdate(p.plant_id)}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingPlant(null)}
                          className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => onSelectPlant(p)}
                          className="px-3 py-1 bg-emerald-100 text-emerald-700 font-semibold rounded text-xs hover:bg-emerald-200"
                        >
                          Telemetry & Outputs
                        </button>
                        <button
                          onClick={() => handleEditClick(p)}
                          className="px-2 py-1 bg-sky-100 text-sky-700 font-semibold rounded text-xs hover:bg-sky-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(p.plant_id)}
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