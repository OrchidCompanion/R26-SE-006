import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  MapPin,
  User,
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  Wifi,
  WifiOff,
  AlertCircle,
  Activity,
  Layers,
  RefreshCw,
  Sun,
  Sunset,
  Moon,
  CheckCircle2,
} from "lucide-react";

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

  // Collapsible Ambient Telemetry Sampling per zone
  const [expandedZoneSensors, setExpandedZoneSensors] = useState({});

  const toggleZoneSensors = (locationId) => {
    setExpandedZoneSensors((prev) => ({
      ...prev,
      [locationId]: !prev[locationId],
    }));
  };

  // Ambient Telemetry Sampling State (30s burst: 1s, 15s, 28s)
  // Initialized with today's cached readings from localStorage so "Added" status survives refresh
  const [readingResults, setReadingResults] = useState(() => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const cached = localStorage.getItem(`orchid_ambient_${todayStr}`);
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  const [samplingSlotKey, setSamplingSlotKey] = useState(null);
  const [samplingCountdown, setSamplingCountdown] = useState(30);
  const [samplingSampleCount, setSamplingSampleCount] = useState(0);
  const [savingReadingSlot, setSavingReadingSlot] = useState(null);
  const samplingTimerRef = useRef(null);

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
  const [savingEditLocation, setSavingEditLocation] = useState(false);
  const [editLocationError, setEditLocationError] = useState("");

  const loadUserData = useCallback(async () => {
    if (!selectedUser) return;
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
  }, [selectedUser]);

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
          const envMod = data.find((m) => m.module_id === "a4cf129b88e0" || m.device_name?.toLowerCase().includes("env"));
          setSelectedModuleId(envMod ? envMod.module_id : data[0].module_id);
        }
      }
    } catch (err) {
      console.error("Error fetching user modules:", err);
    }
  }, []);

  useEffect(() => {
    if (selectedUser?.user_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadUserData();
      fetchUserModules(selectedUser.user_id);
    }
    return () => {
      if (samplingTimerRef.current) clearInterval(samplingTimerRef.current);
    };
  }, [selectedUser, loadUserData, fetchUserModules]);

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

  // 30-Second Ambient Telemetry Sampling (1st sample @ 1s, 2nd sample @ 15s, 3rd sample @ 28s)
  const handleStartSampling = (locationId, timeSlot) => {
    if (!selectedModuleId) {
      setActionError("Please select a sensor module.");
      return;
    }
    if (sensorStatus && !sensorStatus.online) {
      setActionError("Cannot start sampling: Sensor module is offline. Please power on the ESP32 and check status.");
      return;
    }
    const slotKey = `${locationId}_${timeSlot}`;
    if (samplingTimerRef.current) {
      clearInterval(samplingTimerRef.current);
    }

    setSamplingSlotKey(slotKey);
    setSamplingCountdown(30);
    setSamplingSampleCount(0);
    setActionError("");

    let secondsLeft = 30;
    const collected = [];

    const fetchSample = async () => {
      try {
        const token = localStorage.getItem("admin_token");
        const res = await fetch(
          `${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-ambient`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          return {
            temp: Number(data.temperature ?? 0),
            hum: Number(data.humidity ?? 0),
            lux: Number(data.lux ?? 0),
          };
        }
      } catch (err) {
        console.warn("Ambient sample read failed:", err);
      }
      return null;
    };

    samplingTimerRef.current = setInterval(async () => {
      secondsLeft -= 1;
      setSamplingCountdown(secondsLeft);
      const elapsed = 30 - secondsLeft;

      // 1st reading at 1st second, 2nd reading at 15th second, 3rd reading at 28th second
      if (elapsed === 1 || elapsed === 15 || elapsed === 28) {
        const sample = await fetchSample();
        if (sample) {
          collected.push(sample);
          setSamplingSampleCount(collected.length);
        }
      }

      if (secondsLeft <= 0) {
        clearInterval(samplingTimerRef.current);
        samplingTimerRef.current = null;
        setSamplingSlotKey(null);

        if (collected.length > 0) {
          const avgTemp = Number(
            (collected.reduce((acc, r) => acc + r.temp, 0) / collected.length).toFixed(1)
          );
          const avgHum = Number(
            (collected.reduce((acc, r) => acc + r.hum, 0) / collected.length).toFixed(1)
          );
          const avgLux = Math.round(
            collected.reduce((acc, r) => acc + r.lux, 0) / collected.length
          );
          const now = new Date();

          setReadingResults((prev) => {
            const updated = {
              ...prev,
              [slotKey]: {
                temp: avgTemp,
                hum: avgHum,
                lux: avgLux,
                timestamp: now.toLocaleTimeString(),
                date: now.toLocaleDateString(),
                samplesCount: collected.length,
                moduleId: selectedModuleId,
                saved: false,
              },
            };
            try {
              const todayStr = new Date().toISOString().split("T")[0];
              localStorage.setItem(`orchid_ambient_${todayStr}`, JSON.stringify(updated));
            } catch {
              // Ignore
            }
            return updated;
          });
        } else {
          setActionError(`Could not read sensor samples for ${timeSlot}. Check device connection.`);
        }
      }
    }, 1000);
  };

  const handleSaveAmbientData = async (locationId, timeSlot) => {
    const slotKey = `${locationId}_${timeSlot}`;
    const reading = readingResults[slotKey];
    if (!reading) return;

    setSavingReadingSlot(slotKey);
    setActionError("");

    try {
      const token = localStorage.getItem("admin_token");
      const targetUserId =
        selectedUser?.user_id ||
        selectedUser?.id ||
        (localStorage.getItem("admin_user")
          ? JSON.parse(localStorage.getItem("admin_user")).user_id
          : "");

      const now = new Date();
      const saveTime = now.toLocaleTimeString();

      const zonePlants = plants.filter((p) => p.location_id === locationId);

      // Prepare save requests for all orchids in this zone, or at zone-level if no orchids assigned
      const savePromises = [];

      if (zonePlants.length > 0) {
        zonePlants.forEach((p) => {
          savePromises.push(
            fetch(`${API_BASE_URL}/sensors/dht11`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                temperature: reading.temp,
                humidity: reading.hum,
                time_slot: timeSlot,
                location_id: locationId,
                module_id: reading.moduleId || selectedModuleId,
                user_id: targetUserId,
                plant_id: p.plant_id,
              }),
            })
          );

          savePromises.push(
            fetch(`${API_BASE_URL}/sensors/bh1750`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                lux: reading.lux,
                time_slot: timeSlot,
                location_id: locationId,
                module_id: reading.moduleId || selectedModuleId,
                user_id: targetUserId,
                plant_id: p.plant_id,
              }),
            })
          );
        });
      } else {
        // Fallback: save at location level if no plants are in this zone yet
        savePromises.push(
          fetch(`${API_BASE_URL}/sensors/dht11`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              temperature: reading.temp,
              humidity: reading.hum,
              time_slot: timeSlot,
              location_id: locationId,
              module_id: reading.moduleId || selectedModuleId,
              user_id: targetUserId,
            }),
          })
        );

        savePromises.push(
          fetch(`${API_BASE_URL}/sensors/bh1750`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              lux: reading.lux,
              time_slot: timeSlot,
              location_id: locationId,
              module_id: reading.moduleId || selectedModuleId,
              user_id: targetUserId,
            }),
          })
        );
      }

      const responses = await Promise.all(savePromises);
      const failed = responses.some((res) => !res.ok);

      if (failed) {
        throw new Error("Failed to save ambient sensor readings for all zone orchids.");
      }

      setReadingResults((prev) => {
        const updated = {
          ...prev,
          [slotKey]: {
            ...prev[slotKey],
            saved: true,
            savedAt: saveTime,
            orchidsCount: zonePlants.length,
          },
        };
        try {
          const todayStr = new Date().toISOString().split("T")[0];
          localStorage.setItem(`orchid_ambient_${todayStr}`, JSON.stringify(updated));
        } catch {
          // Ignore
        }
        return updated;
      });
    } catch (err) {
      console.error(err);
      setActionError(err.message || `Error saving ambient data for ${timeSlot}.`);
    } finally {
      setSavingReadingSlot(null);
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

  const handleUpdateLocation = async (e) => {
    if (e) e.preventDefault();
    if (!editLocName.trim()) {
      setEditLocationError("Please enter a location zone name.");
      return;
    }

    setSavingEditLocation(true);
    setEditLocationError("");
    const token = localStorage.getItem("admin_token");
    try {
      const res = await fetch(`${API_BASE_URL}/locations/${editingLocationId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location_name: editLocName.trim(),
          description: editLocDesc.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to update location zone.");
      }

      setEditingLocationId(null);
      loadUserData();
    } catch (err) {
      console.error("Error updating location:", err);
      setEditLocationError(err.message || "Failed to update location.");
    } finally {
      setSavingEditLocation(false);
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

  const getSpeciesBadgeStyle = (species) => {
    switch (species?.toLowerCase()) {
      case "dendrobium":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/60";
      case "phalaenopsis":
        return "bg-purple-50 text-purple-700 border-purple-200/60";
      case "cattleya":
        return "bg-amber-50 text-amber-700 border-amber-200/60";
      case "vanda":
        return "bg-sky-50 text-sky-700 border-sky-200/60";
      case "oncidium":
        return "bg-yellow-50 text-yellow-800 border-yellow-200/60";
      default:
        return "bg-teal-50 text-teal-700 border-teal-200/60";
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm transition hover:shadow-md">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
          <div className="space-y-1">
            <button
              onClick={onBack}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-bold mb-1 inline-flex items-center gap-1.5 transition group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              Back to Dashboard
            </button>
            <h1 className="text-gray-900 text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2.5">
              <span>Zone Locations & Orchids</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200/60 px-2.5 py-1 rounded-lg">
                <User className="w-3 h-3 text-gray-400" />
                <span className="text-gray-700 font-semibold">{selectedUser.first_name} {selectedUser.last_name}</span>
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-500">{selectedUser.email}</span>
              <span className="text-gray-400">•</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-full text-[11px] border border-emerald-200/50">
                <Layers className="w-3 h-3" />
                {locations.length} Zones
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-teal-50 text-teal-700 font-bold rounded-full text-[11px] border border-teal-200/50">
                🪴 {plants.length} Plants
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <button
              onClick={() => setShowAddLocationModal(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow transition"
            >
              <Plus className="w-4 h-4" />
              New Location Zone
            </button>
            <button
              onClick={() => {
                setTargetLocationId("");
                setShowAddPlantModal(true);
              }}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow transition"
            >
              <Plus className="w-4 h-4" />
              Add Orchid Plant
            </button>
            <button
              onClick={onNavigateToSensors}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs rounded-xl border border-gray-200 transition"
            >
              <Cpu className="w-4 h-4 text-indigo-500" />
              Manage Sensors
            </button>
          </div>
        </div>
      </div>

      {/* Locations Container */}
      {loading ? (
        <div className="p-16 text-center bg-white border border-gray-100 rounded-2xl shadow-xs">
          <div className="w-10 h-10 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-xs font-semibold">Loading orchid collection and zones...</p>
        </div>
      ) : locations.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-xs space-y-4">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-inner">
            🏡
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-gray-900 font-bold text-base">No Location Zones Created Yet</h3>
            <p className="text-gray-500 text-xs">
              Organize your orchids by micro-climate zones like Balconies, Greenhouses, or Indoor Plant Shelves.
            </p>
          </div>
          <button
            onClick={() => setShowAddLocationModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            Create First Location Zone
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {locations.map((loc) => {
            const locPlants = plants.filter((p) => p.location_id === loc.location_id);

            // Compute how many readings for today are already recorded
            const morningKey = `${loc.location_id}_morning`;
            const afternoonKey = `${loc.location_id}_afternoon`;
            const eveningKey = `${loc.location_id}_evening`;

            const isMorningDone = Boolean(readingResults[morningKey]?.saved);
            const isAfternoonDone = Boolean(readingResults[afternoonKey]?.saved);
            const isEveningDone = Boolean(readingResults[eveningKey]?.saved);

            const doneCount = (isMorningDone ? 1 : 0) + (isAfternoonDone ? 1 : 0) + (isEveningDone ? 1 : 0);
            const isSensorsOpen = expandedZoneSensors[loc.location_id];

            return (
              <div
                key={loc.location_id}
                className="bg-white border border-gray-200/80 rounded-2xl shadow-xs overflow-hidden transition-all duration-200 hover:shadow-sm"
              >
                {/* Zone Header Bar */}
                <div className="bg-gradient-to-r from-gray-50 via-slate-50/60 to-white px-6 py-4 border-b border-gray-200/70 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100/70 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>

                    {/* Single div grouping location name and description horizontally */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h2 className="text-gray-900 font-black text-lg tracking-tight">
                        {loc.location_name}
                      </h2>
                      {loc.description && (
                        <span className="text-xs text-gray-500 font-medium">
                          • {loc.description}
                        </span>
                      )}
                    </div>

                    <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200/50 text-emerald-700 text-[11px] font-bold rounded-full shrink-0">
                      {locPlants.length} Orchids
                    </span>

                    {/* Always-Visible Status Badge in Zone Header */}
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full border shrink-0 ${doneCount === 3
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : doneCount > 0
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                    >
                      <Activity className="w-3 h-3 text-teal-600" />
                      {doneCount === 3
                        ? "✓ 3/3 Daily Readings"
                        : `${doneCount}/3 Daily Readings`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
                    {/* Toggle Ambient Sampling Panel */}
                    <button
                      onClick={() => toggleZoneSensors(loc.location_id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${isSensorsOpen
                        ? "bg-teal-600 text-white border-teal-600 shadow-xs"
                        : "bg-white text-teal-700 border-teal-200 hover:bg-teal-50"
                        }`}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>{isSensorsOpen ? "Hide Live Sampling" : "Live Sensor Sampling"}</span>
                      {isSensorsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => {
                        setTargetLocationId(loc.location_id);
                        setShowAddPlantModal(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200/60 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Orchid
                    </button>

                    <button
                      onClick={() => {
                        setEditingLocationId(loc.location_id);
                        setEditLocName(loc.location_name);
                        setEditLocDesc(loc.description || "");
                        setEditLocationError("");
                      }}
                      title="Edit Zone"
                      className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteLocation(loc.location_id)}
                      title="Delete Zone"
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg border border-rose-200/60 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Zone Body */}
                <div className="p-6 space-y-6">
                  {/* Collapsible ESP32 Ambient Telemetry Sampling */}
                  {isSensorsOpen && (
                    <div className="border border-teal-200/80 bg-gradient-to-b from-teal-50/40 via-teal-50/20 to-white rounded-2xl p-5 space-y-4 animate-in fade-in duration-200">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-teal-100 pb-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse"></span>
                              ESP32 Ambient Telemetry Sampling
                            </h3>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${doneCount === 3
                                ? "bg-emerald-100 text-emerald-800"
                                : doneCount > 0
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-gray-100 text-gray-600"
                                }`}
                            >
                              {doneCount === 3
                                ? "✓ All 3 Today's Readings Added"
                                : `${doneCount} of 3 Daily Readings Added`}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            30-second live sampling (samples at 1s, 15s, 28s) to compute accurate daily morning, afternoon & evening microclimate.
                          </p>
                        </div>

                        {/* Sensor Selector & Status Check */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full md:w-auto">
                          <select
                            value={selectedModuleId}
                            onChange={(e) => {
                              setSelectedModuleId(e.target.value);
                              setSensorStatus(null);
                            }}
                            className="text-xs bg-white border border-teal-200 rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none w-full sm:w-auto shadow-2xs"
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
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 shrink-0 w-full sm:w-auto shadow-2xs"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? "animate-spin" : ""}`} />
                            {checkingStatus ? "Testing..." : "Check Status"}
                          </button>
                        </div>
                      </div>

                      {/* Status Indicator Banner */}
                      {sensorStatus && (
                        <div
                          className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between border ${sensorStatus.online
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-rose-50 border-rose-200 text-rose-800"
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            {sensorStatus.online ? (
                              <Wifi className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <WifiOff className="w-4 h-4 text-rose-600" />
                            )}
                            <span>
                              <strong>Module:</strong> {sensorStatus.online ? "Online & Ready" : "Disconnected / Offline"} (
                              {sensorStatus.msg || (sensorStatus.online ? "Ready" : "Offline")})
                            </span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/80 uppercase tracking-wider">
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

                      {/* 3 Daily Slot Cards: Morning, Afternoon, Evening */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        {["morning", "afternoon", "evening"].map((slot) => {
                          const key = `${loc.location_id}_${slot}`;
                          const isSampling = samplingSlotKey === key;
                          const res = readingResults[key];
                          const isSaving = savingReadingSlot === key;
                          const isAdded = Boolean(res?.saved);

                          return (
                            <div
                              key={slot}
                              className={`p-4 rounded-xl flex flex-col justify-between space-y-3.5 transition border ${isAdded
                                ? "bg-white border-emerald-300 shadow-2xs"
                                : res
                                  ? "bg-white border-amber-300 shadow-2xs"
                                  : "bg-white/90 border-gray-200 shadow-2xs"
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="capitalize font-extrabold text-xs text-gray-800 flex items-center gap-1.5">
                                  {getSlotIcon(slot)}
                                  {slot} Reading
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {isAdded ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                      Added Today
                                    </span>
                                  ) : res ? (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded-full">
                                      Sampled (Unsaved)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-full border border-gray-200">
                                      Not Added Yet
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* 30s Sampling Countdown & Progress */}
                              {isSampling ? (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                                  <div className="flex justify-between text-[11px] font-bold text-emerald-800">
                                    <span>Sample {samplingSampleCount}/3 in progress...</span>
                                    <span>{samplingCountdown}s left</span>
                                  </div>
                                  <div className="w-full bg-emerald-200/70 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className="bg-emerald-600 h-full transition-all duration-1000"
                                      style={{ width: `${((30 - samplingCountdown) / 30) * 100}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-[10px] text-emerald-700 block">
                                    Sampling at 1s, 15s, and 28s
                                  </span>
                                </div>
                              ) : res ? (
                                <div className="p-2.5 bg-slate-50/80 rounded-xl text-xs space-y-1.5 border border-gray-100">
                                  <div className="flex justify-between items-center text-rose-600 font-semibold">
                                    <span className="text-gray-500 text-[11px]">Temperature:</span>
                                    <span className="font-bold">{res.temp} °C</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sky-600 font-semibold">
                                    <span className="text-gray-500 text-[11px]">Humidity:</span>
                                    <span className="font-bold">{res.hum} %</span>
                                  </div>
                                  <div className="flex justify-between items-center text-amber-700 font-semibold">
                                    <span className="text-gray-500 text-[11px]">Light (Lux):</span>
                                    <span className="font-bold">{res.lux} Lux</span>
                                  </div>
                                  <span className="text-gray-400 text-[10px] block pt-1 border-t border-gray-200/60">
                                    {res.saved
                                      ? `Saved to ${res.orchidsCount !== undefined ? `${res.orchidsCount} orchids` : "orchids"} at ${res.savedAt || res.timestamp}`
                                      : `30s avg (${res.samplesCount || 3} samples)`} • {res.date || "Today"}
                                  </span>
                                </div>
                              ) : (
                                <div className="py-2.5 text-center">
                                  <p className="text-xs text-gray-400 italic">
                                    No telemetry recorded for {slot} today.
                                  </p>
                                </div>
                              )}

                              {isSampling ? (
                                <button
                                  disabled
                                  className="w-full py-2 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl transition opacity-75"
                                >
                                  Sampling ({samplingCountdown}s)...
                                </button>
                              ) : res && !res.saved ? (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveAmbientData(loc.location_id, slot)}
                                    disabled={isSaving || Boolean(samplingSlotKey)}
                                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50"
                                  >
                                    {isSaving
                                      ? "Saving to Orchids..."
                                      : locPlants.length > 0
                                        ? `Save to ${locPlants.length} Orchids`
                                        : "Save to DB"}
                                  </button>
                                  <button
                                    onClick={() => handleStartSampling(loc.location_id, slot)}
                                    disabled={Boolean(samplingSlotKey) || isSaving}
                                    title="Re-run 30-second sampling"
                                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition disabled:opacity-50 shrink-0"
                                  >
                                    Re-Sample
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleStartSampling(loc.location_id, slot)}
                                  disabled={Boolean(samplingSlotKey) || isSaving}
                                  className={`w-full py-2 font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50 ${isAdded
                                    ? "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200/70"
                                    : "bg-teal-600 hover:bg-teal-700 text-white"
                                    }`}
                                >
                                  {isAdded ? "Re-Read Ambient" : "Sample Ambient (30s)"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Zone Plants Grid */}
                  <div className="space-y-3">
                    {locPlants.length === 0 ? (
                      <div className="p-8 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 text-center">
                        <div className="w-12 h-12 bg-white rounded-xl shadow-xs flex items-center justify-center text-2xl mx-auto mb-2 border border-gray-200/60">
                          🪴
                        </div>
                        <p className="text-xs font-bold text-gray-700">
                          No orchids registered in this zone
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Add an orchid or transfer one here to start tracking health and telemetry.
                        </p>
                        <button
                          onClick={() => {
                            setTargetLocationId(loc.location_id);
                            setShowAddPlantModal(true);
                          }}
                          className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Orchid to {loc.location_name}
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {locPlants.map((p) => (
                          <div
                            key={p.plant_id}
                            onClick={() => onSelectPlant(p)}
                            className="group p-4 bg-white border border-gray-200/80 rounded-2xl hover:border-emerald-500 hover:shadow-md cursor-pointer transition-all duration-200 flex items-center justify-between gap-3 relative overflow-hidden"
                          >
                            <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                                🪴
                              </div>
                              <div className="overflow-hidden flex-1 min-w-0">
                                <h5 className="font-extrabold text-sm text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                                  {p.plant_name}
                                </h5>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span
                                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${getSpeciesBadgeStyle(
                                      p.plant_species
                                    )}`}
                                  >
                                    {p.plant_species}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transform group-hover:translate-x-1 transition-all shrink-0" />
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
                  <h4 className="text-sm font-extrabold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <span>Unassigned Orchids</span>
                    <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-full">
                      {plants.filter((p) => !p.location_id).length}
                    </span>
                  </h4>
                  <p className="text-xs text-gray-400">These orchids are not assigned to any physical microclimate location zone</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {plants
                  .filter((p) => !p.location_id)
                  .map((p) => (
                    <div
                      key={p.plant_id}
                      onClick={() => onSelectPlant(p)}
                      className="group p-4 bg-white border border-gray-200 rounded-2xl hover:border-emerald-500 hover:shadow-md cursor-pointer transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                          🪴
                        </div>
                        <div className="overflow-hidden">
                          <h5 className="font-bold text-xs text-gray-900 truncate group-hover:text-emerald-700">
                            {p.plant_name}
                          </h5>
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border mt-0.5 ${getSpeciesBadgeStyle(
                              p.plant_species
                            )}`}
                          >
                            {p.plant_species}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-600 transition" />
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Location Modal */}
      {showAddLocationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <MapPin className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-gray-900">Add Location Zone</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddLocationModal(false);
                  setLocationModalError("");
                }}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-sm font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {locationModalError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{locationModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateLocation} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Location Zone Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Balcony Orchid Shelf"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Microclimate Notes & Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., East-facing indirect morning sunlight, 65-75% RH"
                  value={newLocationDesc}
                  onChange={(e) => setNewLocationDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100">
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
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 font-bold rounded-xl text-white transition flex items-center gap-1.5 shadow-xs"
                >
                  {savingLocation ? "Saving Zone..." : "Save Zone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Location Modal */}
      {editingLocationId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <MapPin className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-gray-900">Edit Location Zone</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingLocationId(null);
                  setEditLocationError("");
                }}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-sm font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {editLocationError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editLocationError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateLocation} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Location Zone Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Balcony Orchid Shelf"
                  value={editLocName}
                  onChange={(e) => setEditLocName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Microclimate Notes & Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., East-facing indirect morning sunlight, 65-75% RH"
                  value={editLocDesc}
                  onChange={(e) => setEditLocDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingLocationId(null);
                    setEditLocationError("");
                  }}
                  className="px-4 py-2 text-xs bg-gray-100 hover:bg-gray-200 font-semibold rounded-xl text-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEditLocation}
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 font-bold rounded-xl text-white transition flex items-center gap-1.5 shadow-xs"
                >
                  {savingEditLocation ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Plant Modal */}
      {showAddPlantModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  🪴
                </div>
                <h3 className="text-base font-extrabold text-gray-900">Add Orchid Plant</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddPlantModal(false);
                  setPlantModalError("");
                }}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-sm font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {plantModalError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{plantModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePlant} className="space-y-3.5">
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
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Orchid Genus / Species
                </label>
                <select
                  value={newPlant.plant_species}
                  onChange={(e) =>
                    setNewPlant({ ...newPlant, plant_species: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                >
                  <option value="Dendrobium">Dendrobium</option>
                  <option value="Phalaenopsis">Phalaenopsis</option>
                  <option value="Cattleya">Cattleya</option>
                  <option value="Vanda">Vanda</option>
                  <option value="Oncidium">Oncidium</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Assign Location Zone
                </label>
                <select
                  value={targetLocationId}
                  onChange={(e) => setTargetLocationId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                >
                  <option value="">-- No Specific Location (Unassigned) --</option>
                  {locations.map((l) => (
                    <option key={l.location_id} value={l.location_id}>
                      {l.location_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100">
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
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 font-bold rounded-xl text-white transition flex items-center gap-1.5 shadow-xs"
                >
                  {savingPlant ? "Adding Plant..." : "Save Orchid"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}