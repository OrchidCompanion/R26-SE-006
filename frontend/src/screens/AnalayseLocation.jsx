import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function AnalayseLocation({ onBack }) {
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);

  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  const [moduleSearch, setModuleSearch] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");

  const [showAddModuleModal, setShowAddModuleModal] = useState(false);
  const [newMacAddress, setNewMacAddress] = useState("");
  const [newDeviceName, setNewDeviceName] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  const [checkingStatus, setCheckingStatus] = useState(false);
  const [sensorStatus, setSensorStatus] = useState(null);

  const [selectedOrchid, setSelectedOrchid] = useState("Dendrobium");
  const [analyzing, setAnalyzing] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [readings, setReadings] = useState([]);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);
  const [error, setError] = useState("");

  const THRESHOLDS = {
    tempMin: 25,
    tempMax: 30,
    humMin: 70,
    humMax: 75,
    luxMin: 16000,
    luxMax: 32000,
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      const u = users.find((item) => item.user_id === selectedUserId);
      setSelectedUser(u || null);
      fetchUserModules(selectedUserId);
    } else {
      setSelectedUser(null);
      setModules([]);
      setSelectedModuleId("");
      setSensorStatus(null);
    }
  }, [selectedUserId, users]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUserModules = async (userId) => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/sensors/modules/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setModules(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) =>
      `${u.first_name} ${u.last_name} ${u.email}`
        .toLowerCase()
        .includes(userSearch.toLowerCase())
    );
  }, [users, userSearch]);

  const filteredModules = useMemo(() => {
    return modules.filter((m) =>
      `${m.device_name} ${m.module_id}`
        .toLowerCase()
        .includes(moduleSearch.toLowerCase())
    );
  }, [modules, moduleSearch]);

  const handleSaveModule = async (e) => {
    e.preventDefault();
    if (!newMacAddress.trim() || !selectedUserId) return;
    setModalSaving(true);
    try {
      const token = localStorage.getItem("admin_token");
      const cleanedMac = newMacAddress.trim().toLowerCase();
      const res = await fetch(`${API_BASE_URL}/sensors/modules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          module_id: cleanedMac,
          device_name: newDeviceName.trim() || "ESP32 S3 Node",
          user_id: selectedUserId,
        }),
      });

      if (res.ok) {
        setShowAddModuleModal(false);
        setNewMacAddress("");
        setNewDeviceName("");
        fetchUserModules(selectedUserId);
        setSelectedModuleId(cleanedMac);
      } else {
        const errData = await res.json();
        alert(errData.detail || "Failed to register module.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setModalSaving(false);
    }
  };

  const handleCheckSensorStatus = async () => {
    if (!selectedModuleId) return;
    setCheckingStatus(true);
    setError("");
    setSensorStatus(null);
    setAnalysisCompleted(false);
    setReadings([]);

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

  const handleStartAnalysis = () => {
    setAnalyzing(true);
    setCountdown(60);
    setReadings([]);
    setAnalysisCompleted(false);
    setError("");

    let secondsLeft = 60;
    const collected = [];

    const fetchSingleReading = async () => {
      try {
        const token = localStorage.getItem("admin_token");
        const res = await fetch(
          `${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-ambient`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          return {
            temp: Number(data.temperature),
            hum: Number(data.humidity),
            lux: Number(data.lux),
          };
        }
      } catch (err) {
        console.warn("Read failed:", err);
      }
      return null;
    };

    const timer = setInterval(async () => {
      secondsLeft -= 1;
      setCountdown(secondsLeft);

      if (secondsLeft === 40 || secondsLeft === 20 || secondsLeft === 0) {
        const sample = await fetchSingleReading();
        if (sample) {
          sample.sampleIndex = collected.length + 1;
          sample.time = new Date().toLocaleTimeString();
          collected.push(sample);
          setReadings([...collected]);
        }
      }

      if (secondsLeft <= 0) {
        clearInterval(timer);
        setAnalyzing(false);
        setAnalysisCompleted(true);
      }
    }, 1000);
  };

  const averages = useMemo(() => {
    if (readings.length === 0) return { temp: 0, hum: 0, lux: 0 };
    const sum = readings.reduce(
      (acc, r) => ({
        temp: acc.temp + r.temp,
        hum: acc.hum + r.hum,
        lux: acc.lux + r.lux,
      }),
      { temp: 0, hum: 0, lux: 0 }
    );
    return {
      temp: (sum.temp / readings.length).toFixed(1),
      hum: (sum.hum / readings.length).toFixed(1),
      lux: (sum.lux / readings.length).toFixed(0),
    };
  }, [readings]);

  const tempStatus =
    averages.temp >= THRESHOLDS.tempMin && averages.temp <= THRESHOLDS.tempMax
      ? "Ideal"
      : averages.temp < THRESHOLDS.tempMin
        ? "Too Cold"
        : "Too Hot";

  const humStatus =
    averages.hum >= THRESHOLDS.humMin && averages.hum <= THRESHOLDS.humMax
      ? "Ideal"
      : averages.hum < THRESHOLDS.humMin
        ? "Too Dry"
        : "Too Humid";

  const luxStatus =
    averages.lux >= THRESHOLDS.luxMin && averages.lux <= THRESHOLDS.luxMax
      ? "Ideal"
      : averages.lux < THRESHOLDS.luxMin
        ? "Low Light"
        : "Direct Sun / Scorching";

  const isLocationIdeal =
    tempStatus === "Ideal" && humStatus === "Ideal" && luxStatus === "Ideal";

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-6">

      <div className="border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <button
            onClick={onBack}
            className="group inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-emerald-700 bg-gray-50 hover:bg-emerald-50/80 border border-gray-200 hover:border-emerald-200 px-3 py-1.5 rounded-lg transition-all mb-3 shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to Dashboard
          </button>
          <h2 className="text-[#1f2937] text-2xl font-extrabold flex items-center gap-2">
            Plant Placement Environmental Analysis
          </h2>
          <p className="text-gray-500 text-sm">
            Read real time micro climate readings to analyse location suitability.
          </p>
        </div>

        {selectedUserId && (
          <button
            onClick={() => setShowAddModuleModal(true)}
            className="px-4 py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 shrink-0"
          >
            <span>Register New Sensor Module</span>
          </button>
        )}
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
        <div className="space-y-1">
          <label className="block text-xs font-bold text-gray-700 uppercase">
            1. Select User
          </label>
          <input
            type="text"
            placeholder="Type to filter users..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none mb-1"
          />
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white rounded-lg border border-gray-300 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">-- Choose User --</option>
            {filteredUsers.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.first_name} {u.last_name} ({u.email})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-bold text-gray-700 uppercase">
            2. Select Sensor Module
          </label>
          <input
            type="text"
            disabled={!selectedUserId}
            placeholder="Type to filter sensor modules"
            value={moduleSearch}
            onChange={(e) => setModuleSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-gray-50 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none mb-1"
          />
          <select
            disabled={!selectedUserId}
            value={selectedModuleId}
            onChange={(e) => {
              setSelectedModuleId(e.target.value);
              setSensorStatus(null);
            }}
            className="w-full px-3 py-2 text-sm bg-white rounded-lg border border-gray-300 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">-- Choose ESP32 Module --</option>
            {filteredModules.map((m) => (
              <option key={m.module_id} value={m.module_id}>
                {m.device_name} (MAC: {m.module_id})
              </option>
            ))}
          </select>
        </div>
      </div>


      {selectedUserId && selectedModuleId && (
        <div className="border border-emerald-200 bg-emerald-50/40 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-gray-800 text-sm">Environment Sensor Module Connection</h4>
            <p className="text-xs text-gray-500">
              Verify Wi-Fi, DHT11 temperature/humidity sensor and BH1750 lux sensor connectivity.
            </p>
          </div>
          <button
            onClick={handleCheckSensorStatus}
            disabled={checkingStatus}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50"
          >
            {checkingStatus ? "Pinging Module..." : "Check Sensor Status"}
          </button>
        </div>
      )}


      {sensorStatus && (
        <div className="p-4 rounded-xl border bg-gray-50 space-y-3">
          <h4 className="text-xs uppercase font-bold tracking-wider text-gray-500">
            Sensor Status Overview
          </h4>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="p-2 rounded-lg bg-white border">
              <span className="text-gray-500 block">ESP32 S3 Link</span>
              <span
                className={`font-extrabold ${sensorStatus.online ? "text-emerald-600" : "text-rose-600"
                  }`}
              >
                {sensorStatus.online ? "🟢 Ready" : "🔴 Not Connected"}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-white border">
              <span className="text-gray-500 block">DHT11 Temp/RH</span>
              <span
                className={`font-extrabold ${sensorStatus.dht11 ? "text-emerald-600" : "text-rose-600"
                  }`}
              >
                {sensorStatus.dht11 ? "🟢 Ready" : "🔴 Not Connected"}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-white border">
              <span className="text-gray-500 block">BH1750 Lux</span>
              <span
                className={`font-extrabold ${sensorStatus.bh1750 ? "text-emerald-600" : "text-rose-600"
                  }`}
              >
                {sensorStatus.bh1750 ? "🟢 Ready" : "🔴 Not Connected"}
              </span>
            </div>
          </div>
        </div>
      )}

      {sensorStatus && sensorStatus.online && (
        <div className="p-5 border border-gray-200 rounded-xl space-y-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                3. Orchid Species for Location Suitability
              </label>
              <select
                value={selectedOrchid}
                onChange={(e) => setSelectedOrchid(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 rounded-lg border border-gray-300 font-bold text-gray-800 focus:outline-none"
              >
                <option value="Dendrobium">Dendrobium Orchid</option>
              </select>
            </div>
            <div className="md:pt-5">
              <button
                onClick={handleStartAnalysis}
                disabled={analyzing}
                className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-2.5 rounded-lg shadow-md transition disabled:opacity-50"
              >
                {analyzing ? `Sampling (${countdown}s remaining)...` : "Analyse Location"}
              </button>
            </div>
          </div>

          {analyzing && (
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 space-y-2">
              <div className="flex justify-between text-sm font-bold text-emerald-800">
                <span>Gathering Environmental Data...</span>
                <span>{countdown}s</span>
              </div>
              <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full transition-all duration-1000"
                  style={{ width: `${((60 - countdown) / 60) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      )}

      {readings.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-bold text-gray-800 text-sm">
            Sensor Reading Records ({readings.length}/3 Collected)
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-100 text-gray-600 uppercase">
                <tr>
                  <th className="px-4 py-2">Reading #</th>
                  <th className="px-4 py-2">Temperature (°C)</th>
                  <th className="px-4 py-2">Humidity (%)</th>
                  <th className="px-4 py-2">Light Intensity (Lux)</th>
                  <th className="px-4 py-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {readings.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-bold">Reading #{r.sampleIndex}</td>
                    <td className="px-4 py-2 font-semibold text-emerald-700">{r.temp} °C</td>
                    <td className="px-4 py-2 font-semibold text-sky-700">{r.hum} %</td>
                    <td className="px-4 py-2 font-semibold text-amber-700">{r.lux} Lux</td>
                    <td className="px-4 py-2 text-gray-400">{r.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analysisCompleted && (
        <div className="border-t pt-6 space-y-6">
          <h3 className="text-lg font-bold text-gray-800">
            Location Suitability for {selectedOrchid} : 
            <span className={`ml-2 ${isLocationIdeal ? "text-emerald-600" : "text-amber-600"}`}>
              {isLocationIdeal ? "Optimal Location" : "Needs Adjustment"}
            </span>
          </h3>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 text-gray-600 uppercase font-bold">
                <tr>
                  <th className="px-4 py-3">Parameter</th>
                  <th className="px-4 py-3">Optimal Range</th>
                  <th className="px-4 py-3">Average Measurement</th>
                  <th className="px-4 py-3">Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                <tr>
                  <td className="px-4 py-3 font-semibold">Temperature</td>
                  <td className="px-4 py-3 text-gray-600">
                    {THRESHOLDS.tempMin}°C – {THRESHOLDS.tempMax}°C
                  </td>
                  <td className="px-4 py-3 font-extrabold text-emerald-700">
                    {averages.temp} °C
                  </td>
                  <td className="px-4 py-3 font-bold">
                    <span
                      className={`px-2 py-1 rounded-md text-[10px] ${tempStatus === "Ideal"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                        }`}
                    >
                      {tempStatus}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold">Relative Humidity</td>
                  <td className="px-4 py-3 text-gray-600">
                    {THRESHOLDS.humMin}% – {THRESHOLDS.humMax}%
                  </td>
                  <td className="px-4 py-3 font-extrabold text-sky-700">
                    {averages.hum} %
                  </td>
                  <td className="px-4 py-3 font-bold">
                    <span
                      className={`px-2 py-1 rounded-md text-[10px] ${humStatus === "Ideal"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                        }`}
                    >
                      {humStatus}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold">Light (Lux)</td>
                  <td className="px-4 py-3 text-gray-600">
                    {THRESHOLDS.luxMin} – {THRESHOLDS.luxMax} Lux
                  </td>
                  <td className="px-4 py-3 font-extrabold text-amber-700">
                    {averages.lux} Lux
                  </td>
                  <td className="px-4 py-3 font-bold">
                    <span
                      className={`px-2 py-1 rounded-md text-[10px] ${luxStatus === "Ideal"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                        }`}
                    >
                      {luxStatus}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModuleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-800">
              Register New Sensor Module
            </h3>
            <p className="text-xs text-gray-500">
              Enter the hardware MAC address of the ESP32 to pair it with{" "}
              <strong>
                {selectedUser?.first_name} {selectedUser?.last_name}
              </strong>
              .
            </p>

            <form onSubmit={handleSaveModule} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Device Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Garden Node 1"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
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
                  placeholder="e.g. 348518abcdef"
                  value={newMacAddress}
                  onChange={(e) => setNewMacAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border font-mono rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModuleModal(false)}
                  className="px-4 py-2 text-xs bg-gray-200 hover:bg-gray-300 font-semibold rounded-lg text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold rounded-lg text-white disabled:opacity-50"
                >
                  {modalSaving ? "Saving..." : "Save Module"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}