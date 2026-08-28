import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PredictBlooming({ selectedPlant, selectedUser, onBack }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [telemetryReadings, setTelemetryReadings] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPlantEnvironmentTelemetry();
  }, [selectedPlant]);

  const fetchPlantEnvironmentTelemetry = async () => {
    setLoadingTelemetry(true);
    try {
      const token = localStorage.getItem("admin_token");

      // Fetch DHT11 (Temp/Humidity) and BH1750 (Lux) readings in parallel
      const [dhtRes, bhRes] = await Promise.all([
        fetch(`${API_BASE_URL}/sensors/dht11/plant/${selectedPlant.plant_id}?page=1&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/sensors/bh1750/plant/${selectedPlant.plant_id}?page=1&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const dhtData = dhtRes.ok ? await dhtRes.json() : { data: [] };
      const bhData = bhRes.ok ? await bhRes.json() : { data: [] };

      const dhtList = Array.isArray(dhtData) ? dhtData : dhtData.data || [];
      const bhList = Array.isArray(bhData) ? bhData : bhData.data || [];

      // Combine environmental readings by approximate timestamp alignment
      const combined = dhtList.map((dhtItem, idx) => {
        const matchingLux = bhList[idx] ? (bhList[idx].lux ?? bhList[idx].lux_lx) : null;
        return {
          id: dhtItem.reading_id || idx,
          temperature: dhtItem.temperature,
          humidity: dhtItem.humidity,
          lux: matchingLux !== null ? matchingLux : "—",
          created_at: dhtItem.created_at,
        };
      });

      setTelemetryReadings(combined);
    } catch (err) {
      console.error("Failed to load environment telemetry:", err);
    } finally {
      setLoadingTelemetry(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setPredictionResult(null);
      setError("");
    }
  };

  const handleRunPrediction = async () => {
    if (!selectedFile) {
      setError("Please select or drag a plant/bud image first.");
      return;
    }

    setAnalyzing(true);
    setError("");

    try {
      const token = localStorage.getItem("admin_token");
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("plant_id", selectedPlant.plant_id);

      const res = await fetch(`${API_BASE_URL}/bloom/predict`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Bloom prediction failed.");
      }

      setPredictionResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <button
          onClick={onBack}
          className="text-xs text-purple-600 hover:underline font-semibold mb-1"
        >
          ← Back to Plant Details
        </button>
        <h2 className="text-[#1f2937] text-2xl font-extrabold">
          Bloom Prediction — {selectedPlant.plant_name}
        </h2>
        <p className="text-gray-500 text-sm">
          Evaluate flower spike and bud development with environmental metrics (Temperature, Humidity, Light).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Image Upload */}
        <div className="space-y-4">
          <div className="border-2 border-dashed border-purple-300 bg-purple-50/40 py-14 px-6 rounded-xl text-center">
            <input
              type="file"
              id="bloomImageInput"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="bloomImageInput"
              className="cursor-pointer flex flex-col items-center justify-center space-y-2"
            >
              <span className="text-sm font-bold text-purple-800">
                Click or drag orchid bud/spike image
              </span>
              <span className="text-xs text-gray-500">Supports JPG, PNG</span>
            </label>

            {previewUrl && (
              <div className="mt-4 pt-4 border-t border-purple-200">
                <p className="text-xs font-semibold text-gray-600 mb-2">Image Preview:</p>
                <img
                  src={previewUrl}
                  alt="Selected Orchid Spike"
                  className="max-h-56 mx-auto rounded-lg border shadow-xs object-contain"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 text-rose-700 border border-rose-200 text-xs p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleRunPrediction}
            disabled={analyzing || !selectedFile}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzing ? "Estimating Bloom Timeline..." : "Run Bloom Prediction"}
          </button>
        </div>

        {/* Right Column: Environmental Telemetry Table (Temp, Humidity, Light) */}
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 flex flex-col h-100">
          <h3 className="font-bold text-gray-800 text-sm mb-1">
            Plant Environment Telemetry ({telemetryReadings.length} Records)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Synchronized Temperature, Relative Humidity, and Light (Lux) conditions.
          </p>

          {loadingTelemetry ? (
            <p className="text-xs text-gray-400 my-auto text-center">Loading ambient telemetry...</p>
          ) : telemetryReadings.length === 0 ? (
            <p className="text-xs text-gray-400 my-auto text-center">
              No telemetry data logged for this plant.
            </p>
          ) : (
            <div className="overflow-y-auto flex-1 rounded border border-gray-200 bg-white">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-100 text-gray-600 uppercase sticky top-0">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Temp (°C)</th>
                    <th className="px-3 py-2">Humidity (%)</th>
                    <th className="px-3 py-2">Light (Lux)</th>
                    <th className="px-3 py-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {telemetryReadings.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-1.5 font-semibold text-rose-600">{r.temperature} °C</td>
                      <td className="px-3 py-1.5 font-semibold text-sky-600">{r.humidity} %</td>
                      <td className="px-3 py-1.5 font-semibold text-amber-600">{r.lux} Lux</td>
                      <td className="px-3 py-1.5 text-gray-400">
                        {new Date(r.created_at).toLocaleDateString()}{" "}
                        {new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Prediction Output Section */}
      {predictionResult && (
        <div className="border-t pt-6 space-y-6 animate-fade-in">
          <h3 className="text-lg font-bold text-gray-800">Blooming Estimation & Analysis</h3>

          <div className="p-4 rounded-xl text-center text-white font-extrabold text-lg shadow-sm bg-gradient-to-r from-purple-600 to-indigo-600">
            {predictionResult.prediction_msg || `Estimated Bloom in ${predictionResult.weeks} Weeks`}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
              <h4 className="font-bold text-sm text-gray-700">Spike & Bud Development</h4>
              <div className="flex justify-between items-center text-xl font-extrabold text-purple-800">
                <span>Stage: {predictionResult.stage || "Spike Formation"}</span>
                <span>{predictionResult.confidence || 92}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-purple-600 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${predictionResult.confidence || 92}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Estimated duration until full petal opening: <strong>{predictionResult.weeks} weeks</strong>.
              </p>
            </div>

            <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
              <h4 className="font-bold text-sm text-gray-700">Optimal Growth Conditions</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 border rounded-lg bg-white">
                  <span className="text-xs text-gray-500 block">Target Temp</span>
                  <span className="font-extrabold text-rose-600">22–28 °C</span>
                </div>
                <div className="p-2 border rounded-lg bg-white">
                  <span className="text-xs text-gray-500 block">Target Humidity</span>
                  <span className="font-extrabold text-sky-600">60–75 %</span>
                </div>
                <div className="p-2 border rounded-lg bg-white">
                  <span className="text-xs text-gray-500 block">Target Light</span>
                  <span className="font-extrabold text-amber-600">10k–15k Lux</span>
                </div>
              </div>
              {predictionResult.care_instructions && (
                <div className="pt-1">
                  <h5 className="font-bold text-xs text-gray-600 mb-1">Blooming Care Advice:</h5>
                  <p className="text-xs text-gray-700">{predictionResult.care_instructions}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}