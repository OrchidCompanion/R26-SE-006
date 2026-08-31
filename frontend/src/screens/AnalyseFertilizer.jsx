import React, { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function AnalyseFertilizer({ selectedPlant, selectedUser, onBack }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [leafCount, setLeafCount] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAnalysisResult(null);
      setError("");
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
      formData.append("leaf_count", leafCount);

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

        {/* Leaf Count Input */}
        <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 flex flex-col sm:flex-row justify-between items-center gap-3">
          <label className="text-sm font-bold text-gray-700">
            Leaf Count:
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={leafCount}
            onChange={(e) => setLeafCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-28 px-3 py-2 border rounded-lg text-center font-bold text-gray-800 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
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
          <div className="p-4 rounded-xl text-center text-white font-extrabold shadow-sm bg-gradient-to-r from-amber-600 to-yellow-600">
            <div className="text-xl">
              Growth Stage: {analysisResult.growth_stage || "Analyzed"}
            </div>
          </div>

          {/* Leaf Count Card */}
          <div className="p-3 bg-gray-50 border rounded-xl text-center max-w-xs mx-auto">
            <span className="block text-xs text-gray-500 font-medium">Leaf Count</span>
            <strong className="text-sm font-bold text-gray-800">{analysisResult.leaf_count || leafCount}</strong>
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
                {analysisResult.npk_recommendation.recommendation.map((step, idx) => (
                  <li key={idx} className="flex items-start space-x-2 bg-white p-2.5 rounded-lg border">
                    <span className="font-bold text-amber-600">•</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
