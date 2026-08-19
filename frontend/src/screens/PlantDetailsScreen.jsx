import React, { useState, useEffect } from "react";
import AnalyseDisease from "./AnalyseDisease";
import AnalyseFertilizer from "./AnalyseFertilizer";
import PredictBlooming from "./PredictBlooming";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PlantDetailsScreen({ selectedPlant, selectedUser, onBack }) {
  const [currentView, setCurrentView] = useState("details");

  const [sensorTab, setSensorTab] = useState("dht11");
  const [sensorData, setSensorData] = useState([]);
  const [sensorTotal, setSensorTotal] = useState(0);
  const [sensorPage, setSensorPage] = useState(1);
  const [loadingSensors, setLoadingSensors] = useState(false);

  const [outputTab, setOutputTab] = useState("disease");
  const [outputData, setOutputData] = useState([]);
  const [outputTotal, setOutputTotal] = useState(0);
  const [outputPage, setOutputPage] = useState(1);
  const [loadingOutputs, setLoadingOutputs] = useState(false);

  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [sensorStatus, setSensorStatus] = useState(null);

  const [activeReadingSlot, setActiveReadingSlot] = useState(null);
  const [submittingSlot, setSubmittingSlot] = useState(null);
  const [stagedReadings, setStagedReadings] = useState({});
  const [submittedSlots, setSubmittedSlots] = useState({});
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [selectedImage, setSelectedImage] = useState(null);
  const LIMIT = 10;

  useEffect(() => {
    setSensorPage(1);
  }, [sensorTab]);

  useEffect(() => {
    setOutputPage(1);
  }, [outputTab]);

  useEffect(() => {
    fetchSensorData();
  }, [sensorTab, sensorPage, selectedPlant]);

  useEffect(() => {
    fetchOutputData();
  }, [outputTab, outputPage, selectedPlant]);

  useEffect(() => {
    if (selectedUser?.user_id) {
      fetchUserModules(selectedUser.user_id);
    }
  }, [selectedUser]);

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
          setSelectedModuleId(data[0].module_id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckSensorStatus = async () => {
    if (!selectedModuleId) return;
    setCheckingStatus(true);
    setSensorStatus(null);
    setActionError("");
    setActionSuccess("");

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

  const handleCheckEnvironmentData = async (timeSlot) => {
    if (!selectedModuleId) {
      setActionError("Please select a sensor module.");
      return;
    }
    const slotKey = `env_${timeSlot}`;
    setActiveReadingSlot(slotKey);
    setActionError("");
    setActionSuccess("");

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(
        `${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-ambient`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to read environment sensors.");
      }

      const data = await res.json();
      setStagedReadings((prev) => ({
        ...prev,
        [slotKey]: {
          temperature: Number(data.temperature),
          humidity: Number(data.humidity),
          lux: Number(data.lux),
          timestamp: new Date().toLocaleTimeString(),
        },
      }));
    } catch (err) {
      console.error(err);
      setActionError(err.message || `Error checking environment data for ${timeSlot}.`);
    } finally {
      setActiveReadingSlot(null);
    }
  };

  const handleSubmitEnvironmentData = async (timeSlot) => {
    const slotKey = `env_${timeSlot}`;
    const reading = stagedReadings[slotKey];

    if (!reading) return;

    if (!selectedPlant.location_id) {
      setActionError("Cannot submit: This plant has no assigned location zone.");
      return;
    }

    setSubmittingSlot(slotKey);
    setActionError("");
    setActionSuccess("");

    try {
      const token = localStorage.getItem("admin_token");

      const [dhtRes, bhRes] = await Promise.all([
        fetch(`${API_BASE_URL}/sensors/dht11`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            temperature: reading.temperature,
            humidity: reading.humidity,
            time_slot: timeSlot,
            location_id: selectedPlant.location_id,
            module_id: selectedModuleId,
          }),
        }),
        fetch(`${API_BASE_URL}/sensors/bh1750`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            lux: reading.lux,
            time_slot: timeSlot,
            location_id: selectedPlant.location_id,
            module_id: selectedModuleId,
          }),
        }),
      ]);

      if (!dhtRes.ok || !bhRes.ok) {
        throw new Error("Failed to submit readings to environment history.");
      }

      setSubmittedSlots((prev) => ({ ...prev, [slotKey]: true }));
      setActionSuccess(`Successfully submitted ${timeSlot} environment reading to history.`);
      fetchSensorData();
    } catch (err) {
      console.error(err);
      setActionError(err.message || `Failed to submit ${timeSlot} reading.`);
    } finally {
      setSubmittingSlot(null);
    }
  };

  const handleCheckNPKData = (timeSlot) => {
    setActionSuccess("");
    setActionError(`Error: NPK sensor probe not detected or communication error for ${timeSlot} slot.`);
  };

  const fetchSensorData = async () => {
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
  };

  const fetchOutputData = async () => {
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
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-6">
      {/* Plant Information Header */}
      <div className="border-b pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-emerald-600 hover:underline font-semibold mb-1 block"
          >
            Back to Plants
          </button>
          <h2 className="text-[#1f2937] text-2xl font-extrabold">{selectedPlant.plant_name}</h2>
          <div className="flex flex-wrap space-x-4 text-xs text-gray-500 mt-1">
            <span>Species: <strong className="text-gray-700">{selectedPlant.plant_species || "N/A"}</strong></span>
            <span>Location: <strong className="text-gray-700">{selectedPlant.plant_location || selectedPlant.locations?.location_name || "Unassigned"}</strong></span>
            <span>Owner: <strong className="text-gray-700">{selectedUser.first_name} {selectedUser.last_name}</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCurrentView("analyse_disease")}
            className="px-3 py-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold rounded-lg shadow-xs transition"
          >
            Analyse Disease
          </button>
          <button
            onClick={() => setCurrentView("analyse_fertilizer")}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
          >
            Analyse Fertilizer
          </button>
          <button
            onClick={() => setCurrentView("predict_blooming")}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
          >
            Predict Blooming
          </button>
        </div>
      </div>

      {/* Manual Sensor Sampling Section */}
      <div className="border border-emerald-200 bg-emerald-50/20 rounded-xl p-5 space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-emerald-100 pb-3">
          <div>
            <h3 className="font-bold text-gray-800 text-base">
              Daily Environment & Soil NPK Readings
            </h3>
            <p className="text-xs text-gray-500">
              Collect 3 daily readings (Morning, Afternoon, Evening) from the hardware sensor module.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={selectedModuleId}
              onChange={(e) => {
                setSelectedModuleId(e.target.value);
                setSensorStatus(null);
              }}
              className="text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 shrink-0"
            >
              {checkingStatus ? "Checking..." : "Check Status"}
            </button>
          </div>
        </div>

        {actionError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium">
            {actionError}
          </div>
        )}

        {actionSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-medium">
            {actionSuccess}
          </div>
        )}

        {sensorStatus && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 bg-white rounded-lg border">
              <span className="text-gray-400 block text-[10px] uppercase font-bold">Module Link</span>
              <span className={`font-bold ${sensorStatus.online ? "text-emerald-600" : "text-rose-600"}`}>
                {sensorStatus.online ? "Online" : "Offline"}
              </span>
            </div>
            <div className="p-2 bg-white rounded-lg border">
              <span className="text-gray-400 block text-[10px] uppercase font-bold">DHT11 Temp/RH</span>
              <span className={`font-bold ${sensorStatus.dht11 ? "text-emerald-600" : "text-rose-600"}`}>
                {sensorStatus.dht11 ? "Ready" : "Error"}
              </span>
            </div>
            <div className="p-2 bg-white rounded-lg border">
              <span className="text-gray-400 block text-[10px] uppercase font-bold">BH1750 Lux</span>
              <span className={`font-bold ${sensorStatus.bh1750 ? "text-emerald-600" : "text-rose-600"}`}>
                {sensorStatus.bh1750 ? "Ready" : "Error"}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Environment Data Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-gray-800 text-sm">
                Get Environment Data
              </h4>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                DHT11 & BH1750
              </span>
            </div>

            <div className="space-y-2.5">
              {["morning", "afternoon", "evening"].map((slot) => {
                const key = `env_${slot}`;
                const reading = stagedReadings[key];
                const isChecking = activeReadingSlot === key;
                const isSubmitting = submittingSlot === key;
                const isSubmitted = submittedSlots[key];

                return (
                  <div
                    key={slot}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <span className="capitalize font-bold text-xs text-gray-700 block">
                        {slot} Reading
                      </span>
                      {reading ? (
                        <div className="text-[11px] font-semibold text-gray-600 space-x-2 mt-0.5">
                          <span className="text-rose-600">{reading.temperature} °C</span>
                          <span>•</span>
                          <span className="text-sky-600">{reading.humidity} %</span>
                          <span>•</span>
                          <span className="text-amber-600">{reading.lux} Lux</span>
                          <span className="text-gray-400 text-[10px]">({reading.timestamp})</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-400">Click Check to sample.</span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => handleCheckEnvironmentData(slot)}
                        disabled={isChecking || isSubmitting}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 font-bold text-xs rounded-lg transition disabled:opacity-50"
                      >
                        {isChecking ? "Reading..." : "Check"}
                      </button>

                      <button
                        onClick={() => handleSubmitEnvironmentData(slot)}
                        disabled={!reading || isSubmitting || isChecking}
                        className={`px-3 py-1.5 font-bold text-xs rounded-lg shadow-xs transition disabled:opacity-40 text-white ${isSubmitted
                            ? "bg-slate-700 hover:bg-slate-800"
                            : "bg-emerald-600 hover:bg-emerald-700"
                          }`}
                      >
                        {isSubmitting ? "Saving..." : isSubmitted ? "Resubmit" : "Submit"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NPK Data Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-gray-800 text-sm">
                Get NPK Data
              </h4>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                NPK History
              </span>
            </div>

            <div className="space-y-2.5">
              {["morning", "afternoon", "evening"].map((slot) => (
                <div
                  key={slot}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div>
                    <span className="capitalize font-bold text-xs text-gray-700 block">
                      {slot} Reading
                    </span>
                    <span className="text-[11px] text-gray-400">Click Check to sample.</span>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => handleCheckNPKData(slot)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 font-bold text-xs rounded-lg transition"
                    >
                      Check
                    </button>
                    <button
                      disabled
                      className="px-3 py-1.5 bg-teal-600 text-white font-bold text-xs rounded-lg opacity-40 cursor-not-allowed"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 1. Real-Time Hardware Sensor Telemetry */}
      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4">
        <h3 className="font-bold text-gray-800 text-base">1. Real-Time Hardware Sensor Telemetry</h3>

        <div className="flex space-x-2 border-b border-gray-200 pb-2">
          {[
            { id: "dht11", label: "DHT11 Temp/Humidity" },
            { id: "bh1750", label: "BH1750 Light" },
            { id: "npk", label: "NPK Soil Sensor" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSensorTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${sensorTab === tab.id
                  ? "bg-[#059669] text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loadingSensors ? (
          <p className="text-gray-400 text-sm py-4">Loading sensor data...</p>
        ) : sensorData.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">No sensor readings logged for this tab.</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm text-[#1f2937]">
              <thead className="bg-[#f9fafb] text-[#6b7280] uppercase text-xs border-b border-gray-200">
                <tr>
                  {sensorTab === "dht11" && (
                    <>
                      <th className="px-4 py-3">Temperature (°C)</th>
                      <th className="px-4 py-3">Humidity (%)</th>
                      <th className="px-4 py-3">Time Slot</th>
                      <th className="px-4 py-3">Module ID</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </>
                  )}
                  {sensorTab === "bh1750" && (
                    <>
                      <th className="px-4 py-3">Light Level (Lux)</th>
                      <th className="px-4 py-3">Time Slot</th>
                      <th className="px-4 py-3">Module ID</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </>
                  )}
                  {sensorTab === "npk" && (
                    <>
                      <th className="px-4 py-3">Nitrogen (N)</th>
                      <th className="px-4 py-3">Phosphorus (P)</th>
                      <th className="px-4 py-3">Potassium (K)</th>
                      <th className="px-4 py-3">Module ID</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e7eb]">
                {sensorData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {sensorTab === "dht11" && (
                      <>
                        <td className="px-4 py-3 font-semibold text-rose-600">{row.temperature} °C</td>
                        <td className="px-4 py-3 font-semibold text-sky-600">{row.humidity} %</td>
                        <td className="px-4 py-3 text-xs capitalize text-gray-600">{row.time_slot || "custom"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{row.module_id || "N/A"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                    {sensorTab === "bh1750" && (
                      <>
                        <td className="px-4 py-3 font-semibold text-amber-600">{row.lux} Lux</td>
                        <td className="px-4 py-3 text-xs capitalize text-gray-600">{row.time_slot || "custom"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{row.module_id || "N/A"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                    {sensorTab === "npk" && (
                      <>
                        <td className="px-4 py-3 font-semibold text-emerald-700">{row.nitrogen_n} mg/kg</td>
                        <td className="px-4 py-3 font-semibold text-amber-700">{row.phosphorus_p} mg/kg</td>
                        <td className="px-4 py-3 font-semibold text-rose-700">{row.potassium_k} mg/kg</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{row.module_id || "N/A"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 text-xs">
          <span className="text-gray-500">
            Page <strong>{sensorPage}</strong> of <strong>{sensorTotalPages}</strong> ({sensorTotal} items)
          </span>
          <div className="space-x-2">
            <button
              disabled={sensorPage === 1}
              onClick={() => setSensorPage((p) => Math.max(p - 1, 1))}
              className="px-3 py-1 bg-white border text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={sensorPage >= sensorTotalPages}
              onClick={() => setSensorPage((p) => p + 1)}
              className="px-3 py-1 bg-white border text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* 2. Diagnostic & Algorithmic System Outputs */}
      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4">
        <h3 className="font-bold text-gray-800 text-base">2. Diagnostic & Algorithmic System Outputs</h3>

        <div className="flex space-x-2 border-b border-gray-200 pb-2">
          {[
            { id: "disease", label: "Disease AI Outputs" },
            { id: "fertilizer", label: "Fertilizer Schedule" },
            { id: "bloom", label: "Bloom Predictions" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setOutputTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${outputTab === tab.id
                  ? "bg-[#059669] text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loadingOutputs ? (
          <p className="text-gray-400 text-sm py-4">Loading outputs...</p>
        ) : outputData.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">No diagnostic history logged for this tab.</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm text-[#1f2937]">
              <thead className="bg-[#f9fafb] text-[#6b7280] uppercase text-xs border-b border-gray-200">
                <tr>
                  {outputTab === "disease" && (
                    <>
                      <th className="px-4 py-3">Verdict</th>
                      <th className="px-4 py-3">Disease Name</th>
                      <th className="px-4 py-3">Confidence</th>
                      <th className="px-4 py-3">Annotated Image</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </>
                  )}
                  {outputTab === "fertilizer" && (
                    <>
                      <th className="px-4 py-3">Fertilizer Type</th>
                      <th className="px-4 py-3">Quantity</th>
                      <th className="px-4 py-3">Unit</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </>
                  )}
                  {outputTab === "bloom" && (
                    <>
                      <th className="px-4 py-3">Bloom Prediction</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Timestamp</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e7eb]">
                {outputData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {outputTab === "disease" && (
                      <>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${row.verdict === "HEALTHY"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                              }`}
                          >
                            {row.verdict}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">{row.disease_name}</td>
                        <td className="px-4 py-3 font-bold">{row.confidence}%</td>
                        <td className="px-4 py-3">
                          {row.result_image_b64 ? (
                            <button
                              onClick={() => setSelectedImage(`data:image/jpeg;base64,${row.result_image_b64}`)}
                              className="px-2 py-1 bg-sky-100 text-sky-700 rounded text-xs font-semibold hover:bg-sky-200"
                            >
                              Preview Image
                            </button>
                          ) : (
                            <span className="text-gray-400 text-xs">No Image</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                    {outputTab === "fertilizer" && (
                      <>
                        <td className="px-4 py-3 font-semibold">{row.fertilizer}</td>
                        <td className="px-4 py-3">{row.qty}</td>
                        <td className="px-4 py-3">{row.unit}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                    {outputTab === "bloom" && (
                      <>
                        <td className="px-4 py-3 font-semibold">
                          {row.weeks ? `${row.weeks} Weeks` : (row.bloom_status || row.prediction || "N/A")}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-semibold text-xs">
                            {row.status || "Predicted"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 text-xs">
          <span className="text-gray-500">
            Page <strong>{outputPage}</strong> of <strong>{outputTotalPages}</strong> ({outputTotal} items)
          </span>
          <div className="space-x-2">
            <button
              disabled={outputPage === 1}
              onClick={() => setOutputPage((p) => Math.max(p - 1, 1))}
              className="px-3 py-1 bg-white border text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={outputPage >= outputTotalPages}
              onClick={() => setOutputPage((p) => p + 1)}
              className="px-3 py-1 bg-white border text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-4 rounded-xl max-w-2xl w-full">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-gray-800">YOLO Disease Detection Result</h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-500 font-bold hover:text-gray-800 text-lg"
              >
                Close
              </button>
            </div>
            <img src={selectedImage} alt="Annotated Leaf" className="w-full rounded-lg border max-h-[70vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}