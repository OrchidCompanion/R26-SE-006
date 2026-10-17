import React, { useState, useEffect, useRef } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PlantsScreen({ selectedUser, onSelectPlant, onNavigateToSensors, onBack }) {
  const [locations, setLocations] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sensor Hardware & Selection State
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [sensorStatus, setSensorStatus] = useState(null);
  const [actionError, setActionError] = useState("");

  // Ambient Telemetry Sampling State
  const [readingResults, setReadingResults] = useState({});
  const [activeReadingSlot, setActiveReadingSlot] = useState(null);

  // Modals & CRUD State
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationDesc, setNewLocationDesc] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationModalError, setLocationModalError] = useState("");

  const [showAddPlantModal, setShowAddPlantModal] = useState(false);
  const [targetLocationId, setTargetLocationId] = useState("");
  const [newPlant, setNewPlant] = useState({
    plant_name: "",
    plant_species: "Dendrobium",
  });
  const [savingPlant, setSavingPlant] = useState(false);
  const [plantModalError, setPlantModalError] = useState("");

  const [editingLocationId, setEditingLocationId] = useState(null);
  const [editLocName, setEditLocName] = useState("");
  const [editLocDesc, setEditLocDesc] = useState("");

  useEffect(() => {
    if (selectedUser) {
      loadUserData();
      fetchUserModules(selectedUser.user_id);
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
      console.error("Error loading user data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserModules = async (userId) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/sensors/modules/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setModules(data);
        if (data.length > 0) {
          const envMod = data.find((m) => m.module_id === "a4cf129b88e0" || m.device_name?.toLowerCase().includes("env"));
          setSelectedModuleId(envMod ? envMod.module_id : data[0].module_id);
        }
      }
    } catch (err) {
      console.error("Error fetching user modules:", err);
    }
  };

  const handleCheckSensorStatus = async () => {
    if (!selectedModuleId) return;
    setCheckingStatus(true);
    setSensorStatus(null);
    setActionError("");

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(
        `${API_BASE_URL}/sensors/modules/${selectedModuleId}/status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        setSensorStatus(await res.json());
      } else {
        setSensorStatus({
          online: false,
          dht11: false,
          bh1750: false,
          msg: "Device did not respond.",
        });
      }
    } catch {
      setSensorStatus({
        online: false,
        dht11: false,
        bh1750: false,
        msg: "Failed to connect to sensor module.",
      });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleReadAmbientData = async (locationId, timeSlot) => {
    if (!selectedModuleId) {
      setActionError("Please select a sensor module.");
      return;
    }
    const slotKey = `${locationId}_${timeSlot}`;
    setActiveReadingSlot(slotKey);
    setActionError("");

    try {
      const token = localStorage.getItem("admin_token");
      const readRes = await fetch(
        `${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-ambient`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!readRes.ok) {
        const errorData = await readRes.json().catch(() => ({}));
        throw new Error(errorData.detail || "Ambient sensor read failed.");
      }

      const data = await readRes.json();
      const temp = Number(data.temperature ?? 0);
      const hum = Number(data.humidity ?? 0);
      const lux = Number(data.lux ?? 0);

      const targetUserId =
        selectedUser?.user_id ||
        selectedUser?.id ||
        (localStorage.getItem("admin_user")
          ? JSON.parse(localStorage.getItem("admin_user")).user_id
          : "");

      await Promise.all([
        fetch(`${API_BASE_URL}/sensors/dht11`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            temperature: temp,
            humidity: hum,
            time_slot: timeSlot,
            location_id: locationId,
            module_id: selectedModuleId,
            user_id: targetUserId,
          }),
        }),
        fetch(`${API_BASE_URL}/sensors/bh1750`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            lux: lux,
            time_slot: timeSlot,
            location_id: locationId,
            module_id: selectedModuleId,
            user_id: targetUserId,
          }),
        }),
      ]);

      setReadingResults((prev) => ({
        ...prev,
        [slotKey]: {
          temp,
          hum,
          lux,
          timestamp: new Date().toLocaleTimeString(),
        },
      }));
    } catch (err) {
      console.error(err);
      setActionError(err.message || `Error reading ambient data for ${timeSlot}.`);
    } finally {
      setActiveReadingSlot(null);
    }
  };

  const handleCreateLocation = async (e) => {
    e.preventDefault();
    if (!newLocationName.trim()) {
      setLocationModalError("Please enter a location name.");
      return;
    }

    setSavingLocation(true);
    setLocationModalError("");

    const token = localStorage.getItem("admin_token");
    const targetUserId =
      selectedUser?.user_id ||
      selectedUser?.id ||
      (localStorage.getItem("admin_user")
        ? JSON.parse(localStorage.getItem("admin_user")).user_id
        : "");

    try {
      const res = await fetch(`${API_BASE_URL}/locations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location_name: newLocationName.trim(),
          description: newLocationDesc.trim(),
          user_id: targetUserId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to create location zone.");
      }

      setShowAddLocationModal(false);
      setNewLocationName("");
      setNewLocationDesc("");
      loadUserData();
    } catch (err) {
      console.error("Error creating location:", err);
      setLocationModalError(err.message || "Failed to save location.");
    } finally {
      setSavingLocation(false);
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
    if (!window.confirm("Are you sure you want to delete this location zone? Plants in this location will become unassigned.")) return;
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
    if (!newPlant.plant_name.trim()) {
      setPlantModalError("Please enter a plant name.");
      return;
    }

    setSavingPlant(true);
    setPlantModalError("");

    const token = localStorage.getItem("admin_token");
    const targetUserId =
      selectedUser?.user_id ||
      selectedUser?.id ||
      (localStorage.getItem("admin_user")
        ? JSON.parse(localStorage.getItem("admin_user")).user_id
        : "");

    try {
      const res = await fetch(`${API_BASE_URL}/plants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newPlant,
          plant_name: newPlant.plant_name.trim(),
          location_id: targetLocationId || null,
          user_id: targetUserId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to create orchid plant.");
      }

      setShowAddPlantModal(false);
      setNewPlant({ plant_name: "", plant_species: "Dendrobium" });
      loadUserData();
    } catch (err) {
      console.error("Error creating plant:", err);
      setPlantModalError(err.message || "Failed to save plant.");
    } finally {
      setSavingPlant(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-bold mb-1.5 inline-flex items-center gap-1 transition"
          >
            ← Back to Dashboard
          </button>
          <h2 className="text-[#1f2937] text-2xl font-black tracking-tight">
            Zone Locations & Plants
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span>Owner: <strong className="text-gray-700">{selectedUser.first_name} {selectedUser.last_name}</strong></span>
            <span>•</span>
            <span>{selectedUser.email}</span>
            <span>•</span>
            <span className="text-emerald-600 font-semibold">{locations.length} Zones</span>
            <span>•</span>
            <span className="text-teal-600 font-semibold">{plants.length} Plants</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => setShowAddLocationModal(true)}
            className="flex-1 md:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            + New Location Zone
          </button>
          <button
            onClick={() => {
              setTargetLocationId("");
              setShowAddPlantModal(true);
            }}
            className="flex-1 md:flex-none px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            + Add Orchid Plant
          </button>
          <button
            onClick={onNavigateToSensors}
            className="flex-1 md:flex-none px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            Manage Sensors
          </button>
        </div>
      </div>



      {/* Locations Container */}
      {loading ? (
        <div className="p-12 text-center bg-white border rounded-2xl">
          <p className="text-gray-400 text-sm font-medium">Loading locations and plants...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {locations.map((loc) => {
            const locPlants = plants.filter((p) => p.location_id === loc.location_id);
            return (
              <div
                key={loc.location_id}
                className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden transition-all duration-200 hover:shadow-md"
              >
                {/* Zone Top Bar */}
                <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  {editingLocationId === loc.location_id ? (
                    <div className="w-full flex-1 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editLocName}
                          onChange={(e) => setEditLocName(e.target.value)}
                          className="px-3 py-1.5 border border-emerald-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                          placeholder="Zone Name"
                        />
                        <input
                          type="text"
                          value={editLocDesc}
                          onChange={(e) => setEditLocDesc(e.target.value)}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                          placeholder="Zone Description"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateLocation(loc.location_id)}
                          className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => setEditingLocationId(null)}
                          className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-gray-900 font-black text-lg tracking-tight">
                          {loc.location_name}
                        </h3>
                        <span className="px-2.5 py-0.5 bg-emerald-100/70 text-emerald-800 text-[11px] font-bold rounded-full">
                          {locPlants.length} Plants Assigned
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {loc.description || "No description provided."}
                      </p>
                    </div>
                  )}

                  {editingLocationId !== loc.location_id && (
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        onClick={() => {
                          setTargetLocationId(loc.location_id);
                          setShowAddPlantModal(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200/60 transition"
                      >
                        + Add Plant
                      </button>
                      <button
                        onClick={() => {
                          setEditingLocationId(loc.location_id);
                          setEditLocName(loc.location_name);
                          setEditLocDesc(loc.description || "");
                        }}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteLocation(loc.location_id)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg border border-rose-200/60 transition"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Zone Body: Ambient Telemetry & Zone Plants */}
                <div className="p-6 space-y-6">
                  {/* Zone Ambient Telemetry (mirrors Daily Plant NPK Sampling) */}
                  <div className="border border-teal-200 bg-teal-50/20 rounded-xl p-5 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-teal-100 pb-3">
                      <div>
                        <h4 className="font-bold text-gray-800 text-base">
                          Environment Sensor Readings
                        </h4>
                        <p className="text-xs text-gray-500">
                          Trigger instant live ambient readings (DHT11 & BH1750) from the connected ESP32-S3 node via MQTT.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full md:w-auto">
                        <select
                          value={selectedModuleId}
                          onChange={(e) => {
                            setSelectedModuleId(e.target.value);
                            setSensorStatus(null);
                          }}
                          className="text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none w-full sm:w-auto"
                        >
                          <option value="">-- Select Sensor Module --</option>
                          {modules.map((m) => (
                            <option key={m.module_id} value={m.module_id}>
                              {m.device_name} ({m.module_id})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleCheckSensorStatus}
                          disabled={checkingStatus || !selectedModuleId}
                          className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 shrink-0 w-full sm:w-auto"
                        >
                          {checkingStatus ? "Checking..." : "Check Status"}
                        </button>
                      </div>
                    </div>

                    {/* Status Indicator Banner */}
                    {sensorStatus && (
                      <div
                        className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between ${sensorStatus.online
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                            : "bg-rose-50 border border-rose-200 text-rose-800"
                          }`}
                      >
                        <span>
                          <strong>Module Status:</strong> {sensorStatus.online ? "Online & Ready" : "Disconnected / Offline"} (
                          {sensorStatus.msg || (sensorStatus.online ? "Ready" : "Offline")})
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider">
                          {sensorStatus.device || (modules.find((m) => m.module_id === selectedModuleId)?.device_name) || "Node"}
                        </span>
                      </div>
                    )}

                    {actionError && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium">
                        {actionError}
                      </div>
                    )}

                    {/* Ambient Time-slot Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {["morning", "afternoon", "evening"].map((slot) => {
                        const key = `${loc.location_id}_${slot}`;
                        const res = readingResults[key];
                        const isLoading = activeReadingSlot === key;

                        return (
                          <div
                            key={slot}
                            className="p-3.5 bg-white border border-gray-200 rounded-xl flex flex-col justify-between space-y-3 shadow-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="capitalize font-bold text-xs text-gray-800">
                                {slot} Reading
                              </span>
                              <span className="text-[10px] uppercase font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                                ENV
                              </span>
                            </div>

                            {res ? (
                              <div className="text-xs font-semibold space-y-1">
                                <div className="text-rose-600">
                                  Temperature (T): <strong>{res.temp} °C</strong>
                                </div>
                                <div className="text-sky-600">
                                  Humidity (RH): <strong>{res.hum} %</strong>
                                </div>
                                <div className="text-amber-700">
                                  Light (Lux): <strong>{res.lux} Lux</strong>
                                </div>
                                <span className="text-gray-400 text-[10px] block pt-1">
                                  Logged at {res.timestamp}
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic">
                                No reading recorded for {slot}.
                              </p>
                            )}

                            <button
                              onClick={() => handleReadAmbientData(loc.location_id, slot)}
                              disabled={isLoading}
                              className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg shadow-xs transition disabled:opacity-50"
                            >
                              {isLoading ? "Reading Sensor..." : "Read Ambient Data"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Zone Plants */}
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider">
                        Zone Plants ({locPlants.length})
                      </h4>
                      <span className="text-[11px] text-gray-400">
                        Select plant to view diagnostics & NPK
                      </span>
                    </div>

                    {locPlants.length === 0 ? (
                      <div className="p-8 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-center">
                        <span className="text-3xl block mb-1">🪴</span>
                        <p className="text-xs font-semibold text-gray-600">
                          No orchids registered in this zone
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Click "+ Add Plant" above to register an orchid in this location
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {locPlants.map((p) => (
                          <div
                            key={p.plant_id}
                            onClick={() => onSelectPlant(p)}
                            className="group p-3.5 bg-white border border-gray-200 rounded-xl hover:border-emerald-500 hover:shadow-sm cursor-pointer transition-all flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                                🪴
                              </div>
                              <div className="overflow-hidden">
                                <h5 className="font-bold text-sm text-gray-800 truncate group-hover:text-emerald-700 transition-colors">
                                  {p.plant_name}
                                </h5>
                                <span className="inline-block text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded mt-0.5">
                                  {p.plant_species}
                                </span>
                              </div>
                            </div>
                            <span className="text-gray-300 group-hover:text-emerald-600 font-bold transition-colors">
                              →
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Unassigned Plants Section */}
          {plants.filter((p) => !p.location_id).length > 0 && (
            <div className="border border-dashed border-gray-300 rounded-2xl p-6 bg-gray-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-gray-700 uppercase tracking-wider">
                    Unassigned Orchid Plants ({plants.filter((p) => !p.location_id).length})
                  </h4>
                  <p className="text-xs text-gray-400">These plants are not assigned to any physical location zone</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {plants
                  .filter((p) => !p.location_id)
                  .map((p) => (
                    <div
                      key={p.plant_id}
                      onClick={() => onSelectPlant(p)}
                      className="group p-3.5 bg-white border border-gray-200 rounded-xl hover:border-emerald-500 hover:shadow-sm cursor-pointer transition flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <span className="text-2xl">🪴</span>
                        <div className="overflow-hidden">
                          <h5 className="font-bold text-xs text-gray-800 truncate group-hover:text-emerald-700">
                            {p.plant_name}
                          </h5>
                          <span className="text-[10px] text-gray-500 font-medium block">
                            {p.plant_species}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-300 group-hover:text-emerald-600 font-bold">→</span>
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
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-extrabold text-gray-800">Add Location Zone</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddLocationModal(false);
                  setLocationModalError("");
                }}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {locationModalError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                {locationModalError}
              </div>
            )}

            <form onSubmit={handleCreateLocation} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Location Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Balcony Orchid Shelf"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., East-facing indirect morning sun"
                  value={newLocationDesc}
                  onChange={(e) => setNewLocationDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddLocationModal(false);
                    setLocationModalError("");
                  }}
                  className="px-4 py-2 text-xs bg-gray-100 hover:bg-gray-200 font-semibold rounded-xl text-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLocation}
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 font-bold rounded-xl text-white transition flex items-center gap-1.5 cursor-pointer"
                >
                  {savingLocation ? "Saving Location..." : "Save Location"}
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
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-extrabold text-gray-800">Add Orchid Plant</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddPlantModal(false);
                  setPlantModalError("");
                }}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {plantModalError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium">
                {plantModalError}
              </div>
            )}

            <form onSubmit={handleCreatePlant} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Plant Name / Identifier <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Dendrobium Nobile #1"
                  value={newPlant.plant_name}
                  onChange={(e) =>
                    setNewPlant({ ...newPlant, plant_name: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Species
                </label>
                <select
                  value={newPlant.plant_species}
                  onChange={(e) =>
                    setNewPlant({ ...newPlant, plant_species: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Dendrobium">Dendrobium</option>
                  <option value="Phalaenopsis">Phalaenopsis</option>
                  <option value="Oncidium">Oncidium</option>
                  <option value="Cattleya">Cattleya</option>
                  <option value="Vanda">Vanda</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Assign Location
                </label>
                <select
                  value={targetLocationId}
                  onChange={(e) => setTargetLocationId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
                  onClick={() => {
                    setShowAddPlantModal(false);
                    setPlantModalError("");
                  }}
                  className="px-4 py-2 text-xs bg-gray-100 hover:bg-gray-200 font-semibold rounded-xl text-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPlant}
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 font-bold rounded-xl text-white transition flex items-center gap-1.5 cursor-pointer"
                >
                  {savingPlant ? "Adding Plant..." : "Save Plant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}