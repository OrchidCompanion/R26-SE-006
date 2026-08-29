import React, { useState, useEffect } from "react";
import AnalyseDisease from "./AnalyseDisease";
import AnalyseFertilizer from "./AnalyseFertilizer";
import PredictBlooming from "./PredictBlooming";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PlantDetailsScreen({ selectedPlant, selectedUser, onBack }) {
  const [currentView, setCurrentView] = useState("details");

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

  // Hardware Module & Soil NPK Reading State
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [sensorStatus, setSensorStatus] = useState(null);
  const [activeReadingSlot, setActiveReadingSlot] = useState(null);
  const [readingResults, setReadingResults] = useState({});
  const [actionError, setActionError] = useState("");

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
          // Preselect NPK module if found, else default to first
          const npkMod = data.find((m) => m.module_id === "441bf68cbc78" || m.device_name?.toLowerCase().includes("npk"));
          setSelectedModuleId(npkMod ? npkMod.module_id : data[0].module_id);
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
        throw new Error(errorData.detail || "NPK sensor read failed.");
      }

      const data = await readRes.json();

      const n = Number(data.nitrogen_n ?? data.nitrogen ?? 0);
      const p = Number(data.phosphorus_p ?? data.phosphorus ?? 0);
      const k = Number(data.potassium_k ?? data.potassium ?? 0);

      await fetch(`${API_BASE_URL}/sensors/npk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nitrogen_n: n,
          phosphorus_p: p,
          potassium_k: k,
          plant_id: selectedPlant.plant_id,
          module_id: selectedModuleId,
          time_slot: timeSlot,
        }),
      });

      setReadingResults((prev) => ({
        ...prev,
        [slotKey]: { n, p, k, timestamp: new Date().toLocaleTimeString() },
      }));

      if (sensorTab === "npk") {
        fetchSensorData();
      }
    } catch (err) {
      console.error(err);
      setActionError(err.message || `Error reading NPK data for ${timeSlot}.`);
    } finally {
      setActiveReadingSlot(null);
    }
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
      {/* Plant Header */}
      <div className="border-b pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-emerald-600 hover:underline font-semibold mb-1 block"
          >
            ← Back to Plants
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

      {/* Spot-Check Soil NPK Sampling Box */}
      <div className="border border-teal-200 bg-teal-50/20 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-teal-100 pb-3">
          <div>
            <h3 className="font-bold text-gray-800 text-base">
              Daily Plant Soil NPK Sampling
            </h3>
            <p className="text-xs text-gray-500">
              Trigger instant live NPK readings from the connected ESP32-S3 node over WebSockets.
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
              <option value="">-- Select NPK Module --</option>
              {modules.map((m) => (
                <option key={m.module_id} value={m.module_id}>
                  {m.device_name} ({m.module_id}) {m.is_online ? "🟢 Online" : "🔴 Offline"}
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
              {sensorStatus.msg})
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {sensorStatus.device || "Node"}
            </span>
          </div>
        )}

        {actionError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium">
            {actionError}
          </div>
        )}

        {/* NPK Time-slot Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {["morning", "afternoon", "evening"].map((slot) => {
            const key = `npk_${slot}`;
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
                    Soil NPK
                  </span>
                </div>

                {res ? (
                  <div className="text-xs font-semibold space-y-1">
                    <div className="text-emerald-700">Nitrogen (N): <strong>{res.n} mg/kg</strong></div>
                    <div className="text-amber-700">Phosphorus (P): <strong>{res.p} mg/kg</strong></div>
                    <div className="text-rose-700">Potassium (K): <strong>{res.k} mg/kg</strong></div>
                    <span className="text-gray-400 text-[10px] block pt-1">Logged at {res.timestamp}</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No reading recorded for {slot}.</p>
                )}

                <button
                  onClick={() => handleReadNPKData(slot)}
                  disabled={isLoading}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {isLoading ? "Reading Sensor..." : "Read NPK Data"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 1. Real-Time Hardware Sensor Telemetry */}
      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4">
        <h3 className="font-bold text-gray-800 text-base">1. Real-Time Hardware Sensor Telemetry</h3>

        {/* Sensor Tabs */}
        <div className="flex space-x-2 border-b border-gray-200 pb-2">
          {[
            { id: "npk", label: "NPK Soil Sensor" },
            { id: "dht11", label: "DHT11 Temp/Humidity" },
            { id: "bh1750", label: "BH1750 Light" },
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

        {/* Sensor Table */}
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
                      <th className="px-4 py-3">Time Slot</th>
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
                        <td className="px-4 py-3 text-xs capitalize text-gray-600">{row.time_slot}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{row.module_id || "N/A"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                    {sensorTab === "bh1750" && (
                      <>
                        <td className="px-4 py-3 font-semibold text-amber-600">{row.lux} Lux</td>
                        <td className="px-4 py-3 text-xs capitalize text-gray-600">{row.time_slot}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{row.module_id || "N/A"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                    {sensorTab === "npk" && (
                      <>
                        <td className="px-4 py-3 font-semibold text-emerald-700">{row.nitrogen_n} mg/kg</td>
                        <td className="px-4 py-3 font-semibold text-amber-700">{row.phosphorus_p} mg/kg</td>
                        <td className="px-4 py-3 font-semibold text-rose-700">{row.potassium_k} mg/kg</td>
                        <td className="px-4 py-3 text-xs capitalize text-gray-600">{row.time_slot}</td>
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
              ← Previous
            </button>
            <button
              disabled={sensorPage >= sensorTotalPages}
              onClick={() => setSensorPage((p) => p + 1)}
              className="px-3 py-1 bg-white border text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Next →
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
              ← Previous
            </button>
            <button
              disabled={outputPage >= outputTotalPages}
              onClick={() => setOutputPage((p) => p + 1)}
              className="px-3 py-1 bg-white border text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Next →
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
                ✕
              </button>
            </div>
            <img src={selectedImage} alt="Annotated Leaf" className="w-full rounded-lg border max-h-[70vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}