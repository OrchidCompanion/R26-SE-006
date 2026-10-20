import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  MapPin,
  User,
  Activity,
  Cpu,
  Wifi,
  WifiOff,
  AlertCircle,
  RefreshCw,
  Sun,
  Sunset,
  Moon,
  Sparkles,
  FlaskConical,
  Flower2,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
} from "lucide-react";
import AnalyseDisease from "./AnalyseDisease";
import AnalyseFertilizer from "./AnalyseFertilizer";
import PredictBlooming from "./PredictBlooming";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PlantDetailsScreen({ selectedPlant, selectedUser, onBack }) {
  const [currentView, setCurrentView] = useState("details");
  const [activeMainTab, setActiveMainTab] = useState("sampling"); // 'sampling' | 'telemetry' | 'diagnostics'

  // Telemetry Tab & Pagination State
  const [sensorTab, setSensorTab] = useState("npk"); // 'dht11' | 'bh1750' | 'npk'
  const [sensorData, setSensorData] = useState([]);
  const [sensorTotal, setSensorTotal] = useState(0);
  const [sensorPage, setSensorPage] = useState(1);
  const [loadingSensors, setLoadingSensors] = useState(false);

  // Diagnostic Tab & Pagination State
  const [outputTab, setOutputTab] = useState("fertilizer"); // 'disease' | 'fertilizer' | 'bloom'
  const [outputData, setOutputData] = useState([]);
  const [outputTotal, setOutputTotal] = useState(0);
  const [outputPage, setOutputPage] = useState(1);
  const [loadingOutputs, setLoadingOutputs] = useState(false);

  // Hardware Module & NPK Reading State
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [sensorStatus, setSensorStatus] = useState(null);
  const [activeReadingSlot, setActiveReadingSlot] = useState(null);
  const [savingSlotKey, setSavingSlotKey] = useState(null);
  const [readingResults, setReadingResults] = useState({});
  const [actionError, setActionError] = useState("");

  const [selectedImage, setSelectedImage] = useState(null);
  const LIMIT = 10;

  const fetchSensorData = useCallback(async () => {
    if (!selectedPlant?.plant_id) return;
    setLoadingSensors(true);
    try {
      const token = localStorage.getItem("admin_token");
      let endpoint = "";

      if (sensorTab === "dht11")
        endpoint = `${API_BASE_URL}/sensors/dht11/plant/${selectedPlant.plant_id}?page=${sensorPage}&limit=${LIMIT}`;
      if (sensorTab === "bh1750")
        endpoint = `${API_BASE_URL}/sensors/bh1750/plant/${selectedPlant.plant_id}?page=${sensorPage}&limit=${LIMIT}`;
      if (sensorTab === "npk")
        endpoint = `${API_BASE_URL}/sensors/npk/plant/${selectedPlant.plant_id}?page=${sensorPage}&limit=${LIMIT}`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const responseData = await res.json();
        if (responseData.data && Array.isArray(responseData.data)) {
          setSensorData(responseData.data);
          setSensorTotal(responseData.total ?? responseData.data.length);
        } else if (Array.isArray(responseData)) {
          setSensorData(responseData);
          setSensorTotal(responseData.length);
        }
      } else {
        setSensorData([]);
        setSensorTotal(0);
      }
    } catch (err) {
      console.error(err);
      setSensorData([]);
    } finally {
      setLoadingSensors(false);
    }
  }, [selectedPlant, sensorTab, sensorPage]);

  const fetchOutputData = useCallback(async () => {
    if (!selectedPlant?.plant_id) return;
    setLoadingOutputs(true);
    try {
      const token = localStorage.getItem("admin_token");
      let endpoint = "";

      if (outputTab === "disease")
        endpoint = `${API_BASE_URL}/disease/plant/${selectedPlant.plant_id}?page=${outputPage}&limit=${LIMIT}`;
      if (outputTab === "fertilizer")
        endpoint = `${API_BASE_URL}/fertilizer/plant/${selectedPlant.plant_id}?page=${outputPage}&limit=${LIMIT}`;
      if (outputTab === "bloom")
        endpoint = `${API_BASE_URL}/bloom/plant/${selectedPlant.plant_id}?page=${outputPage}&limit=${LIMIT}`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const responseData = await res.json();
        if (responseData.data && Array.isArray(responseData.data)) {
          setOutputData(responseData.data);
          setOutputTotal(responseData.total ?? responseData.data.length);
        } else if (Array.isArray(responseData)) {
          setOutputData(responseData);
          setOutputTotal(responseData.length);
        }
      } else {
        setOutputData([]);
        setOutputTotal(0);
      }
    } catch (err) {
      console.error(err);
      setOutputData([]);
    } finally {
      setLoadingOutputs(false);
    }
  }, [selectedPlant, outputTab, outputPage]);

  const fetchUserModules = useCallback(async (userId) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/sensors/modules/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setModules(data);
        if (data.length > 0) {
          const npkMod = data.find((m) => m.module_id === "441bf68cbc78" || m.device_name?.toLowerCase().includes("npk"));
          setSelectedModuleId(npkMod ? npkMod.module_id : data[0].module_id);
        }
      }
    } catch (err) {
      console.error("Error fetching user modules:", err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSensorData();
  }, [fetchSensorData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOutputData();
  }, [fetchOutputData]);

  useEffect(() => {
    if (selectedUser?.user_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchUserModules(selectedUser.user_id);
    }
  }, [selectedUser, fetchUserModules]);

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
        const data = await res.json();
        setSensorStatus(data);

        // If sensor responded with live reading, populate slot if empty
        if (data.latest_reading && "nitrogen_n" in data.latest_reading) {
          const lr = data.latest_reading;
          const currentHour = new Date().getHours();
          const autoSlot = currentHour < 12 ? "morning" : currentHour < 17 ? "afternoon" : "evening";
          const slotKey = `npk_${autoSlot}`;
          setReadingResults((prev) => {
            if (!prev[slotKey]) {
              return {
                ...prev,
                [slotKey]: {
                  n: Number(lr.nitrogen_n ?? lr.nitrogen ?? 0),
                  p: Number(lr.phosphorus_p ?? lr.phosphorus ?? 0),
                  k: Number(lr.potassium_k ?? lr.potassium ?? 0),
                  timestamp: new Date().toLocaleTimeString(),
                  date: new Date().toLocaleDateString(),
                  saved: false,
                },
              };
            }
            return prev;
          });
        }
      } else {
        setSensorStatus({
          online: false,
          msg: "Device did not respond.",
        });
      }
    } catch {
      setSensorStatus({
        online: false,
        msg: "Failed to connect to sensor module.",
      });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleReadNPKData = async (timeSlot) => {
    if (!selectedModuleId) {
      setActionError("Please select a sensor module.");
      return;
    }
    const slotKey = `npk_${timeSlot}`;
    setActiveReadingSlot(slotKey);
    setActionError("");

    try {
      const token = localStorage.getItem("admin_token");
      const readRes = await fetch(
        `${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-npk`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!readRes.ok) {
        const errorData = await readRes.json().catch(() => ({}));
        throw new Error(errorData.detail || "NPK sensor read failed. Check device connection.");
      }

      const data = await readRes.json();

      const n = Number(data.nitrogen_n ?? data.nitrogen ?? 0);
      const p = Number(data.phosphorus_p ?? data.phosphorus ?? 0);
      const k = Number(data.potassium_k ?? data.potassium ?? 0);

      const now = new Date();
      setReadingResults((prev) => ({
        ...prev,
        [slotKey]: {
          n,
          p,
          k,
          timestamp: now.toLocaleTimeString(),
          date: now.toLocaleDateString(),
          saved: false,
        },
      }));

      // Live read succeeded -> update sensor status to online
      setSensorStatus({
        online: true,
        sensor_type: "npk",
        npk_probe: true,
        msg: "NPK Sensor operational over MQTT.",
      });
    } catch (err) {
      console.error(err);
      setActionError(err.message || `Error reading NPK data for ${timeSlot}.`);
    } finally {
      setActiveReadingSlot(null);
    }
  };

  const handleSaveNPKData = async (timeSlot) => {
    const slotKey = `npk_${timeSlot}`;
    const reading = readingResults[slotKey];
    if (!reading) return;

    setSavingSlotKey(slotKey);
    setActionError("");

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/sensors/npk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nitrogen_n: reading.n,
          phosphorus_p: reading.p,
          potassium_k: reading.k,
          plant_id: selectedPlant.plant_id,
          module_id: selectedModuleId,
          time_slot: timeSlot,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to save NPK reading.");
      }

      setReadingResults((prev) => ({
        ...prev,
        [slotKey]: {
          ...prev[slotKey],
          saved: true,
          savedAt: new Date().toLocaleTimeString(),
        },
      }));

      if (sensorTab === "npk") {
        fetchSensorData();
      }
    } catch (err) {
      console.error(err);
      setActionError(err.message || `Error saving NPK data for ${timeSlot}.`);
    } finally {
      setSavingSlotKey(null);
    }
  };

  const getSlotIcon = (slot) => {
    switch (slot) {
      case "morning":
        return <Sun className="w-4 h-4 text-amber-500" />;
      case "afternoon":
        return <Sunset className="w-4 h-4 text-orange-500" />;
      case "evening":
        return <Moon className="w-4 h-4 text-indigo-400" />;
      default:
        return <Activity className="w-4 h-4 text-teal-500" />;
    }
  };

  if (currentView === "analyse_disease") {
    return (
      <AnalyseDisease
        selectedPlant={selectedPlant}
        selectedUser={selectedUser}
        onBack={() => {
          setCurrentView("details");
          fetchOutputData();
        }}
      />
    );
  }

  if (currentView === "analyse_fertilizer") {
    return (
      <AnalyseFertilizer
        selectedPlant={selectedPlant}
        selectedUser={selectedUser}
        onBack={() => {
          setCurrentView("details");
          fetchOutputData();
        }}
      />
    );
  }

  if (currentView === "predict_blooming") {
    return (
      <PredictBlooming
        selectedPlant={selectedPlant}
        selectedUser={selectedUser}
        onBack={() => {
          setCurrentView("details");
          fetchOutputData();
        }}
      />
    );
  }

  const sensorTotalPages = Math.ceil(sensorTotal / LIMIT) || 1;
  const outputTotalPages = Math.ceil(outputTotal / LIMIT) || 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Modern Hero Plant Card */}
      <div className="bg-white p-6 sm:p-7 rounded-2xl border border-gray-100 shadow-sm transition hover:shadow-md">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2">
            <button
              onClick={onBack}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-bold inline-flex items-center gap-1.5 transition group mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              Back to Orchids
            </button>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 via-teal-100 to-emerald-200 flex items-center justify-center text-3xl shadow-xs shrink-0">
                🪴
              </div>
              <div>
                <h1 className="text-gray-900 text-2xl sm:text-3xl font-black tracking-tight">
                  {selectedPlant.plant_name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-full border border-emerald-200/50">
                    {selectedPlant.plant_species || "Orchid"}
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="inline-flex items-center gap-1 text-gray-600 font-medium">
                    <MapPin className="w-3 h-3 text-emerald-600" />
                    {selectedPlant.plant_location || selectedPlant.locations?.location_name || "Unassigned Zone"}
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="inline-flex items-center gap-1 text-gray-600 font-medium">
                    <User className="w-3 h-3 text-gray-400" />
                    {selectedUser.first_name} {selectedUser.last_name}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Diagnostics Suite Action Group */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
            <button
              onClick={() => setCurrentView("analyse_disease")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow transition"
            >
              <Sparkles className="w-4 h-4" />
              Analyse Disease
            </button>
            <button
              onClick={() => setCurrentView("analyse_fertilizer")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow transition"
            >
              <FlaskConical className="w-4 h-4" />
              Analyse Fertilizer
            </button>
            <button
              onClick={() => setCurrentView("predict_blooming")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow transition"
            >
              <Flower2 className="w-4 h-4" />
              Predict Blooming
            </button>
          </div>
        </div>

        {/* Top-Level Segmented Tabs Navigation */}
        <div className="mt-7 pt-5 border-t border-gray-100 flex items-center gap-2 overflow-x-auto">
          {[
            { id: "sampling", label: "Daily Sensor Readings", icon: Activity, count: null },
            { id: "telemetry", label: "Sensor Reading History", icon: Cpu, count: null },
            { id: "diagnostics", label: "Diagnostic Records", icon: Layers, count: null },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition shrink-0 ${isActive
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200/50"
                  }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-gray-400"}`} />
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isActive ? "bg-slate-700 text-emerald-300" : "bg-gray-200 text-gray-600"
                      }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: Daily Plant NPK Sampling */}
      {activeMainTab === "sampling" && (
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-xs space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
            <div className="space-y-0.5">
              <h2 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse"></span>
                NPK Sensor Readings
              </h2>
              <p className="text-xs text-gray-500">
                Live sensor readings to capture morning, afternoon & evening fertilizer levels.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 w-full md:w-auto">
              <select
                value={selectedModuleId}
                onChange={(e) => {
                  setSelectedModuleId(e.target.value);
                  setSensorStatus(null);
                }}
                className="text-xs bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none w-full sm:w-auto shadow-xs"
              >
                <option value="">-- Select NPK Module --</option>
                {modules.map((m) => (
                  <option key={m.module_id} value={m.module_id}>
                    {m.device_name} ({m.module_id})
                  </option>
                ))}
              </select>
              <button
                onClick={handleCheckSensorStatus}
                disabled={checkingStatus || !selectedModuleId}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 shrink-0 w-full sm:w-auto shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? "animate-spin" : ""}`} />
                {checkingStatus ? "Connecting..." : "Check Status"}
              </button>
            </div>
          </div>

          {/* Status Indicator Banner */}
          {sensorStatus && (
            <div
              className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between border ${sensorStatus.online
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
            >
              <div className="flex items-center gap-2.5">
                {sensorStatus.online ? (
                  <Wifi className="w-4 h-4 text-emerald-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  <strong>Module Status:</strong> {sensorStatus.online ? "Online & Ready" : "Disconnected / Offline"} (
                  {sensorStatus.msg || (sensorStatus.online ? "Ready to sample" : "Offline")})
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white uppercase tracking-wider shadow-2xs">
                {sensorStatus.device || (modules.find((m) => m.module_id === selectedModuleId)?.device_name) || "ESP32 Node"}
              </span>
            </div>
          )}

          {actionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* NPK Time-slot Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["morning", "afternoon", "evening"].map((slot) => {
              const key = `npk_${slot}`;
              const res = readingResults[key];
              const isLoading = activeReadingSlot === key;
              const isSaving = savingSlotKey === key;

              return (
                <div
                  key={slot}
                  className="p-5 bg-gradient-to-b from-white to-slate-50/50 border border-gray-200/80 rounded-2xl flex flex-col justify-between space-y-4 shadow-xs hover:border-teal-300 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="capitalize font-bold text-xs text-gray-800 flex items-center gap-1.5">
                      {getSlotIcon(slot)}
                      {slot} Slot
                    </span>
                    <div className="flex items-center gap-1.5">
                      {res && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${res.saved
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                            }`}
                        >
                          {res.saved ? "Saved" : "Unsaved"}
                        </span>
                      )}
                      <span className="text-[10px] uppercase font-bold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded-md">
                        NPK
                      </span>
                    </div>
                  </div>

                  {res ? (
                    <div className="p-3 bg-white rounded-xl border border-gray-200/60 shadow-2xs space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 font-medium">Nitrogen (N):</span>
                        <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          {res.n} mg/kg
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 font-medium">Phosphorus (P):</span>
                        <span className="font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                          {res.p} mg/kg
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 font-medium">Potassium (K):</span>
                        <span className="font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                          {res.k} mg/kg
                        </span>
                      </div>
                      <span className="text-gray-400 text-[10px] block pt-1.5 border-t border-gray-100">
                        {res.saved
                          ? `Saved at ${res.savedAt || res.timestamp}`
                          : `Sampled at ${res.timestamp}`} • {res.date || "Today"}
                      </span>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <p className="text-xs text-gray-400 italic">No reading recorded for {slot}.</p>
                    </div>
                  )}

                  {isLoading ? (
                    <button
                      disabled
                      className="w-full py-2.5 bg-teal-100 text-teal-800 font-bold text-xs rounded-xl transition opacity-75 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Reading NPK Sensor...
                    </button>
                  ) : res && !res.saved ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveNPKData(slot)}
                        disabled={isSaving || Boolean(activeReadingSlot)}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50"
                      >
                        {isSaving ? "Saving..." : "Save to DB"}
                      </button>
                      <button
                        onClick={() => handleReadNPKData(slot)}
                        disabled={Boolean(activeReadingSlot) || isSaving}
                        title="Re-read sensor"
                        className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition disabled:opacity-50 shrink-0"
                      >
                        Re-Read
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleReadNPKData(slot)}
                      disabled={Boolean(activeReadingSlot) || isSaving}
                      className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50"
                    >
                      {res?.saved ? "Re-Read NPK Slot" : "Read Live NPK"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Hardware Sensor Telemetry History */}
      {activeMainTab === "telemetry" && (
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-xs space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
            <div>
              <h2 className="font-extrabold text-gray-900 text-base">Historical Sensor Readings</h2>
              <p className="text-xs text-gray-500">
                Logged sensor readings for NPK nutrient levels, temperature, humidity and light intensity.
              </p>
            </div>

            {/* Sensor Sub-Tabs */}
            <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
              {[
                { id: "npk", label: "NPK Sensor" },
                { id: "dht11", label: "Temperature & Humidity" },
                { id: "bh1750", label: "Light Intensity" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSensorTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${sensorTab === tab.id
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sensor Table */}
          {loadingSensors ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-400 text-xs font-semibold">Loading sensor telemetry records...</p>
            </div>
          ) : sensorData.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
              <p className="text-gray-500 text-xs font-semibold">No telemetry records logged yet for {sensorTab.toUpperCase()}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[11px] border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3.5">Date & Time</th>
                    <th className="px-4 py-3.5">Time Slot</th>
                    {sensorTab === "dht11" && (
                      <>
                        <th className="px-4 py-3.5">Temperature</th>
                        <th className="px-4 py-3.5">Humidity</th>
                      </>
                    )}
                    {sensorTab === "bh1750" && (
                      <th className="px-4 py-3.5">Light Level</th>
                    )}
                    {sensorTab === "npk" && (
                      <>
                        <th className="px-4 py-3.5">Nitrogen (N)</th>
                        <th className="px-4 py-3.5">Phosphorus (P)</th>
                        <th className="px-4 py-3.5">Potassium (K)</th>
                      </>
                    )}
                    <th className="px-4 py-3.5">Sensor Node</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sensorData.map((row, idx) => {
                    const sensorDeviceName =
                      row.device_name ||
                      modules.find((m) => m.module_id === row.module_id)?.device_name ||
                      row.module_id ||
                      "Node";

                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 font-medium whitespace-nowrap">
                          {row.created_at ? (
                            <div>
                              <span>{new Date(row.created_at).toLocaleDateString()}</span>
                              <span className="text-gray-400 text-[10px] block">{new Date(row.created_at).toLocaleTimeString()}</span>
                            </div>
                          ) : (
                            "N/A"
                          )}
                        </td>
                        <td className="px-4 py-3 capitalize font-semibold text-gray-700">
                          {row.time_slot || "N/A"}
                        </td>

                        {sensorTab === "dht11" && (
                          <>
                            <td className="px-4 py-3 font-bold text-rose-600">
                              <span className="bg-rose-50 px-2 py-0.5 rounded-md">{row.temperature} °C</span>
                            </td>
                            <td className="px-4 py-3 font-bold text-sky-600">
                              <span className="bg-sky-50 px-2 py-0.5 rounded-md">{row.humidity} %</span>
                            </td>
                          </>
                        )}

                        {sensorTab === "bh1750" && (
                          <td className="px-4 py-3 font-bold text-amber-600">
                            <span className="bg-amber-50 px-2 py-0.5 rounded-md">{row.lux} Lux</span>
                          </td>
                        )}

                        {sensorTab === "npk" && (
                          <>
                            <td className="px-4 py-3 font-bold text-emerald-700">
                              <span className="bg-emerald-50 px-2 py-0.5 rounded-md">{row.nitrogen_n} mg/kg</span>
                            </td>
                            <td className="px-4 py-3 font-bold text-amber-700">
                              <span className="bg-amber-50 px-2 py-0.5 rounded-md">{row.phosphorus_p} mg/kg</span>
                            </td>
                            <td className="px-4 py-3 font-bold text-rose-700">
                              <span className="bg-rose-50 px-2 py-0.5 rounded-md">{row.potassium_k} mg/kg</span>
                            </td>
                          </>
                        )}

                        <td className="px-4 py-3 font-medium text-gray-500">
                          <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
                            <Cpu className="w-3 h-3 text-indigo-500" />
                            {sensorDeviceName}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex justify-between items-center pt-2 text-xs">
            <span className="text-gray-500">
              Page <strong>{sensorPage}</strong> of <strong>{sensorTotalPages}</strong> ({sensorTotal} records)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={sensorPage === 1}
                onClick={() => setSensorPage((p) => Math.max(p - 1, 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition font-medium"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <button
                disabled={sensorPage >= sensorTotalPages}
                onClick={() => setSensorPage((p) => p + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition font-medium"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Diagnostic & Algorithmic System Outputs */}
      {activeMainTab === "diagnostics" && (
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-xs space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
            <div>
              <h2 className="font-extrabold text-gray-900 text-base">Analysis Predictions and Outcomes</h2>
              <p className="text-xs text-gray-500">
                Historical records of leaf disease detections, fertilizer recommendations and blooming forecasts.
              </p>
            </div>

            {/* Diagnostic Sub-Tabs */}
            <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
              {[
                { id: "disease", label: "Disease Identification" },
                { id: "fertilizer", label: "Fertilizer Recommendation" },
                { id: "bloom", label: "Bloom Prediction" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOutputTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${outputTab === tab.id
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loadingOutputs ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-400 text-xs font-semibold">Loading diagnostic history...</p>
            </div>
          ) : outputData.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
              <p className="text-gray-500 text-xs font-semibold">No records found for {outputTab.toUpperCase()}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[11px] border-b border-gray-200">
                  {outputTab === "disease" && (
                    <tr>
                      <th className="px-4 py-3.5">Date & Time</th>
                      <th className="px-4 py-3.5">Diagnosis / Condition</th>
                      <th className="px-4 py-3.5">Confidence</th>
                      <th className="px-4 py-3.5">Health Status</th>
                      <th className="px-4 py-3.5">Result Artifact</th>
                    </tr>
                  )}
                  {outputTab === "fertilizer" && (
                    <tr>
                      <th className="px-4 py-3.5">Date & Time</th>
                      <th className="px-4 py-3.5">Growth Stage</th>
                      <th className="px-4 py-3.5">Recommended Fertilizer</th>
                      <th className="px-4 py-3.5">Dosage / Application</th>
                      <th className="px-4 py-3.5">Status</th>
                    </tr>
                  )}
                  {outputTab === "bloom" && (
                    <tr>
                      <th className="px-4 py-3.5">Date & Time</th>
                      <th className="px-4 py-3.5">Current Stage</th>
                      <th className="px-4 py-3.5">Days to Bloom</th>
                      <th className="px-4 py-3.5">Forecast Bloom Window</th>
                      <th className="px-4 py-3.5">Confidence</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {outputData.map((row, idx) => {
                    // Fertilizer helper values
                    const fertStage =
                      row.growth_stage ||
                      (row.fertilizer && row.fertilizer.includes("(")
                        ? row.fertilizer.match(/\((.*?)\)/)?.[1]
                        : null) ||
                      "Matured";
                    const fertCleanName = row.fertilizer
                      ? row.fertilizer.replace(/\s*\(.*?\)/, "").trim() || row.fertilizer
                      : "N/A";

                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        {/* Common Column 1: Date & Time */}
                        <td className="px-4 py-3 text-gray-600 font-medium whitespace-nowrap">
                          {row.created_at ? (
                            <div>
                              <span>{new Date(row.created_at).toLocaleDateString()}</span>
                              <span className="text-gray-400 text-[10px] block">
                                {new Date(row.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                          ) : (
                            "N/A"
                          )}
                        </td>

                        {/* ================= TAB 1: DISEASE AI ================= */}
                        {outputTab === "disease" && (
                          <>
                            {/* Diagnosis */}
                            <td className="px-4 py-3 font-bold text-gray-900">
                              {row.disease_name || "N/A"}
                            </td>

                            {/* Confidence */}
                            <td className="px-4 py-3 font-semibold text-gray-700">
                              {row.confidence !== undefined && row.confidence !== null ? (
                                <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-[11px] font-bold">
                                  {row.confidence}%
                                </span>
                              ) : (
                                "N/A"
                              )}
                            </td>

                            {/* Health Status */}
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${row.verdict === "HEALTHY"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-rose-100 text-rose-800"
                                  }`}
                              >
                                {row.verdict === "HEALTHY" ? (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                ) : null}
                                {row.verdict || "N/A"}
                              </span>
                            </td>

                            {/* Result Artifact (Preview button only for Disease AI) */}
                            <td className="px-4 py-3">
                              {row.result_image_b64 ? (
                                <button
                                  onClick={() =>
                                    setSelectedImage(`data:image/jpeg;base64,${row.result_image_b64}`)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg text-xs font-bold border border-sky-200/60 transition"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Preview Image
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs">No image</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* ================= TAB 2: FERTILIZER SCHEDULE ================= */}
                        {outputTab === "fertilizer" && (
                          <>
                            {/* Growth Stage */}
                            <td className="px-4 py-3">
                              <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                                {fertStage}
                              </span>
                            </td>

                            {/* Recommended Fertilizer */}
                            <td className="px-4 py-3 font-bold text-gray-900">
                              {fertCleanName}
                            </td>

                            {/* Dosage / Quantity */}
                            <td className="px-4 py-3 font-medium text-gray-700">
                              {`${row.qty ?? 1} ${row.unit || "application"}`}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Completed
                              </span>
                            </td>
                          </>
                        )}

                        {/* ================= TAB 3: BLOOM PREDICTIONS ================= */}
                        {outputTab === "bloom" && (
                          <>
                            {/* Current Stage */}
                            <td className="px-4 py-3">
                              <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                                {row.current_stage || row.stage || row.bloom_status || "Vegetative"}
                              </span>
                            </td>

                            {/* Days to Bloom */}
                            <td className="px-4 py-3 font-bold text-gray-900">
                              {row.display_total_days !== undefined && row.display_total_days !== null
                                ? `${row.display_total_days} Days`
                                : row.weeks
                                  ? `${row.weeks} Weeks`
                                  : row.total_days_to_flowering
                                    ? `${Math.round(row.total_days_to_flowering)} Days`
                                    : "N/A"}
                            </td>

                            {/* Forecast Bloom Window */}
                            <td className="px-4 py-3 font-medium text-gray-700">
                              {row.flowering_date_range_display ||
                                row.estimated_flowering_date ||
                                "N/A"}
                            </td>

                            {/* Confidence */}
                            <td className="px-4 py-3 font-semibold text-gray-700">
                              {row.confidence !== undefined && row.confidence !== null ? (
                                <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-[11px] font-bold">
                                  {row.confidence}%
                                </span>
                              ) : (
                                "N/A"
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex justify-between items-center pt-2 text-xs">
            <span className="text-gray-500">
              Page <strong>{outputPage}</strong> of <strong>{outputTotalPages}</strong> ({outputTotal} records)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={outputPage === 1}
                onClick={() => setOutputPage((p) => Math.max(p - 1, 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition font-medium"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <button
                disabled={outputPage >= outputTotalPages}
                onClick={() => setOutputPage((p) => p + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition font-medium"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white p-5 rounded-2xl max-w-2xl w-full shadow-2xl space-y-3">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h3 className="font-extrabold text-gray-900 text-sm">YOLO Disease Detection Result</h3>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-sm font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="rounded-xl overflow-hidden bg-black/5 flex items-center justify-center p-2">
              <img
                src={selectedImage}
                alt="Annotated Orchid Leaf"
                className="w-full rounded-lg max-h-[70vh] object-contain shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}