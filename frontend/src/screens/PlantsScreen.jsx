import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PlantsScreen({ selectedUser, onSelectPlant, onBack }) {
  const [locations, setLocations] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationDesc, setNewLocationDesc] = useState("");

  const [showAddPlantModal, setShowAddPlantModal] = useState(false);
  const [targetLocationId, setTargetLocationId] = useState("");
  const [newPlant, setNewPlant] = useState({
    plant_name: "",
    plant_species: "Dendrobium",
  });

  const [editingLocationId, setEditingLocationId] = useState(null);
  const [editLocName, setEditLocName] = useState("");
  const [editLocDesc, setEditLocDesc] = useState("");

  useEffect(() => {
    if (selectedUser) {
      loadUserData();
    }
  }, [selectedUser]);

  const loadUserData = async () => {
    setLoading(true);
    const token = localStorage.getItem("admin_token");
    try {
      const [locRes, plantRes] = await Promise.all([
        fetch(`${API_BASE_URL}/locations/user/${selectedUser.user_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/plants/user/${selectedUser.user_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (locRes.ok) setLocations(await locRes.json());
      if (plantRes.ok) setPlants(await plantRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLocation = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("admin_token");
    try {
      const res = await fetch(`${API_BASE_URL}/locations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location_name: newLocationName,
          description: newLocationDesc,
          user_id: selectedUser.user_id,
        }),
      });

      if (res.ok) {
        setShowAddLocationModal(false);
        setNewLocationName("");
        setNewLocationDesc("");
        loadUserData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateLocation = async (locId) => {
    const token = localStorage.getItem("admin_token");
    try {
      const res = await fetch(`${API_BASE_URL}/locations/${locId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location_name: editLocName,
          description: editLocDesc,
        }),
      });

      if (res.ok) {
        setEditingLocationId(null);
        loadUserData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLocation = async (locId) => {
    if (!window.confirm("Delete this location zone?")) return;
    const token = localStorage.getItem("admin_token");
    try {
      const res = await fetch(`${API_BASE_URL}/locations/${locId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) loadUserData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreatePlant = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("admin_token");
    try {
      const res = await fetch(`${API_BASE_URL}/plants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newPlant,
          location_id: targetLocationId || null,
          user_id: selectedUser.user_id,
        }),
      });

      if (res.ok) {
        setShowAddPlantModal(false);
        setNewPlant({ plant_name: "", plant_species: "Dendrobium" });
        loadUserData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-emerald-600 hover:underline font-semibold mb-1"
          >
            ← Back to Dashboard
          </button>
          <h2 className="text-[#1f2937] text-xl font-bold">
            Locations & Plants for {selectedUser.first_name} {selectedUser.last_name}
          </h2>
          <p className="text-gray-500 text-sm">{selectedUser.email}</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowAddLocationModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition"
          >
            Add Location
          </button>
          <button
            onClick={() => {
              setTargetLocationId("");
              setShowAddPlantModal(true);
            }}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg shadow-sm transition"
          >
            Add Orchid Plant
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading locations and plants...</p>
      ) : (
        <div className="space-y-4">
          {locations.map((loc) => {
            const locPlants = plants.filter((p) => p.location_id === loc.location_id);
            return (
              <div
                key={loc.location_id}
                className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 hover:bg-white transition shadow-xs flex flex-col md:flex-row items-start md:items-stretch gap-6"
              >
                {/* Left Side: Location Info & Actions */}
                <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-200 pb-4 md:pb-0 md:pr-4 flex flex-col justify-between">
                  {editingLocationId === loc.location_id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editLocName}
                        onChange={(e) => setEditLocName(e.target.value)}
                        className="w-full p-1 border rounded text-xs"
                      />
                      <textarea
                        value={editLocDesc}
                        onChange={(e) => setEditLocDesc(e.target.value)}
                        rows={2}
                        className="w-full p-1 border rounded text-xs"
                      />
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleUpdateLocation(loc.location_id)}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px]"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingLocationId(null)}
                          className="px-2 py-1 bg-gray-300 rounded text-[10px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-gray-800 text-base">
                          {loc.location_name}
                        </h3>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {loc.description || "No description provided."}
                      </p>
                      <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                        {locPlants.length} Plants Assigned
                      </span>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 pt-3">
                    <button
                      onClick={() => {
                        setEditingLocationId(loc.location_id);
                        setEditLocName(loc.location_name);
                        setEditLocDesc(loc.description || "");
                      }}
                      className="text-xs text-sky-600 hover:underline font-semibold"
                    >
                      Edit
                    </button>
                    <span className="text-gray-300">•</span>
                    <button
                      onClick={() => handleDeleteLocation(loc.location_id)}
                      className="text-xs text-rose-600 hover:underline font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="flex-1">
                  <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wider mb-2">
                    Plants in this Location:
                  </h4>
                  {locPlants.length === 0 ? (
                    <div className="p-4 rounded-lg bg-gray-100 text-center text-xs text-gray-400">
                      No plants registered in this zone yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {locPlants.map((p) => (
                        <div
                          key={p.plant_id}
                          onClick={() => onSelectPlant(p)}
                          className="p-3 bg-white border border-gray-200 rounded-lg hover:border-emerald-500 hover:shadow-xs cursor-pointer transition flex items-center space-x-3"
                        >
                          <span className="text-2xl">🪴</span>
                          <div className="overflow-hidden">
                            <h5 className="font-bold text-sm text-gray-800 truncate">
                              {p.plant_name}
                            </h5>
                            <p className="text-xs text-emerald-600 font-semibold">
                              {p.plant_species}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Unassigned Plants Section */}
          {plants.filter((p) => !p.location_id).length > 0 && (
            <div className="border border-dashed border-gray-300 rounded-xl p-5 bg-gray-50/30">
              <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wider mb-3">
                Unassigned Plants (No Location)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {plants
                  .filter((p) => !p.location_id)
                  .map((p) => (
                    <div
                      key={p.plant_id}
                      onClick={() => onSelectPlant(p)}
                      className="p-3 bg-white border border-gray-200 rounded-lg hover:border-emerald-500 cursor-pointer transition flex items-center space-x-3"
                    >
                      <span className="text-2xl">🪴</span>
                      <div className="overflow-hidden">
                        <h5 className="font-bold text-sm text-gray-800 truncate">
                          {p.plant_name}
                        </h5>
                        <p className="text-xs text-emerald-600 font-semibold">
                          {p.plant_species}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Location Modal */}
      {showAddLocationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Add Location Zone</h3>
            <form onSubmit={handleCreateLocation} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Location Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Balcony Orchid Shelf"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., East facing indirect morning sun"
                  value={newLocationDesc}
                  onChange={(e) => setNewLocationDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddLocationModal(false)}
                  className="px-4 py-2 text-xs bg-gray-200 rounded-lg text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-emerald-600 font-bold rounded-lg text-white"
                >
                  Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Plant Modal */}
      {showAddPlantModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Add Orchid Plant</h3>
            <form onSubmit={handleCreatePlant} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Plant Name / Identifier
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Dendrobium Nobile #1"
                  value={newPlant.plant_name}
                  onChange={(e) =>
                    setNewPlant({ ...newPlant, plant_name: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Species
                </label>
                <select
                  value={newPlant.plant_species}
                  onChange={(e) =>
                    setNewPlant({ ...newPlant, plant_species: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Dendrobium">Dendrobium</option>
                  <option value="Phalaenopsis">Phalaenopsis</option>
                  <option value="Oncidium">Oncidium</option>
                  <option value="Cattleya">Cattleya</option>
                  <option value="Vanda">Vanda</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Assign Location
                </label>
                <select
                  value={targetLocationId}
                  onChange={(e) => setTargetLocationId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">-- No Specific Location --</option>
                  {locations.map((l) => (
                    <option key={l.location_id} value={l.location_id}>
                      {l.location_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddPlantModal(false)}
                  className="px-4 py-2 text-xs bg-gray-200 rounded-lg text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-emerald-600 font-bold rounded-lg text-white"
                >
                  Save Plant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}