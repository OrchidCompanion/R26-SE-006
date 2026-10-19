import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Orchid growth stage visual styles and descriptions
const STAGE_CONFIG = {
  Seedling: {
    label: "Seedling",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    badge: "bg-emerald-600",
    desc: "Your young orchid is establishing roots and growing its first small leaves.",
  },
  Vegetative: {
    label: "Vegetative",
    bg: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-800",
    badge: "bg-teal-600",
    desc: "Your orchid is actively growing new green leaves and stronger, taller stems.",
  },
  Mature_Pseudobulb: {
    label: "Mature_Pseudobulb",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    badge: "bg-amber-600",
    desc: "Stems and bulbs are plump and fully grown, storing energy to produce flower spikes.",
  },
  Bud_formation: {
    label: "Bud_formation",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-800",
    badge: "bg-purple-600",
    desc: "Flower spikes have emerged and bud clusters are swelling and preparing to bloom.",
  },
  Flowering: {
    label: "Flowering",
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-800",
    badge: "bg-rose-600",
    desc: "Your orchid is in full bloom with open, vibrant flowers.",
  },
  Invalid: {
    label: "Invalid",
    bg: "bg-rose-50",
    border: "border-rose-300",
    text: "text-rose-800",
    badge: "bg-rose-600",
    desc: "We couldn't clearly see an orchid in this picture. Please upload a clear photo of your plant.",
  },
  "Non-Orchid": {
    label: "Non-Orchid",
    bg: "bg-rose-50",
    border: "border-rose-300",
    text: "text-rose-800",
    badge: "bg-rose-600",
    desc: "Plant leaves or flowers were not detected. Please upload genuine orchid photos.",
  },
};

