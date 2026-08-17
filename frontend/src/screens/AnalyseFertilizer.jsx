import React, { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function AnalyseFertilizer({ selectedPlant, selectedUser, onBack }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
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
          Upload orchid imagery to evaluate nutrient requirements and recommended fertilizer schedules.
        </p>
      </div>

      {/* Image Upload Area */}
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="border-2 border-dashed border-amber-300 bg-amber-50/40 p-8 rounded-xl text-center">
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
            <span className="text-4xl">🧪</span>
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
          {analyzing ? "Analyzing Fertilizer Requirements..." : "🌾 Run Fertilizer Analysis"}
        </button>
      </div>

      {/* Analysis Output Section */}
      {analysisResult && (
        <div className="border-t pt-6 space-y-6 animate-fade-in max-w-2xl mx-auto">
          <h3 className="text-lg font-bold text-gray-800">Recommendation Verdict</h3>
          <div className="p-4 rounded-xl text-center text-white font-extrabold text-lg shadow-sm bg-gradient-to-r from-amber-600 to-yellow-600">
            {analysisResult.recommendation_msg || "Fertilizer Assessment Complete"}
          </div>

          <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
            <h4 className="font-bold text-sm text-gray-700">Recommended Fertilizer Formulation</h4>
            <p className="text-sm text-gray-800">{analysisResult.fertilizer_type || "Standard Orchid NPK (20-20-20)"}</p>
            {analysisResult.dosage && (
              <p className="text-xs text-gray-600">
                <strong>Dosage:</strong> {analysisResult.dosage}
              </p>
            )}
            {analysisResult.instructions && (
              <div className="pt-2">
                <h5 className="font-bold text-xs text-gray-600 mb-1">Application Notes:</h5>
                <p className="text-xs text-gray-700">{analysisResult.instructions}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}