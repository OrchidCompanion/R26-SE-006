import React, { useState, useEffect } from "react";
import { ArrowLeft, Cpu, Plus, RefreshCw, Trash2, Wifi, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function SensorsScreen({ selectedUser, onBack }) {
  const [modules, setModules] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Status check states: { [moduleId]: { checking: bool, data: obj, error: str } }
  const [statuses, setStatuses] = useState({});

  // Add Sensor Module Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [modalError, setModalError] = useState("");
  const [newModule, setNewModule] = useState({
    module_id: "",
    device_name: "",
    location_id: "",
  });

  useEffect(() => {
    if (selectedUser?.user_id) {
      loadData();
    }
  }, [selectedUser]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("admin_token");
    try {
      const [modRes, locRes] = await Promise.all([
        fetch(`${API_BASE_URL}/sensors/modules/user/${selectedUser.user_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/locations/user/${selectedUser.user_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (modRes.ok) {
        const modData = await modRes.json();
        setModules(modData);
      } else {
        setError("Failed to fetch sensor modules.");
      }

      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(locData);
      }
    } catch (err) {
      console.error(err);
      setError("Error connecting to placement & sensor service.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async (moduleId) => {
    setStatuses((prev) => ({
      ...prev,
      [moduleId]: { checking: true, data: null, error: "" },
    }));

    const token = localStorage.getItem("admin_token");
    try {
      const res = await fetch(`${API_BASE_URL}/sensors/modules/${moduleId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStatuses((prev) => ({
          ...prev,
          [moduleId]: { checking: false, data, error: "" },
        }));
      } else {
        setStatuses((prev) => ({
          ...prev,
          [moduleId]: {
            checking: false,
            data: { online: false, dht11: false, bh1750: false },
            error: "Module did not respond.",
          },
        }));
      }
    } catch (err) {
      setStatuses((prev) => ({
        ...prev,
        [moduleId]: {
          checking: false,
          data: { online: false, dht11: false, bh1750: false },
          error: "Connection failed.",
        },
      }));
    }
  };

  const handleAddModule = async (e) => {
    e.preventDefault();
    if (!newModule.module_id.trim()) {
      setModalError("Please enter the hardware MAC address / Module ID.");
      return;
    }

    setSavingModule(true);
    setModalError("");
    const token = localStorage.getItem("admin_token");

    const cleanMac = newModule.module_id.trim().toLowerCase().replace(/[:-]/g, "");

    try {
      const res = await fetch(`${API_BASE_URL}/sensors/modules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          module_id: cleanMac,
          device_name: newModule.device_name.trim() || "ESP32 Sensor Node",
          location_id: newModule.location_id || null,
          user_id: selectedUser.user_id,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewModule({ module_id: "", device_name: "", location_id: "" });
        loadData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setModalError(errData.detail || "Failed to register sensor module.");
      }
    } catch (err) {
      setModalError("Error saving module to backend.");
    } finally {
      setSavingModule(false);
    }
  };

  const handleDeleteModule = async (moduleId) => {
    if (!window.confirm(`Are you sure you want to unpair sensor node "${moduleId}"?`)) return;

    const token = localStorage.getItem("admin_token");
    try {
      const res = await fetch(`${API_BASE_URL}/sensors/modules/${moduleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        loadData();
      } else {
        alert("Failed to unpair sensor module.");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting sensor module.");
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
      {/* Top Header */}
      <div className="border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <button
            onClick={onBack}
            className="group inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-emerald-700 bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 px-3 py-1.5 rounded-lg transition-all mb-2 shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to Plants & Zones
          </button>
          <h2 className="text-[#1f2937] text-2xl font-black flex items-center gap-2">
            <Cpu className="w-6 h-6 text-emerald-600" />
            Hardware Sensor Nodes
          </h2>
          <p className="text-gray-500 text-xs sm:text-sm">
            Active ESP32 IoT sensor modules paired with{" "}
            <strong className="text-gray-800">
              {selectedUser.first_name} {selectedUser.last_name}
            </strong>{" "}
            ({selectedUser.email})
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>+ Pair Sensor Module</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Modules List */}
      {loading ? (
        <div className="p-12 text-center">
          <p className="text-gray-400 text-sm">Loading paired hardware nodes...</p>
        </div>
      ) : modules.length === 0 ? (
        <div className="p-10 border border-dashed border-gray-300 rounded-2xl text-center space-y-3 bg-gray-50/50">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
            <Wifi className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-gray-800 text-base">No Sensors Paired Yet</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Pair an ESP32 micro-controller node by entering its hardware MAC address to begin recording
            DHT11, BH1750, and NPK telemetry.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition"
          >
            Pair First Sensor Module
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((m) => {
            const statusInfo = statuses[m.module_id];
            const isOnline = statusInfo?.data?.online;

            return (
              <div
                key={m.module_id}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs hover:border-emerald-300 transition-all space-y-4"
              >
                {/* Module Top Row */}
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-gray-900 text-base">
                        {m.device_name || "ESP32 Sensor Node"}
                      </h4>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-mono font-semibold">
                        {m.module_id}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Assigned Zone:{" "}
                      <strong className="text-emerald-700">
                        {m.location_name || "Global / Unassigned"}
                      </strong>
                    </p>
                  </div>

                  <button
                    onClick={() => handleDeleteModule(m.module_id)}
                    title="Unpair Sensor Node"
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Diagnostics / Status Block */}
                <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-100 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-medium">Hardware Status:</span>
                    {statusInfo?.checking ? (
                      <span className="flex items-center gap-1 text-gray-400 font-semibold animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Pinging...
                      </span>
                    ) : statusInfo?.data ? (
                      <span
                        className={`font-bold flex items-center gap-1 ${
                          isOnline ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {isOnline ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Online
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> Offline
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not verified</span>
                    )}
                  </div>

                  {statusInfo?.data && (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200/60 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-gray-500">DHT11 Temp/RH:</span>
                        <span
                          className={`font-semibold ${
                            statusInfo.data.dht11 ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          {statusInfo.data.dht11 ? "Operational" : "No Signal"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">BH1750 Lux:</span>
                        <span
                          className={`font-semibold ${
                            statusInfo.data.bh1750 ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          {statusInfo.data.bh1750 ? "Operational" : "No Signal"}
                        </span>
                      </div>
                    </div>
                  )}

                  {statusInfo?.error && (
                    <p className="text-[11px] text-rose-600 pt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {statusInfo.error}
                    </p>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="flex justify-between items-center pt-1 text-xs">
                  <span className="text-gray-400 text-[11px]">
                    Paired: {new Date(m.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleCheckStatus(m.module_id)}
                    disabled={statusInfo?.checking}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg border border-emerald-200/60 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${statusInfo?.checking ? "animate-spin" : ""}`} />
                    <span>Ping Connection</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Sensor Node Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Pair New Sensor Module</h3>
            <p className="text-xs text-gray-500">
              Enter the hardware MAC address of the ESP32 to link telemetry to{" "}
              <strong>
                {selectedUser.first_name} {selectedUser.last_name}
              </strong>
              .
            </p>

            {modalError && (
              <div className="bg-rose-50 text-rose-700 text-xs p-3 rounded-lg border border-rose-200">
                {modalError}
              </div>
            )}

            <form onSubmit={handleAddModule} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Device Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Garden Ambient Node"
                  value={newModule.device_name}
                  onChange={(e) => setNewModule({ ...newModule, device_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  ESP32 MAC Address (Module ID)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 441bf68cbc78 or 34:85:18:ab:cd:ef"
                  value={newModule.module_id}
                  onChange={(e) => setNewModule({ ...newModule, module_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border font-mono rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Assign to Location Zone (Optional)
                </label>
                <select
                  value={newModule.location_id}
                  onChange={(e) => setNewModule({ ...newModule, location_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                >
                  <option value="">-- Unassigned (Global) --</option>
                  {locations.map((loc) => (
                    <option key={loc.location_id} value={loc.location_id}>
                      {loc.location_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs bg-gray-200 hover:bg-gray-300 font-semibold rounded-lg text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingModule}
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold rounded-lg text-white disabled:opacity-50"
                >
                  {savingModule ? "Pairing..." : "Pair Module"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}