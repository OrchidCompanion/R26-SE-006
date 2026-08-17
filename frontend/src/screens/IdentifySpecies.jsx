import React, { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function IdentifySpecies({ onBack }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [speciesResult, setSpeciesResult] = useState(null);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setSpeciesResult(null);
      setError("");
    }
  };

  const handleDetectSpecies = async () => {
    if (!selectedFile) {
      setError("Please select or drag an orchid image first.");
      return;
    }

    setDetecting(true);
    setError("");

    try {
      const token = localStorage.getItem("admin_token");
      const formData = new FormData();
      formData.append("image", selectedFile);

      const res = await fetch(`${API_BASE_URL}/species/detect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Species detection failed.");
      }

      setSpeciesResult(data);
    } catch (err) {
      // Fallback/demo safety if endpoint is not fully online
      setError(err.message || "Detection failed.");
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <button
          onClick={onBack}
          className="text-xs text-emerald-600 hover:underline font-semibold mb-1"
        >
          ← Back to Dashboard
        </button>
        <h2 className="text-[#1f2937] text-2xl font-extrabold flex items-center gap-2">
          <span>🌸</span> Orchid Species Identification
        </h2>
        <p className="text-gray-500 text-sm">
          Upload an orchid flower image to detect whether it is Dendrobium, Oncidium, or Phalaenopsis.
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-8 rounded-xl text-center">
          <input
            type="file"
            id="speciesImageInput"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <label
            htmlFor="speciesImageInput"
            className="cursor-pointer flex flex-col items-center justify-center space-y-2"
          >
            <span className="text-4xl">📸</span>
            <span className="text-sm font-bold text-emerald-700">
              Click or drag orchid flower image to upload
            </span>
            <span className="text-xs text-gray-500">Supports JPG, JPEG, PNG</span>
          </label>

          {previewUrl && (
            <div className="mt-4 pt-4 border-t border-emerald-200">
              <p className="text-xs font-semibold text-gray-600 mb-2">Selected Image Preview:</p>
              <img
                src={previewUrl}
                alt="Selected Orchid"
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
          onClick={handleDetectSpecies}
          disabled={detecting || !selectedFile}
          className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-3 rounded-xl transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {detecting ? "Running Species Classifier..." : "🔍 Detect Species"}
        </button>
      </div>

      {/* Results Output */}
      {speciesResult && (
        <div className="max-w-2xl mx-auto border-t pt-6 space-y-4">
          <h3 className="text-lg font-bold text-gray-800">Classification Result</h3>

          <div className="p-6 rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 text-white text-center shadow-md">
            <span className="text-xs uppercase tracking-widest text-emerald-100 font-semibold block mb-1">
              Detected Genus / Species
            </span>
            <h4 className="text-3xl font-black capitalize tracking-wide">
              {speciesResult.species || speciesResult.detected_class}
            </h4>
            {speciesResult.confidence && (
              <p className="text-sm text-emerald-100 mt-2 font-medium">
                Confidence: {speciesResult.confidence}%
              </p>
            )}
          </div>

          {speciesResult.care_tips && (
            <div className="p-4 border rounded-xl bg-gray-50 space-y-2">
              <h5 className="font-bold text-sm text-gray-700">General Care Requirements:</h5>
              <p className="text-xs text-gray-600 leading-relaxed">{speciesResult.care_tips}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}