const ANGLE_SLOTS = [
  {
    id: "slot1",
    key: "image1",
    title: "Photo 1: Front View",
    tag: "Front View",
    requirement: "Face the plant directly at eye level so the whole plant is clearly visible.",
    icon: "📸",
  },
  {
    id: "slot2",
    key: "image2",
    title: "Photo 2: Side View 1",
    tag: "Left Side View",
    requirement: "Turn slightly to the side to capture stems, leaf joints, and nodes.",
    icon: "📐",
  },
  {
    id: "slot3",
    key: "image3",
    title: "Photo 3: Side View 2",
    tag: "Right Side View",
    requirement: "Take from the opposite side in clear light to show bud tips and upper leaves.",
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
  const [invalidSlots, setInvalidSlots] = useState({
    slot1: false,
    slot2: false,
    slot3: false,
  });
  const [invalidAngleInfo, setInvalidAngleInfo] = useState([]);

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
    setInvalidSlots((prev) => ({ ...prev, [slotId]: false }));
    setError("");
  };

  const handleRemoveSlotFile = (slotId) => {
    setAngleFiles((prev) => ({ ...prev, [slotId]: null }));
    setAnglePreviews((prev) => ({ ...prev, [slotId]: null }));
    setInvalidSlots((prev) => ({ ...prev, [slotId]: false }));
  };

  const handleResetScan = () => {
    setAngleFiles({ slot1: null, slot2: null, slot3: null });
    setAnglePreviews({ slot1: null, slot2: null, slot3: null });
    setInvalidSlots({ slot1: false, slot2: false, slot3: false });
    setInvalidAngleInfo([]);
    setPredictionResult(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Count uploaded angles
  const uploadedCount = Object.values(angleFiles).filter(Boolean).length;
  const isReadyToPredict = uploadedCount === 3;

  const handleRunPrediction = async () => {
    if (!isReadyToPredict) {
      setError(`Please upload all 3 photos to begin. Currently uploaded: ${uploadedCount} of 3.`);
      return;
    }

    setAnalyzing(true);
    setError("");
    setInvalidSlots({ slot1: false, slot2: false, slot3: false });
    setInvalidAngleInfo([]);

    try {
      const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || localStorage.getItem("access_token");
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
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        const errDetail = data.detail || "Bloom prediction analysis failed. Please try again.";

        // Parse if non-orchid / "Invalid" detected in specific angles
        const isNonOrchid =
          errDetail.toLowerCase().includes("non-orchid") ||
          errDetail.toLowerCase().includes("not an orchid") ||
          errDetail.toLowerCase().includes("invalid");

        if (isNonOrchid) {
          const newInvalidSlots = { slot1: false, slot2: false, slot3: false };
          const details = [];

          const hasAngle1 = /angle\s*1/i.test(errDetail) || /frontal/i.test(errDetail);
          const hasAngle2 = /angle\s*2/i.test(errDetail) || /lateral profile 1/i.test(errDetail);
          const hasAngle3 = /angle\s*3/i.test(errDetail) || /lateral profile 2/i.test(errDetail);

          if (hasAngle1) {
            newInvalidSlots.slot1 = true;
            details.push("Photo 1 (Front View)");
          }
          if (hasAngle2) {
            newInvalidSlots.slot2 = true;
            details.push("Photo 2 (Side View 1)");
          }
          if (hasAngle3) {
            newInvalidSlots.slot3 = true;
            details.push("Photo 3 (Side View 2)");
          }

          if (!hasAngle1 && !hasAngle2 && !hasAngle3) {
            newInvalidSlots.slot1 = true;
            newInvalidSlots.slot2 = true;
            newInvalidSlots.slot3 = true;
            details.push("Uploaded Photos");
          }

          setInvalidSlots(newInvalidSlots);
          setInvalidAngleInfo(details);
        }

        throw new Error(errDetail);
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
          className="text-xs text-purple-600 hover:underline font-semibold mb-1 cursor-pointer flex items-center gap-1"
        >
          <span>←</span> Back to Plant Details
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-[#1f2937] text-2xl font-extrabold flex items-center gap-2">
              <span></span> {selectedPlant.plant_name}'s Bloom Prediction
            </h2>
            <p className="text-gray-500 text-sm">
              Discover your orchid's current growth stage and expected blooming timeline based on photos and climate conditions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {predictionResult && (
              <button
                onClick={handleResetScan}
                className="bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1.5 rounded-lg border border-purple-200 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <span>🔄</span>
                <span>Scan Another Plant</span>
              </button>
            )}
            <span className="bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1.5 rounded-full border border-purple-200">
              3 Angle Photo Scan
            </span>
          </div>
        </div>
      </div>

      {/* Photography Guide Card */}
      <div className="bg-gradient-to-r from-purple-50 via-indigo-50/60 to-purple-50 border border-purple-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📸</span>
            <div>
              <h3 className="text-sm font-extrabold text-purple-950 uppercase tracking-wider">
                Photo Tips for Accurate Prediction
              </h3>
              <p className="text-xs text-purple-800">
                Take 3 clear photos around your plant so the AI can inspect all stems, leaves, and buds:
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-200 text-purple-900">
            3 Angles
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-purple-200/80 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-purple-900">
              <span className="text-sm">📐</span> 1. Front View
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Hold the camera at <strong>eye level facing the plant directly</strong> to show the whole stem and leaves.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-purple-200/80 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-purple-900">
              <span className="text-sm">🔄</span> 2. Left Side View
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Step slightly to the side to capture <strong>stem thickness, leaf joints, and emerging nodes</strong>.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-purple-200/80 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-purple-900">
              <span className="text-sm">💡</span> 3. Right Side View
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Step to the opposite side in <strong>clear, bright lighting</strong> to check bud tips and upper leaves.
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Photo Upload Slots + Telemetry Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 3 Photo Upload Slots (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-gray-800 text-sm flex items-center gap-2">
              <span>🖼️</span> Step 1: Upload Photos
            </h3>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full border ${isReadyToPredict
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : "bg-amber-100 text-amber-800 border-amber-300"
                }`}
            >
              {isReadyToPredict ? "All 3 Photos Ready" : `${uploadedCount} of 3 Photos Added`}
            </span>
          </div>

          {/* 3 Individual Slot Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ANGLE_SLOTS.map((slot) => {
              const preview = anglePreviews[slot.id];
              const isSlotInvalid = invalidSlots[slot.id];

              return (
                <div
                  key={slot.id}
                  className={`relative rounded-xl border-2 transition-all p-3 flex flex-col justify-between min-h-[220px] ${isSlotInvalid
                    ? "border-rose-500 bg-rose-50/50 shadow-md ring-2 ring-rose-300/50"
                    : preview
                      ? "border-purple-400 bg-purple-50/20 shadow-xs"
                      : "border-dashed border-gray-300 bg-gray-50/60 hover:border-purple-300 hover:bg-purple-50/10"
                    }`}
                >
                  {/* Slot Header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-gray-900">{slot.title}</span>
                    {isSlotInvalid ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                        ⚠️ Retake Needed
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                        {slot.tag}
                      </span>
                    )}
                  </div>

                  {/* Slot Body: Preview or Upload Box */}
                  {preview ? (
                    <div className="space-y-2 my-auto">
                      <div className="relative group rounded-lg overflow-hidden border border-purple-200 bg-white aspect-4/3 shadow-2xs">
                        <img
                          src={preview}
                          alt={slot.title}
                          className="w-full h-full object-cover"
                        />
                        {isSlotInvalid && (
                          <div className="absolute top-1.5 left-1.5 bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">
                            Needs Retake
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveSlotFile(slot.id)}
                          className="absolute top-1.5 right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow cursor-pointer transition"
                          title="Remove this photo"
                        >
                          ✕
                        </button>
                      </div>

                      {isSlotInvalid && (
                        <div>
                          <input
                            type="file"
                            id={`slotInput_${slot.id}`}
                            accept="image/*"
                            onChange={(e) => handleSlotFileChange(slot.id, e)}
                            className="hidden"
                          />
                          <label
                            htmlFor={`slotInput_${slot.id}`}
                            className="block w-full text-center bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold py-1 px-2 rounded-lg cursor-pointer transition shadow-2xs"
                          >
                            Replace Photo
                          </label>
                        </div>
                      )}
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
                        <span className="text-xs font-bold text-purple-900">Choose Photo</span>
                        <span className="text-[10px] text-gray-500 px-1 leading-snug">{slot.requirement}</span>
                      </label>
                    </div>
                  )}

                  {/* Slot Footer Status */}
                  <div className="mt-2 pt-2 border-t border-gray-200/80 flex items-center justify-between text-[10px]">
                    <span className="text-gray-500 font-medium">Status:</span>
                    {isSlotInvalid ? (
                      <span className="text-rose-600 font-bold flex items-center gap-1">
                        <span>⚠️</span> Needs Retake
                      </span>
                    ) : preview ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <span>●</span> Ready
                      </span>
                    ) : (
                      <span className="text-amber-600 font-bold flex items-center gap-1">
                        <span>○</span> Photo Needed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div
              className={`p-4 rounded-xl border text-xs font-medium space-y-3 ${error.toLowerCase().includes("non-orchid") || error.toLowerCase().includes("invalid") || error.toLowerCase().includes("not an orchid")
                ? "bg-rose-50/90 text-rose-950 border-rose-300 shadow-sm"
                : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-2xl shrink-0">
                  {error.toLowerCase().includes("non-orchid") || error.toLowerCase().includes("invalid") || error.toLowerCase().includes("not an orchid") ? "🌿" : "ℹ️"}
                </span>
                <div className="space-y-1 flex-1">
                  <span className="font-extrabold text-sm block text-rose-900">
                    {error.toLowerCase().includes("non-orchid") || error.toLowerCase().includes("invalid") || error.toLowerCase().includes("not an orchid")
                      ? "Photo Needs Attention"
                      : "Notice"}
                  </span>
                  <p className="leading-relaxed text-rose-800">{error}</p>
                  {(error.toLowerCase().includes("non-orchid") || error.toLowerCase().includes("invalid") || error.toLowerCase().includes("not an orchid")) && (
                    <div className="mt-2 p-2.5 bg-white/90 rounded-lg border border-rose-200 text-[11px] text-rose-950 space-y-1">
                      <p className="font-bold flex items-center gap-1 text-rose-900">
                        <span>💡</span> <strong>Helpful Tip:</strong>
                      </p>
                      <p className="text-gray-700">
                        Our model could not clearly see orchid stems, leaves, or flower buds in this photo. Please make sure the plant is centered, well-lit, and in focus.
                      </p>
                      {invalidAngleInfo.length > 0 && (
                        <p className="font-semibold text-rose-800 pt-1">
                          Photos to replace: <span className="font-bold underline">{invalidAngleInfo.join(", ")}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-rose-200/80 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-rose-800 font-medium">
                  Please replace the marked photo(s) to continue with the prediction.
                </span>
                <button
                  type="button"
                  onClick={handleResetScan}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>🔄</span>
                  <span>Reset All Photos</span>
                </button>
              </div>
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
                <span>Checking Photos & Estimating Bloom Schedule...</span>
              </>
            ) : (
              <span> {isReadyToPredict ? "Predict Blooming Schedule" : `Add All 3 Photos to Predict (${uploadedCount}/3)`}</span>
            )}
          </button>
        </div>

        {/* Right Column: Environmental Telemetry Table (5 Cols) */}
        <div className="lg:col-span-5 border border-gray-200 rounded-xl p-4 bg-gray-50/50 flex flex-col h-[380px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
              <span>📊</span> Climate Readings (Last 30 Days)
            </h3>
            <span className="text-[11px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md font-semibold">
              30-Day Window
            </span>
          </div>

          {loadingTelemetry ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
              Loading recent sensor readings...
            </div>
          ) : telemetryReadings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-xs text-gray-400 p-4 text-center">
              <span className="text-gray-500 font-semibold mb-1">No sensor readings recorded yet</span>
              <span className="text-[11px] text-gray-400 leading-relaxed max-w-xs">
                Connect your temperature, humidity, and light sensors to track your orchid's daily growing environment.
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
                    <th className="px-3 py-2">Date & Time</th>
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
              <span>🌿</span> Bloom Analysis & Timeline Forecast
            </h3>
            <button
              onClick={handleResetScan}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>🔄</span>
              <span>Scan Again with New Photos</span>
            </button>
          </div>

          {/* Hero Forecast Banner */}
          <div className="p-6 rounded-2xl text-white shadow-lg bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center md:text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
                Estimated Blooming Schedule
              </span>
              <h4 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {predictionResult.prediction_msg || (predictionResult.weeks === 0 ? "Your orchid is currently in full bloom!" : `Estimated to bloom in ~${predictionResult.weeks} Weeks`)}
              </h4>
              <p className="text-xs text-purple-100 font-medium">
                Estimated Bloom Window: <strong>{predictionResult.flowering_date_range_display || predictionResult.estimated_flowering_date}</strong>
              </p>
            </div>
            <div className="bg-white/15 backdrop-blur-md px-5 py-3 rounded-xl border border-white/20 text-center shrink-0">
              <span className="text-[11px] uppercase tracking-wider block font-bold text-purple-100">
                Estimated Time
              </span>
              <span className="text-2xl sm:text-3xl font-black text-white">
                {predictionResult.total_days_range ? `${predictionResult.total_days_range}` : `${Math.max(0, (predictionResult.display_total_days || 0) - 5)}–${(predictionResult.display_total_days || 0) + 5}`}
              </span>
              <span className="text-xs text-purple-200 block">days until bloom</span>
            </div>
          </div>

          {/* 2-Column Grid: Stage Detection + Conditions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Box: Stage Identification Summary */}
            <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-sm text-gray-800">
                  Detected Growth Stage
                </h4>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold text-white ${STAGE_CONFIG[predictionResult.current_stage]?.badge || "bg-purple-600"}`}>
                  {predictionResult.current_stage}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold text-gray-700">
                  <span>Detection Confidence</span>
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
                {STAGE_CONFIG[predictionResult.current_stage]?.desc || "Stage identified from your 3 uploaded photos."}
              </p>

              {/* Exact 3-Angle Prediction Breakdown */}
              {predictionResult.image_predictions && predictionResult.image_predictions.length > 0 && (
                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                    Individual Photo Breakdown ({predictionResult.image_predictions.length} Angles):
                  </span>
                  <div className="space-y-2">
                    {predictionResult.image_predictions.map((p, idx) => {
                      const isInvalid = p.stage === "Invalid" || p.stage === "Non-Orchid" || p.is_valid === false || p.is_orchid === false;
                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between text-xs p-2.5 rounded-lg border shadow-2xs ${isInvalid
                            ? "bg-rose-50/80 border-rose-200"
                            : "bg-white border-gray-200"
                            }`}
                        >
                          <div>
                            <span className="font-bold text-gray-800 block">
                              {p.angle_label || `Photo ${p.image_index}`}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">{p.filename}</span>
                          </div>
                          <div className="text-right">
                            {isInvalid ? (
                              <span className="font-black text-rose-700 block">
                                ⚠️ {p.stage}
                              </span>
                            ) : (
                              <span className="font-black text-purple-900 block">{p.stage}</span>
                            )}
                            <span className="text-[11px] text-gray-500 font-mono font-semibold">
                              {Math.round((p.confidence || 0) * 100)}% match
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Box: Standard Dendrobium Targets */}
            <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/50 space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-gray-800">
                  Ideal Growing Conditions for Dendrobium Orchids
                </h4>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 border border-rose-200 rounded-xl bg-rose-50/60 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">Ideal Temp</span>
                  <span className="font-black text-rose-900 text-sm">
                    25–30 °C
                  </span>
                </div>
                <div className="p-2.5 border border-sky-200 rounded-xl bg-sky-50/60 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 block">Ideal Humidity</span>
                  <span className="font-black text-sky-900 text-sm">
                    70–75 %
                  </span>
                </div>
                <div className="p-2.5 border border-amber-200 rounded-xl bg-amber-50/60 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">Ideal Sunlight</span>
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
                      <span>📊</span> Your Plant's Average Climate ({predictionResult.sensor_summary.data_window_days || 30} Days)
                    </span>
                    {predictionResult.sensor_summary.telemetry_samples_count > 0 && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {predictionResult.sensor_summary.telemetry_samples_count} Readings
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 border border-rose-100 rounded-xl bg-white shadow-2xs space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Avg Temperature</span>
                      <span className="text-sm font-black text-rose-600">
                        {predictionResult.sensor_summary.avg_temp_c != null ? `${Number(predictionResult.sensor_summary.avg_temp_c).toFixed(1)} °C` : "No Data"}
                      </span>
                      {predictionResult.sensor_summary.min_temp_c != null && (
                        <span className="text-[9px] text-gray-400 block">
                          ({Number(predictionResult.sensor_summary.min_temp_c).toFixed(1)}° – {Number(predictionResult.sensor_summary.max_temp_c).toFixed(1)}°)
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 border border-sky-100 rounded-xl bg-white shadow-2xs space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Avg Humidity</span>
                      <span className="text-sm font-black text-sky-600">
                        {predictionResult.sensor_summary.avg_humidity_rh != null ? `${Number(predictionResult.sensor_summary.avg_humidity_rh).toFixed(1)} %` : "No Data"}
                      </span>
                      {predictionResult.sensor_summary.min_humidity_rh != null && (
                        <span className="text-[9px] text-gray-400 block">
                          ({Number(predictionResult.sensor_summary.min_humidity_rh).toFixed(1)}% – {Number(predictionResult.sensor_summary.max_humidity_rh).toFixed(1)}%)
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 border border-amber-100 rounded-xl bg-white shadow-2xs space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Avg Sunlight</span>
                      <span className="text-sm font-black text-amber-600">
                        {predictionResult.sensor_summary.avg_light_lux != null
                          ? `${Number(predictionResult.sensor_summary.avg_light_lux).toLocaleString(undefined, { maximumFractionDigits: 0 })} Lux`
                          : "No Data"}
                      </span>
                      {predictionResult.sensor_summary.min_light_lux != null && (
                        <span className="text-[9px] text-gray-400 block">
                          ({Number(predictionResult.sensor_summary.min_light_lux).toLocaleString(undefined, { maximumFractionDigits: 0 })} – {Number(predictionResult.sensor_summary.max_light_lux).toLocaleString(undefined, { maximumFractionDigits: 0 })})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recommended Environmental & Placement Advice */}
          {predictionResult.environment_evaluation && (
            <div className="p-5 md:p-6 border border-purple-200/90 rounded-2xl bg-gradient-to-br from-purple-50/60 via-white to-indigo-50/40 space-y-4 shadow-xs">
              <div className="border-b border-purple-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-extrabold text-sm md:text-base text-gray-900 flex items-center gap-2">
                  <span className="text-lg">🌿</span>
                  <span>Climate Status & Care Recommendations</span>
                </h4>
                <span className="text-[11px] font-bold text-purple-700 bg-purple-100/80 px-2.5 py-0.5 rounded-full border border-purple-200">
                  Orchid Health
                </span>
              </div>

              {/* 3 Telemetry Status Indicator Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Temperature Card */}
                {(() => {
                  const temp = predictionResult.environment_evaluation.temperature;
                  const isOptimal = temp.status === "optimal";
                  const badgeClass = isOptimal
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : temp.status === "unknown"
                      ? "bg-gray-100 text-gray-700 border-gray-300"
                      : temp.status === "low"
                        ? "bg-sky-100 text-sky-800 border-sky-300"
                        : "bg-rose-100 text-rose-800 border-rose-300";

                  return (
                    <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                          <span>🌡️</span> Temperature
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                          {temp.status_label}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between bg-gray-50/90 p-2.5 rounded-lg border border-gray-100">
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wide">Your Reading</span>
                          <span className="text-base font-black text-rose-600">
                            {temp.value != null ? `${Number(temp.value).toFixed(1)} °C` : "No Data"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wide">Ideal Range</span>
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
                    : hum.status === "unknown"
                      ? "bg-gray-100 text-gray-700 border-gray-300"
                      : hum.status === "low"
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : "bg-sky-100 text-sky-800 border-sky-300";

                  return (
                    <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                          <span>💧</span> Air Humidity
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                          {hum.status_label}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between bg-gray-50/90 p-2.5 rounded-lg border border-gray-100">
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wide">Your Reading</span>
                          <span className="text-base font-black text-sky-600">
                            {hum.value != null ? `${Number(hum.value).toFixed(1)} %` : "No Data"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wide">Ideal Range</span>
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
                    : light.status === "unknown"
                      ? "bg-gray-100 text-gray-700 border-gray-300"
                      : light.status === "low"
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : "bg-rose-100 text-rose-800 border-rose-300";

                  return (
                    <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-gray-800 flex items-center gap-1.5">
                          <span>☀️</span> Light Level
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                          {light.status_label}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between bg-gray-50/90 p-2.5 rounded-lg border border-gray-100">
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wide">Your Reading</span>
                          <span className="text-base font-black text-amber-600">
                            {light.value != null
                              ? `${Number(light.value).toLocaleString(undefined, { maximumFractionDigits: 0 })} Lux`
                              : "No Data"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wide">Ideal Range</span>
                          <span className="text-xs font-extrabold text-gray-700">{light.target}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Actionable Advice Box */}
              <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white p-5 rounded-2xl shadow-sm border border-purple-800 space-y-2">
                <div className="border-b border-purple-800/80 pb-2.5 flex items-center justify-between">
                  <h5 className="font-extrabold text-sm text-purple-100 flex items-center gap-2">
                    <span className="text-base">🌿</span>
                    <span>Care & Placement Suggestions</span>
                  </h5>
                </div>
                <p className="text-sm text-purple-100 leading-relaxed font-normal pt-1 flex items-start gap-2.5">
                  <span className="text-emerald-400 font-black text-base leading-none mt-0.5">✓</span>
                  <span>{predictionResult.environment_evaluation.recommendation}</span>
                </p>
              </div>
            </div>
          )}

          {/* Timeline Progression */}
          {predictionResult.timeline && predictionResult.timeline.length > 0 && (
            <div className="p-5 border border-gray-200 rounded-xl bg-white space-y-4 shadow-xs">
              <h4 className="font-extrabold text-sm text-gray-800 flex items-center gap-2">
                <span>⏱️</span> Expected Stage-by-Stage Journey to Bloom
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
                        Estimated Dates: <strong>{step.transition_window || step.estimated_date}</strong>
                      </span>
                    </div>
                    <div className="text-right sm:self-center">
                      <span className="text-xs font-black text-purple-900 bg-purple-200/70 px-2.5 py-1 rounded-lg">
                        {step.transition_days_range || `+${step.transition_days} Days`}
                      </span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        (Total wait: {step.cumulative_days_range || `${step.cumulative_days}d`})
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
              <span>Take New Photos for This Plant</span>
            </button>
          </div>
        </div>
      )}

      {/* Historical Predictions List */}
      <div className="border-t border-gray-200 pt-6 space-y-4">
        <h3 className="text-base font-extrabold text-gray-800 flex items-center gap-2">
          <span>📜</span> Past Prediction History for {selectedPlant.plant_name}
        </h3>

        {loadingHistory ? (
          <p className="text-xs text-gray-400">Loading prediction records...</p>
        ) : historyList.length === 0 ? (
          <p className="text-xs text-gray-400">No past bloom predictions saved for this plant yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-100 text-gray-600 uppercase font-bold text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Current Stage & Time to Bloom</th>
                  <th className="px-4 py-2.5">Expected Bloom Date</th>
                  <th className="px-4 py-2.5">Date Scanned</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyList.map((item, idx) => (
                  <tr key={idx} className="hover:bg-purple-50/20">
                    <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-2 font-bold text-purple-900">
                      {item.current_stage ? `${item.current_stage} • ` : ""}
                      {item.weeks === 0 ? "Currently Blooming" : `Ready in ~${item.weeks} Weeks`}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {item.flowering_date_range_display || item.estimated_flowering_date || (item.weeks === 0 ? "In Full Bloom" : "—")}
                    </td>
                    <td className="px-4 py-2 text-gray-500 font-mono">
                      {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                        Saved
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