import React, { useState } from "react";
import { Maximize2, Eye, Ruler, Sparkles, X, Layers, Info, Plus, Minus } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function AnalyseFertilizer({ selectedPlant, selectedUser, onBack }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [leafCount, setLeafCount] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("marked"); // "marked" | "original" | "split"
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAnalysisResult(null);
      setError("");
      setViewMode("marked");
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedFile) {
      setError("Please select or drag a plant/leaf image first.");
      return;
    }

    setAnalyzing(true);
    setError("");

    try {
      const token = localStorage.getItem("admin_token");
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("plant_id", selectedPlant.plant_id);
      const effectiveLeafCount = Math.max(1, parseInt(leafCount, 10) || 1);
      formData.append("leaf_count", effectiveLeafCount);

      const res = await fetch(`${API_BASE_URL}/fertilizer/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Fertilizer analysis failed.");
      }

      setAnalysisResult(data);
      setViewMode("marked");
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Helper to format image source (handles base64 without data URI prefix or direct URLs)
  const formatImageSrc = (img) => {
    if (!img || typeof img !== "string") return null;
    if (
      img.startsWith("data:") ||
      img.startsWith("http://") ||
      img.startsWith("https://") ||
      img.startsWith("blob:") ||
      img.startsWith("/")
    ) {
      return img;
    }
    return `data:image/jpeg;base64,${img}`;
  };

  const rawMarkedImage =
    analysisResult?.marked_image ||
    analysisResult?.result_image ||
    analysisResult?.annotated_image ||
    analysisResult?.marked_leaf_image;

  const markedImageSrc = formatImageSrc(rawMarkedImage);
  const displayImageSrc =
    viewMode === "original" || !markedImageSrc ? previewUrl : markedImageSrc;

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <button
          onClick={onBack}
          className="text-xs text-amber-600 hover:underline font-semibold mb-1"
        >
          ← Back to Plant Details
        </button>
        <h2 className="text-[#1f2937] text-2xl font-extrabold">
          Fertilizer Analysis — {selectedPlant.plant_name}
        </h2>
        <p className="text-gray-500 text-sm">
          Upload orchid imagery and specify leaf count to evaluate nutrient requirements.
        </p>
      </div>

      {/* Photo-Taking Instructions & Warning Banner */}
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-xs space-y-4">
          {/* Warning Banner */}
          <div className="bg-amber-500/10 border-l-4 border-amber-600 p-3 rounded-r-lg flex items-start space-x-3">
            <span className="text-amber-700 text-lg font-bold leading-none mt-0.5"></span>
            <p className="text-xs font-bold text-amber-900 leading-relaxed">
              “For accurate leaf measurement and growth-stage prediction, please follow these instructions carefully. Select a well-grown leaf and position it correctly with the Rs. 5 coin.”
            </p>
          </div>

          {/* Structured Instructions List */}
          <div>
            <h3 className="text-xs font-extrabold text-amber-900 tracking-wider uppercase mb-2 flex items-center gap-1.5">
              <span></span> Photo-Taking Instructions for Best Accuracy:
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-700">
              <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-2xs">
                <span className="text-base leading-none"></span>
                <span>
                  <strong>Leaf Selection:</strong> Place <strong>one well-grown, mature leaf</strong> flat on a level surface. Avoid very young, small, or damaged leaves.
                </span>
              </li>
              <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-2xs">
                <span className="text-base leading-none"></span>
                <span>
                  <strong>Clean Background:</strong> Lay the leaf on a <strong>clean white A4 sheet of paper</strong> to clearly separate it from the background.
                </span>
              </li>
              <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-2xs">
                <span className="text-base leading-none"></span>
                <span>
                  <strong>Top-Down View:</strong> Take the photo <strong>directly from above (top-down)</strong>. Do not take the photo at an angle.
                </span>
              </li>
              <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-2xs">
                <span className="text-base leading-none"></span>
                <span>
                  <strong>Full Visibility:</strong> Make sure the <strong>entire leaf is visible</strong> and not cut off by the image edges.
                </span>
              </li>
              <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-2xs">
                <span className="text-base leading-none"></span>
                <span>
                  <strong>Rs. 5 Coin Reference:</strong> Place a <strong>Sri Lankan Rs. 5 coin</strong> next to the leaf on the <strong>same surface & height</strong>.
                </span>
              </li>
              <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-2xs">
                <span className="text-base leading-none"></span>
                <span>
                  <strong>No Touch / Overlap:</strong> Ensure the <strong>coin does not overlap or touch the leaf</strong>. Leave a small visible gap.
                </span>
              </li>
            </ul>
            <div className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-100/50 p-2 rounded-lg text-center">
              Note: Only <strong>one leaf</strong> should be included in the photo.
            </div>
          </div>
        </div>

        {/* Image Upload Area */}
        <div className="border-2 border-dashed border-amber-300 bg-amber-50/40 py-10 px-8 rounded-xl text-center">
          <input
            type="file"
            id="fertilizerImageInput"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <label
            htmlFor="fertilizerImageInput"
            className="cursor-pointer flex flex-col items-center justify-center space-y-2"
          >
            <span className="text-sm font-bold text-amber-800">
              Click or drag plant image to upload
            </span>
            <span className="text-xs text-gray-500">Supports JPG, PNG</span>
          </label>

          {previewUrl && (
            <div className="mt-4 pt-4 border-t border-amber-200">
              <p className="text-xs font-semibold text-gray-600 mb-2">Image Preview:</p>
              <img
                src={previewUrl}
                alt="Selected Plant"
                className="max-h-64 mx-auto rounded-lg border shadow-xs object-contain"
              />
            </div>
          )}
        </div>

        {/* Leaf Count Adder / Counter */}
        <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 flex flex-col sm:flex-row justify-between items-center gap-3 shadow-2xs">
          <div>
            <label htmlFor="leafCountInput" className="text-sm font-bold text-gray-800 block">
              Leaf Count:
            </label>
            <span className="text-[11px] text-gray-500 block">
              Specify plant leaf count (Min = 1)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setLeafCount((prev) => Math.max(1, (parseInt(prev, 10) || 1) - 1))}
              disabled={Number(leafCount) <= 1}
              className="w-9 h-9 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 font-bold flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs active:scale-95"
              aria-label="Decrease leaf count"
              title="Decrease leaf count (Minimum is 1)"
            >
              <Minus className="w-4 h-4" />
            </button>

            <input
              id="leafCountInput"
              type="number"
              min="1"
              max="100"
              value={leafCount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setLeafCount("");
                } else {
                  const num = parseInt(val, 10);
                  setLeafCount(isNaN(num) ? 1 : Math.max(1, num));
                }
              }}
              onBlur={() => {
                if (!leafCount || Number(leafCount) < 1) {
                  setLeafCount(1);
                }
              }}
              className="w-20 px-2 py-1.5 border border-amber-300 rounded-lg text-center font-extrabold text-base text-gray-800 bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none shadow-2xs"
            />

            <button
              type="button"
              onClick={() => setLeafCount((prev) => Math.min(100, (parseInt(prev, 10) || 1) + 1))}
              className="w-9 h-9 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 font-bold flex items-center justify-center transition cursor-pointer shadow-2xs active:scale-95"
              aria-label="Increase leaf count"
              title="Increase leaf count"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 text-rose-700 border border-rose-200 text-xs p-3 rounded-lg text-center">
            {error}
          </div>
        )}


        <button
          onClick={handleRunAnalysis}
          disabled={analyzing || !selectedFile}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {analyzing ? "Analyzing Fertilizer Requirements..." : "Run Fertilizer Analysis"}
        </button>
      </div>

      {/* Analysis Output Section */}
      {analysisResult && (
        <div className="border-t pt-6 space-y-6 animate-fade-in max-w-2xl mx-auto">
          <h3 className="text-lg font-bold text-gray-800">Growth Stage & NPK Analysis Results</h3>

          {/* Growth Stage Banner */}
          <div className="p-4 rounded-xl text-center text-white font-extrabold shadow-sm bg-gradient-to-r from-amber-600 to-yellow-600 space-y-1">
            <div className="text-xl">
              Growth Stage: {analysisResult.growth_stage || "Analyzed"}
            </div>
            {analysisResult.confidence != null && (
              <div className="text-xs font-semibold bg-white/20 inline-block px-3 py-1 rounded-full backdrop-blur-xs">
                Confidence: {(analysisResult.confidence * 100).toFixed(1)}%
              </div>
            )}
          </div>

          {/* Marked Leaf Dimension & Feature Visualization (Tip-to-Base Line & Width Line) */}
          <div className="p-5 border border-amber-200 rounded-xl bg-gradient-to-b from-amber-50/40 to-white shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-amber-200/80 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-gray-800 flex items-center gap-2">
                  <Ruler className="w-5 h-5 text-amber-600" />
                  Leaf Dimension Measurement & Feature Markings
                </h4>
                <p className="text-xs text-gray-500">
                  Tip-to-base length line, maximum width line, and key feature detection overlay.
                </p>
              </div>

              {/* View Mode Switcher */}
              {markedImageSrc && previewUrl && (
                <div className="flex items-center gap-1 bg-amber-100/70 p-1 rounded-lg border border-amber-200 text-xs self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setViewMode("marked")}
                    className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${viewMode === "marked"
                      ? "bg-white text-amber-900 shadow-2xs"
                      : "text-amber-800 hover:text-amber-950"
                      }`}
                  >
                    Marked Leaf
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("original")}
                    className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${viewMode === "original"
                      ? "bg-white text-amber-900 shadow-2xs"
                      : "text-amber-800 hover:text-amber-950"
                      }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("split")}
                    className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer hidden sm:inline-block ${viewMode === "split"
                      ? "bg-white text-amber-900 shadow-2xs"
                      : "text-amber-800 hover:text-amber-950"
                      }`}
                  >
                    Side-by-Side
                  </button>
                </div>
              )}
            </div>

            {/* Image Preview Container */}
            {viewMode === "split" && markedImageSrc && previewUrl ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center justify-between">
                    <span>Marked Leaf (Lines & Points)</span>
                    <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded font-bold">Processed</span>
                  </div>
                  <div
                    onClick={() => setIsZoomOpen(true)}
                    className="relative cursor-pointer group rounded-lg overflow-hidden border border-amber-300 bg-gray-900/5 aspect-4/3 flex items-center justify-center shadow-2xs"
                  >
                    <img
                      src={markedImageSrc}
                      alt="Marked Leaf Analysis"
                      className="max-h-72 w-full object-contain transition group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold gap-1">
                      <Maximize2 className="w-4 h-4" /> Click to enlarge
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center justify-between">
                    <span>Original Upload</span>
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-bold">Input</span>
                  </div>
                  <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-900/5 aspect-4/3 flex items-center justify-center shadow-2xs">
                    <img
                      src={previewUrl}
                      alt="Original Leaf"
                      className="max-h-72 w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div
                  onClick={() => setIsZoomOpen(true)}
                  className="relative cursor-pointer group rounded-xl overflow-hidden border-2 border-amber-300/80 bg-gray-950/5 flex items-center justify-center shadow-xs min-h-[220px]"
                >
                  <img
                    src={displayImageSrc}
                    alt={viewMode === "original" ? "Original Leaf" : "Marked Leaf Analysis"}
                    className="max-h-96 w-full object-contain transition duration-200 group-hover:scale-[1.01]"
                  />
                  <div className="absolute top-3 right-3 bg-white/90 hover:bg-white text-gray-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-sm border border-gray-200 flex items-center gap-1.5 backdrop-blur-xs transition">
                    <Maximize2 className="w-3.5 h-3.5 text-amber-600" />
                    <span>Enlarge</span>
                  </div>
                  <div className="absolute top-3 left-3 bg-amber-900/80 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-xs backdrop-blur-xs">
                    {viewMode === "original" ? "Original Upload" : "Marked Length & Width Lines"}
                  </div>
                </div>

                {!markedImageSrc && (
                  <div className="mt-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Dimension Detection Active:</strong> Measured Length ({analysisResult.leaf_length_cm != null ? `${analysisResult.leaf_length_cm} cm` : "N/A"}) and Width ({analysisResult.leaf_width_cm != null ? `${analysisResult.leaf_width_cm} cm` : "N/A"}). The marked overlay displaying the tip-to-base and width lines will be shown directly on the leaf.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Leaf Measurements & Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center shadow-2xs">
              <span className="block text-xs text-gray-500 font-medium">Leaf Count</span>
              <strong className="text-sm font-bold text-gray-800">{analysisResult.leaf_count || leafCount}</strong>
            </div>

            <div className="p-3 bg-gray-50 border border-amber-200/60 bg-amber-50/20 rounded-xl text-center shadow-2xs">
              <span className="block text-xs text-gray-500 font-medium">Leaf Length</span>
              <strong className="text-sm font-bold text-amber-900">
                {analysisResult.leaf_length_cm != null
                  ? `${typeof analysisResult.leaf_length_cm === 'number' ? analysisResult.leaf_length_cm.toFixed(2) : analysisResult.leaf_length_cm} cm`
                  : "N/A"}
              </strong>
            </div>

            <div className="p-3 bg-gray-50 border border-amber-200/60 bg-amber-50/20 rounded-xl text-center shadow-2xs">
              <span className="block text-xs text-gray-500 font-medium">Leaf Width</span>
              <strong className="text-sm font-bold text-amber-900">
                {analysisResult.leaf_width_cm != null
                  ? `${typeof analysisResult.leaf_width_cm === 'number' ? analysisResult.leaf_width_cm.toFixed(2) : analysisResult.leaf_width_cm} cm`
                  : "N/A"}
              </strong>
            </div>

            <div className="p-3 bg-gray-50 border border-amber-200/60 bg-amber-50/20 rounded-xl text-center shadow-2xs">
              <span className="block text-xs text-gray-500 font-medium">Leaf Area</span>
              <strong className="text-sm font-bold text-amber-900">
                {analysisResult.leaf_area_cm2 != null
                  ? `${typeof analysisResult.leaf_area_cm2 === 'number' ? analysisResult.leaf_area_cm2.toFixed(2) : analysisResult.leaf_area_cm2} cm²`
                  : "N/A"}
              </strong>
            </div>

            <div className="p-3 bg-gray-50 border border-amber-200/60 bg-amber-50/20 rounded-xl text-center shadow-2xs col-span-2 sm:col-span-1">
              <span className="block text-xs text-gray-500 font-medium">Confidence</span>
              <strong className="text-sm font-bold text-amber-900">
                {analysisResult.confidence != null
                  ? `${(analysisResult.confidence * 100).toFixed(1)}%`
                  : "N/A"}
              </strong>
            </div>
          </div>

          {/* Live NPK Readings & Target Ratio */}
          <div className="p-4 border rounded-xl bg-amber-50/30 space-y-3">
            <h4 className="font-bold text-sm text-amber-900 border-b border-amber-200 pb-2 flex justify-between">
              <span>Live NPK Sensor Readings</span>
              <span className="text-xs font-semibold text-amber-700">Target Ratio: {analysisResult.npk_recommendation?.target_ratio || "20-20-20"}</span>
            </h4>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2 bg-white rounded-lg border border-amber-200">
                <span className="block text-xs text-gray-500">Nitrogen (N)</span>
                <strong className="text-sm font-extrabold text-emerald-700">{analysisResult.npk_reading?.nitrogen ?? 0} mg/kg</strong>
                <span className={`block text-[10px] font-bold uppercase mt-1 ${analysisResult.npk_recommendation?.status?.nitrogen === "deficient"
                  ? "text-rose-600"
                  : analysisResult.npk_recommendation?.status?.nitrogen === "excess"
                    ? "text-amber-600"
                    : "text-emerald-600"
                  }`}>
                  [{analysisResult.npk_recommendation?.status?.nitrogen || "optimal"}]
                </span>
              </div>

              <div className="p-2 bg-white rounded-lg border border-amber-200">
                <span className="block text-xs text-gray-500">Phosphorus (P)</span>
                <strong className="text-sm font-extrabold text-amber-700">{analysisResult.npk_reading?.phosphorous ?? 0} mg/kg</strong>
                <span className={`block text-[10px] font-bold uppercase mt-1 ${analysisResult.npk_recommendation?.status?.phosphorous === "deficient"
                  ? "text-rose-600"
                  : analysisResult.npk_recommendation?.status?.phosphorous === "excess"
                    ? "text-amber-600"
                    : "text-emerald-600"
                  }`}>
                  [{analysisResult.npk_recommendation?.status?.phosphorous || "optimal"}]
                </span>
              </div>

              <div className="p-2 bg-white rounded-lg border border-amber-200">
                <span className="block text-xs text-gray-500">Potassium (K)</span>
                <strong className="text-sm font-extrabold text-rose-700">{analysisResult.npk_reading?.potassium ?? 0} mg/kg</strong>
                <span className={`block text-[10px] font-bold uppercase mt-1 ${analysisResult.npk_recommendation?.status?.potassium === "deficient"
                  ? "text-rose-600"
                  : analysisResult.npk_recommendation?.status?.potassium === "excess"
                    ? "text-amber-600"
                    : "text-emerald-600"
                  }`}>
                  [{analysisResult.npk_recommendation?.status?.potassium || "optimal"}]
                </span>
              </div>
            </div>
          </div>

          {/* Detailed NPK Recommendations List */}
          {analysisResult.npk_recommendation?.recommendation && (
            <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
              <h4 className="font-bold text-sm text-gray-800">Actionable Fertilizer Instructions</h4>
              <ul className="space-y-2 text-xs text-gray-700">
                {Array.isArray(analysisResult.npk_recommendation.recommendation) ? (
                  analysisResult.npk_recommendation.recommendation.map((step, idx) => (
                    <li key={idx} className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border">
                      <span className="font-bold text-amber-600">•</span>
                      <span>{step}</span>
                    </li>
                  ))
                ) : (
                  <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border">
                    <span className="font-bold text-amber-600">•</span>
                    <span>{analysisResult.npk_recommendation.recommendation}</span>
                  </li>
                )}
                {analysisResult.npk_recommendation?.frequency && (
                  <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border">
                    <span className="font-bold text-amber-600">📅</span>
                    <span><strong>Frequency:</strong> {analysisResult.npk_recommendation.frequency}</span>
                  </li>
                )}
                {analysisResult.npk_recommendation?.notes && (
                  <li className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border">
                    <span className="font-bold text-amber-600">💡</span>
                    <span><strong>Notes:</strong> {analysisResult.npk_recommendation.notes}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen / Lightbox Zoom Modal for Marked Leaf Details */}
      {isZoomOpen && analysisResult && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in"
          onClick={() => setIsZoomOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                  <Ruler className="w-5 h-5 text-amber-600" />
                  Marked Leaf Measurement & Line Feature Inspection
                </h3>
                <p className="text-xs text-gray-500">
                  Full resolution view of tip-to-base line (length) and maximum width line markings
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Image View */}
            <div className="bg-gray-950/5 rounded-xl p-2 flex items-center justify-center border border-gray-200 min-h-[300px]">
              <img
                src={displayImageSrc}
                alt="Enlarged Marked Leaf"
                className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>

            {/* Key Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg">
                <span className="text-[11px] text-sky-700 block font-medium">Tip-to-Base Length</span>
                <strong className="text-sm font-extrabold text-sky-950">
                  {analysisResult.leaf_length_cm != null ? `${analysisResult.leaf_length_cm} cm` : "N/A"}
                </strong>
              </div>
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                <span className="text-[11px] text-rose-700 block font-medium">Maximum Width</span>
                <strong className="text-sm font-extrabold text-rose-950">
                  {analysisResult.leaf_width_cm != null ? `${analysisResult.leaf_width_cm} cm` : "N/A"}
                </strong>
              </div>
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-[11px] text-amber-700 block font-medium">Surface Area</span>
                <strong className="text-sm font-extrabold text-amber-950">
                  {analysisResult.leaf_area_cm2 != null ? `${analysisResult.leaf_area_cm2} cm²` : "N/A"}
                </strong>
              </div>
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-[11px] text-emerald-700 block font-medium">Growth Stage</span>
                <strong className="text-sm font-extrabold text-emerald-950">
                  {analysisResult.growth_stage || "Analyzed"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
