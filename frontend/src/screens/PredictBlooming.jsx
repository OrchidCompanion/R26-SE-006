import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Stage color styling and descriptions
const STAGE_CONFIG = {
  Seedling: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    badge: "bg-emerald-600",
    desc: "Early juvenile vegetative growth phase with developing root structure.",
  },
  Vegetative: {
    bg: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-800",
    badge: "bg-teal-600",
    desc: "Active vegetative development of leaves and elongated pseudobulb canes.",
  },
  Mature_Pseudobulb: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    badge: "bg-amber-600",
    desc: "Fully swollen mature pseudobulbs storing carbohydrate reserves for spikes.",
  },
  Bud_formation: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-800",
    badge: "bg-purple-600",
    desc: "Elongated flower spikes with visible swollen floral bud clusters.",
  },
  Flowering: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-800",
    badge: "bg-rose-600",
    desc: "Full floral anthesis with vibrant, fully opened orchid blossoms.",
  },
};

const ANGLE_SLOTS = [
  {
    id: "slot1",
    key: "image1",
    title: "Angle 1: Frontal View",
    tag: "90° Perpendicular",
    requirement: "Full-plant frontal view at eye level, camera positioned perpendicular (90°) to the plant base.",
    icon: "📸",
  },
  {
    id: "slot2",
    key: "image2",
    title: "Angle 2: Lateral Profile 1",
    tag: "Side Angle 1",
    requirement: "First lateral side profile (~120°) capturing pseudobulb canes, leaf junctions, and emerging nodes.",
    icon: "📐",
  },
  {
    id: "slot3",
    key: "image3",
    title: "Angle 3: Lateral Profile 2",
    tag: "Side Angle 2",
    requirement: "Opposite lateral side profile (~240°) displaying canopy density and active spike/bud tips.",
    icon: "🔄",
  },
];

export default function PredictBlooming({ selectedPlant, selectedUser, onBack }) {
  // 3 dedicated angle slots
  const [angleFiles, setAngleFiles] = useState({
    slot1: null,
    slot2: null,
    slot3: null,
  });
  const [anglePreviews, setAnglePreviews] = useState({
    slot1: null,
    slot2: null,
    slot3: null,
  });

  const [telemetryReadings, setTelemetryReadings] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedPlant?.plant_id) {
      fetchPlantEnvironmentTelemetry();
      fetchPlantPredictionHistory();
    }
  }, [selectedPlant]);

  const fetchPlantEnvironmentTelemetry = async () => {
    setLoadingTelemetry(true);
    try {
      const token = localStorage.getItem("admin_token");

      // Fetch DHT11 (Temp/Humidity) and BH1750 (Lux) readings in parallel
      const [dhtRes, bhRes] = await Promise.all([
        fetch(`${API_BASE_URL}/sensors/dht11/plant/${selectedPlant.plant_id}?page=1&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/sensors/bh1750/plant/${selectedPlant.plant_id}?page=1&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const dhtData = dhtRes.ok ? await dhtRes.json() : { data: [] };
      const bhData = bhRes.ok ? await bhRes.json() : { data: [] };

      const dhtList = Array.isArray(dhtData) ? dhtData : dhtData.data || [];
      const bhList = Array.isArray(bhData) ? bhData : bhData.data || [];

      // Filter readings strictly to the last 30 days
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      // Combine environmental readings by index / timestamp alignment
      const combined = dhtList
        .filter((item) => !item.created_at || new Date(item.created_at).getTime() >= thirtyDaysAgo)
        .map((dhtItem, idx) => {
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

  const fetchPlantPredictionHistory = async () => {
    setLoadingHistory(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/bloom/plant/${selectedPlant.plant_id}?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryList(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch prediction history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSlotFileChange = (slotId, e) => {
    const file = e.target.files[0];
    if (!file) return;

    setAngleFiles((prev) => ({ ...prev, [slotId]: file }));
    setAnglePreviews((prev) => ({ ...prev, [slotId]: URL.createObjectURL(file) }));
    setError("");
  };

  const handleRemoveSlotFile = (slotId) => {
    setAngleFiles((prev) => ({ ...prev, [slotId]: null }));
    setAnglePreviews((prev) => ({ ...prev, [slotId]: null }));
  };

  const handleResetScan = () => {
    setAngleFiles({ slot1: null, slot2: null, slot3: null });
    setAnglePreviews({ slot1: null, slot2: null, slot3: null });
    setPredictionResult(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Count uploaded angles
  const uploadedCount = Object.values(angleFiles).filter(Boolean).length;
  const isReadyToPredict = uploadedCount === 3;

  const handleRunPrediction = async () => {
    if (!isReadyToPredict) {
      setError(`All 3 angle photos are strictly required. Currently uploaded: ${uploadedCount}/3.`);
      return;
    }

    setAnalyzing(true);
    setError("");

    try {
      const token = localStorage.getItem("admin_token");
      const formData = new FormData();
      formData.append("plant_id", selectedPlant.plant_id);
      formData.append("image1", angleFiles.slot1);
      formData.append("image2", angleFiles.slot2);
      formData.append("image3", angleFiles.slot3);

      const res = await fetch(`${API_BASE_URL}/bloom/predict`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Bloom prediction analysis failed.");
      }

      setPredictionResult(data);
      // Refresh history list
      fetchPlantPredictionHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-6">
      {/* Top Header */}
      <div className="border-b pb-4">
        <button
          onClick={onBack}
          className="text-xs text-purple-600 hover:underline font-semibold mb-1 cursor-pointer"
        >
          ← Back to Plant Details
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-[#1f2937] text-2xl font-extrabold">
              AI Bloom Prediction — {selectedPlant.plant_name}
            </h2>
            <p className="text-gray-500 text-sm">
              3-Angle Stage Classification (RF-DETR) & Timeline Forecasting (Gradient Boosting) using 30-day ambient telemetry.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {predictionResult && (
              <button
                onClick={handleResetScan}
                className="bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1.5 rounded-lg border border-purple-200 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <span></span>
                <span>Re-scan This Plant</span>
              </button>
            )}
            <span className="bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1.5 rounded-full border border-purple-200">
              Single-Plant 3-Angle Model
            </span>
          </div>
        </div>
      </div>

      {/* Professional Photo-Taking Guidance Banner */}
      <div className="bg-gradient-to-r from-purple-50 via-indigo-50/60 to-purple-50 border border-purple-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📸</span>
            <div>
              <h3 className="text-sm font-extrabold text-purple-950 uppercase tracking-wider">
                Professional Orchid Photography Protocol (Single Plant • 3 Required Angles)
              </h3>
              <p className="text-xs text-purple-800">
                All 3 photos must be captured of this <strong>single orchid plant ({selectedPlant.plant_name})</strong> from 3 angles around it:
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-200 text-purple-900">
            Single Plant • 3 Angles
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white p-3 rounded-xl border border-purple-200/80 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-purple-900">
              <span className="text-sm">📐</span> 90° Camera Angle
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Position the camera <strong>perpendicular (90° from ground)</strong> at eye level facing this plant directly.
            </p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-purple-200/80 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-purple-900">
              <span className="text-sm">🔄</span> 3-Sided Plant Coverage
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Capture <strong>1 frontal view</strong> plus <strong>2 side profiles</strong> (~120° apart) around this same plant to assess all canes and bud nodes.
            </p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-purple-200/80 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-purple-900">
              <span className="text-sm">💡</span> Lighting & Focus
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Ensure <strong>uniform diffused lighting</strong> without harsh backlighting. Keep pseudobulbs, stems, and spike tips in sharp focus.
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Left 3-Angle Upload Slots + Right Telemetry Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 3 Dedicated Angle Upload Slots (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-gray-800 text-sm flex items-center gap-2">
              <span>🖼️</span> Multi-Angle Photo Slots
            </h3>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                isReadyToPredict
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : "bg-amber-100 text-amber-800 border-amber-300"
              }`}
            >
              {isReadyToPredict ? "All 3 Angles Uploaded ✓" : `${uploadedCount} of 3 Angles Uploaded`}
            </span>
          </div>

          {/* 3 Individual Slot Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ANGLE_SLOTS.map((slot) => {
              const preview = anglePreviews[slot.id];
              return (
                <div
                  key={slot.id}
                  className={`relative rounded-xl border-2 transition-all p-3 flex flex-col justify-between min-h-[220px] ${
                    preview
                      ? "border-purple-400 bg-purple-50/20 shadow-xs"
                      : "border-dashed border-gray-300 bg-gray-50/60 hover:border-purple-300 hover:bg-purple-50/10"
                  }`}
                >
                  {/* Slot Header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-gray-900">{slot.title}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                      {slot.tag}
                    </span>
                  </div>

                  {/* Slot Body: Preview or Upload Box */}
                  {preview ? (
                    <div className="relative group rounded-lg overflow-hidden border border-purple-200 bg-white aspect-4/3 my-auto shadow-2xs">
                      <img
                        src={preview}
                        alt={slot.title}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSlotFile(slot.id)}
                        className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow cursor-pointer transition"
                        title="Remove this photo"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="my-auto text-center py-4">
                      <input
                        type="file"
                        id={`slotInput_${slot.id}`}
                        accept="image/*"
                        onChange={(e) => handleSlotFileChange(slot.id, e)}
                        className="hidden"
                      />
                      <label
                        htmlFor={`slotInput_${slot.id}`}
                        className="cursor-pointer flex flex-col items-center justify-center space-y-1.5"
                      >
                        <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-lg shadow-2xs group-hover:scale-105 transition">
                          {slot.icon}
                        </div>
                        <span className="text-xs font-bold text-purple-900">Upload Photo</span>
                        <span className="text-[10px] text-gray-500 px-1">{slot.requirement}</span>
                      </label>
                    </div>
                  )}

                  {/* Slot Footer Status */}
                  <div className="mt-2 pt-2 border-t border-gray-200/80 flex items-center justify-between text-[10px]">
                    <span className="text-gray-500 font-medium">Status:</span>
                    {preview ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <span>●</span> Ready
                      </span>
                    ) : (
                      <span className="text-amber-600 font-bold flex items-center gap-1">
                        <span>○</span> Required
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className={`p-4 rounded-xl border text-xs font-medium space-y-2.5 ${
              error.toLowerCase().includes("non-orchid")
                ? "bg-amber-50 text-amber-900 border-amber-300 shadow-xs"
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}>
              <div className="flex items-start gap-2.5">
                <span className="text-xl shrink-0">
                  {error.toLowerCase().includes("non-orchid") ? "⚠️" : "❌"}
                </span>
                <div className="space-y-1">
                  <span className="font-extrabold text-sm block">
                    {error.toLowerCase().includes("non-orchid") ? "Non-Orchid Image Detected" : "Prediction Error"}
                  </span>
                  <p className="leading-relaxed">{error}</p>
                </div>
              </div>
              {error.toLowerCase().includes("non-orchid") && (
                <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between">
                  <span className="text-[11px] text-amber-800 font-semibold">
                    Please upload clear photos of your Dendrobium orchid.
                  </span>
                  <button
                    type="button"
                    onClick={handleResetScan}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition shadow-2xs cursor-pointer flex items-center gap-1"
                  >
                    <span>🔄</span>
                    <span>Re-upload Photos</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleRunPrediction}
            disabled={analyzing || !isReadyToPredict}
            className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white font-extrabold py-3.5 rounded-xl transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-sm"
          >
            {analyzing ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Running 3-Angle Stage Detection & Timeline Forecast...</span>
              </>
            ) : (
              <span>🌸 {isReadyToPredict ? "Run AI Bloom Prediction (3 Angles Ready)" : `Upload 3 Angles to Run Prediction (${uploadedCount}/3)`}</span>
            )}
          </button>
        </div>

        {/* Right Column: Environmental Telemetry Table (5 Cols) */}
        <div className="lg:col-span-5 border border-gray-200 rounded-xl p-4 bg-gray-50/50 flex flex-col h-[380px]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-800 text-sm">
              Plant Telemetry (Last 30 Days)
            </h3>
            <span className="text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md font-semibold">
              30-Day Live Window
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Synchronized DHT11 (Temp/RH) and BH1750 (Lux) readings from the past 30 days fed into Model 02.
          </p>

          {loadingTelemetry ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
              Loading ambient telemetry...
            </div>
          ) : telemetryReadings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-xs text-gray-400 p-4 text-center">
              <span>No telemetry logs found in the last 30 days.</span>
              <span className="text-[11px] text-gray-400 mt-1">
                Standard climate baseline will be applied automatically.
              </span>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 rounded-lg border border-gray-200 bg-white shadow-2xs">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-100 text-gray-600 uppercase sticky top-0 font-bold text-[10px]">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Temp (°C)</th>
                    <th className="px-3 py-2">Humidity (%)</th>
                    <th className="px-3 py-2">Light (Lux)</th>
                    <th className="px-3 py-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {telemetryReadings.map((r, i) => (
                    <tr key={i} className="hover:bg-purple-50/30">
                      <td className="px-3 py-1.5 text-gray-400 font-sans">{i + 1}</td>
                      <td className="px-3 py-1.5 font-bold text-rose-600">{r.temperature} °C</td>
                      <td className="px-3 py-1.5 font-bold text-sky-600">{r.humidity} %</td>
                      <td className="px-3 py-1.5 font-bold text-amber-600">{r.lux} Lux</td>
                      <td className="px-3 py-1.5 text-gray-500 font-sans text-[11px]">
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

      {/* Comprehensive Prediction Output Section */}
      {predictionResult && (
        <div className="border-t border-gray-200 pt-6 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
              <span>🌿</span> AI Bloom Analysis & Timeline Forecast
            </h3>
            <button
              onClick={handleResetScan}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>🔄</span>
              <span>Re-scan This Plant</span>
            </button>
          </div>

          {/* Hero Forecast Banner */}
          <div className="p-6 rounded-2xl text-white shadow-lg bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center md:text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
                Estimated Flowering Schedule
              </span>
              <h4 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {predictionResult.prediction_msg || `Estimated Bloom in ${predictionResult.weeks} Weeks`}
              </h4>
              <p className="text-xs text-purple-100 font-medium">
                Target Bloom Window: <strong>{predictionResult.flowering_date_range_display || predictionResult.estimated_flowering_date}</strong>
              </p>
            </div>
            <div className="bg-white/15 backdrop-blur-md px-5 py-3 rounded-xl border border-white/20 text-center shrink-0">
              <span className="text-[11px] uppercase tracking-wider block font-bold text-purple-100">
                Total Duration
              </span>
              <span className="text-2xl sm:text-3xl font-black text-white">
                {predictionResult.total_days_range ? `${predictionResult.total_days_range}` : `${Math.max(0, (predictionResult.display_total_days || 0) - 5)}–${(predictionResult.display_total_days || 0) + 5}`}
              </span>
              <span className="text-xs text-purple-200 block">days to bloom</span>
            </div>
          </div>

          {/* 2-Column Grid: Stage Detection + Conditions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Box: Stage Identification Summary */}
            <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-sm text-gray-800">
                  Detected Blooming Stage
                </h4>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold text-white ${STAGE_CONFIG[predictionResult.current_stage]?.badge || "bg-purple-600"}`}>
                  {predictionResult.current_stage}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold text-gray-700">
                  <span>Confidence Level</span>
                  <span className="text-purple-700 text-sm font-extrabold">{predictionResult.confidence}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-indigo-600 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${predictionResult.confidence}%` }}
                  ></div>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                {STAGE_CONFIG[predictionResult.current_stage]?.desc || "Stage identified through 3-angle computer vision inference."}
              </p>

              {/* Exact 3-Angle Prediction Breakdown */}
              {predictionResult.image_predictions && predictionResult.image_predictions.length > 0 && (
                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                    Multi-Angle Voting Breakdown ({predictionResult.image_predictions.length} Angles):
                  </span>
                  <div className="space-y-2">
                    {predictionResult.image_predictions.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-gray-200 shadow-2xs">
                        <div>
                          <span className="font-bold text-gray-800 block">
                            {p.angle_label || `Angle ${p.image_index}`}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">{p.filename}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-purple-900 block">{p.stage}</span>
                          <span className="text-[11px] text-gray-500 font-mono font-semibold">
                            {Math.round(p.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Box: Standard Dendrobium Targets & Stage Cultural Care */}
            <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/50 space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-gray-800">
                  Target Environmental Conditions (Dendrobium)
                </h4>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 border border-rose-200 rounded-xl bg-rose-50/60 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">Target Temp</span>
                  <span className="font-black text-rose-900 text-sm">
                    25–30 °C
                  </span>
                </div>
                <div className="p-2.5 border border-sky-200 rounded-xl bg-sky-50/60 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 block">Target RH</span>
                  <span className="font-black text-sky-900 text-sm">
                    70–75 %
                  </span>
                </div>
                <div className="p-2.5 border border-amber-200 rounded-xl bg-amber-50/60 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">Target Light</span>
                  <span className="font-black text-amber-900 text-sm">
                    16k–32k Lux
                  </span>
                </div>
              </div>

              {/* 30-Day Recorded Sensor Telemetry Summary */}
              {predictionResult.sensor_summary && (
                <div className="pt-3 border-t border-gray-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                      <span>📊</span> Measured 30-Day Historical Data ({predictionResult.sensor_summary.data_window_days || 30} Days)
                    </span>
                    {predictionResult.sensor_summary.telemetry_samples_count > 0 && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {predictionResult.sensor_summary.telemetry_samples_count} Sensor Readings
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 border border-rose-100 rounded-xl bg-white shadow-2xs space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">30d Avg Temp</span>
                      <span className="text-sm font-black text-rose-600">
                        {predictionResult.sensor_summary.avg_temp_c} °C
                      </span>
                      <span className="text-[9px] text-gray-400 block">
                        ({predictionResult.sensor_summary.min_temp_c}° – {predictionResult.sensor_summary.max_temp_c}°)
                      </span>
                    </div>

                    <div className="p-2.5 border border-sky-100 rounded-xl bg-white shadow-2xs space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">30d Avg RH</span>
                      <span className="text-sm font-black text-sky-600">
                        {predictionResult.sensor_summary.avg_humidity_rh} %
                      </span>
                      <span className="text-[9px] text-gray-400 block">
                        ({predictionResult.sensor_summary.min_humidity_rh}% – {predictionResult.sensor_summary.max_humidity_rh}%)
                      </span>
                    </div>

                    <div className="p-2.5 border border-amber-100 rounded-xl bg-white shadow-2xs space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">30d Avg Light</span>
                      <span className="text-sm font-black text-amber-600">
                        {Number(predictionResult.sensor_summary.avg_light_lux).toLocaleString()} Lux
                      </span>
                      <span className="text-[9px] text-gray-400 block">
                        ({Number(predictionResult.sensor_summary.min_light_lux).toLocaleString()} – {Number(predictionResult.sensor_summary.max_light_lux).toLocaleString()})
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recommended Environmental & Placement Advice */}
          {predictionResult.environment_evaluation && (
            <div className="p-5 border border-purple-200 rounded-2xl bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/40 space-y-4 shadow-xs">
              <div className="border-b border-purple-100 pb-3">
                <h4 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                  <span>🌿</span> Recommended Environmental & Placement Advice
                </h4>
                <p className="text-xs text-gray-600 mt-1">
                  Optimal environmental parameters for Dendrobium orchids (25–30°C, 70–75% RH, and 16,000–32,000 Lux).
                </p>
              </div>

              {/* 3 Telemetry Status Indicator Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Temperature Card */}
                {(() => {
                  const temp = predictionResult.environment_evaluation.temperature;
                  const isOptimal = temp.status === "optimal";
                  const badgeClass = isOptimal
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : temp.status === "low"
                    ? "bg-sky-100 text-sky-800 border-sky-300"
                    : "bg-rose-100 text-rose-800 border-rose-300";

                  return (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                          <span>🌡️</span> Temperature
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                          {temp.status_label}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">30-Day Measured Avg</span>
                          <span className="text-lg font-black text-rose-600">{temp.value} °C</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">Target Range</span>
                          <span className="text-xs font-extrabold text-gray-700">{temp.target}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Humidity Card */}
                {(() => {
                  const hum = predictionResult.environment_evaluation.humidity;
                  const isOptimal = hum.status === "optimal";
                  const badgeClass = isOptimal
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : hum.status === "low"
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "bg-sky-100 text-sky-800 border-sky-300";

                  return (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                          <span>💧</span> Humidity (RH)
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                          {hum.status_label}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">30-Day Measured Avg</span>
                          <span className="text-lg font-black text-sky-600">{hum.value} %</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">Target Range</span>
                          <span className="text-xs font-extrabold text-gray-700">{hum.target}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Light Card */}
                {(() => {
                  const light = predictionResult.environment_evaluation.light;
                  const isOptimal = light.status === "optimal";
                  const badgeClass = isOptimal
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : light.status === "low"
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "bg-rose-100 text-rose-800 border-rose-300";

                  return (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                          <span>☀️</span> Light Intensity
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                          {light.status_label}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">30-Day Measured Avg</span>
                          <span className="text-lg font-black text-amber-600">{Number(light.value).toLocaleString()} Lux</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">Target Range</span>
                          <span className="text-xs font-extrabold text-gray-700">{light.target}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ONE Single Dedicated Recommendation Box (Exact 3-Variable Synthesis) */}
              <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white p-5 rounded-2xl shadow-sm border border-purple-800 space-y-2">
                <div className="border-b border-purple-800/80 pb-2.5">
                  <h5 className="font-extrabold text-sm text-purple-100 flex items-center gap-2">
                    <span className="text-base">🌿</span>
                    <span>Environmental & Placement Advice</span>
                  </h5>
                </div>
                <p className="text-sm text-purple-100 leading-relaxed font-medium pt-1 flex items-start gap-2.5">
                  <span className="text-emerald-400 font-black text-base leading-none mt-0.5">✓</span>
                  <span>{predictionResult.environment_evaluation.recommendation}</span>
                </p>
              </div>
            </div>
          )}

          {/* Interactive Multi-Step Timeline Progression */}
          {predictionResult.timeline && predictionResult.timeline.length > 0 && (
            <div className="p-5 border border-gray-200 rounded-xl bg-white space-y-4 shadow-xs">
              <h4 className="font-extrabold text-sm text-gray-800 flex items-center gap-2">
                <span>⏱️</span> Bloom Progression Stage Timeline
              </h4>
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-purple-200">
                {predictionResult.timeline.map((step, idx) => (
                  <div key={idx} className="relative flex flex-col sm:flex-row sm:items-center justify-between bg-purple-50/40 p-3.5 rounded-xl border border-purple-200/80 gap-2">
                    <span className="absolute -left-[29px] top-4 w-4 h-4 rounded-full bg-purple-600 border-2 border-white shadow"></span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-gray-900">
                          {step.from_stage} → <strong className="text-purple-700">{step.to_stage}</strong>
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-500">
                        Expected Transition Window: <strong>{step.transition_window || step.estimated_date}</strong>
                      </span>
                    </div>
                    <div className="text-right sm:self-center">
                      <span className="text-xs font-black text-purple-900 bg-purple-200/70 px-2.5 py-1 rounded-lg">
                        {step.transition_days_range || `+${step.transition_days} Days`}
                      </span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        (Cumulative: {step.cumulative_days_range || `${step.cumulative_days}d`})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Scan Again CTA */}
          <div className="text-center pt-2">
            <button
              onClick={handleResetScan}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <span>🔄</span>
              <span>Re-scan This Plant (New Photos)</span>
            </button>
          </div>
        </div>
      )}

      {/* Historical Predictions List */}
      <div className="border-t border-gray-200 pt-6 space-y-4">
        <h3 className="text-base font-extrabold text-gray-800">
          Prediction History for {selectedPlant.plant_name}
        </h3>

        {loadingHistory ? (
          <p className="text-xs text-gray-400">Loading prediction logs...</p>
        ) : historyList.length === 0 ? (
          <p className="text-xs text-gray-400">No previous bloom prediction logs recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-100 text-gray-600 uppercase font-bold text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Estimated Duration</th>
                  <th className="px-4 py-2.5">Record Timestamp</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyList.map((item, idx) => (
                  <tr key={idx} className="hover:bg-purple-50/20">
                    <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-2 font-bold text-purple-900">
                      {item.weeks} Weeks
                    </td>
                    <td className="px-4 py-2 text-gray-500 font-mono">
                      {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                        Logged
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}