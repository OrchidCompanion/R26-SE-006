import React, { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function IdentifySpecies({ onBack }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 5) {
      setError("Please select up to 5 images max (1 or 2 images recommended).");
      return;
    }
    setError("");
    setSelectedFiles(files);
    setAnalysisResult(null);

    // Create thumbnail previews
    const filePreviews = files.map((file) => URL.createObjectURL(file));
    setPreviews(filePreviews);
  };

  const handleIdentify = async () => {
    if (selectedFiles.length === 0) {
      setError("Please upload at least 1 image.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysisResult(null);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/species/identify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Identification failed.");
      }

      const data = await res.json();
      setAnalysisResult(data);
    } catch (err) {
      setError(err.message || "Could not connect to the identification server.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setPreviews([]);
    setAnalysisResult(null);
    setError("");
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="border-b pb-4 flex justify-between items-center">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-emerald-600 hover:underline font-semibold mb-1 block"
          >
            ← Back to Dashboard
          </button>
          <h2 className="text-[#1f2937] text-2xl font-extrabold flex items-center gap-2">
            AI Orchid Species Identification
          </h2>
          <p className="text-gray-500 text-sm">
            Powered by YOLO11n (Dendrobium, Phalaenopsis, and Oncidium detector).
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center bg-gray-50 hover:bg-emerald-50/40 transition">
        <input
          type="file"
          id="orchid-images"
          multiple
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <label htmlFor="orchid-images" className="cursor-pointer space-y-2 block">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl">
            📷
          </div>
          <p className="text-sm font-bold text-gray-700">
            Click to upload orchid photo(s)
          </p>
          <p className="text-xs text-gray-500">
            You can select 1 or 2 images (e.g. side angle & close canopy) for higher accuracy
          </p>
        </label>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-semibold">
          ⚠️ {error}
        </div>
      )}

      {/* Input Previews */}
      {previews.length > 0 && !analysisResult && (
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase text-gray-600">
            Selected Images ({previews.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {previews.map((src, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden border border-gray-200 aspect-square bg-black/5">
                <img src={src} alt="preview" className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  Image #{i + 1}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleIdentify}
              disabled={loading}
              className="flex-1 bg-[#059669] hover:bg-[#047857] text-white font-bold py-2.5 rounded-lg shadow-md transition disabled:opacity-50 text-sm"
            >
              {loading ? "Running Analysis..." : `Run Detection on ${selectedFiles.length} Image(s)`}
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 font-semibold text-gray-700 text-sm rounded-lg"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Results View */}
      {analysisResult && (
        <div className="space-y-6 pt-2">
          {/* Main Verdict Card */}
          <div
            className={`p-5 rounded-2xl text-center text-white font-extrabold shadow-sm ${analysisResult.verdict.includes("No orchid")
                ? "bg-linear-to-r from-amber-600 to-rose-600"
                : "bg-linear-to-r from-emerald-600 to-teal-600"
              }`}
          >
            <span className="text-xs uppercase tracking-wider block opacity-80 mb-1">
              Result
            </span>
            <p className="text-xl">{analysisResult.verdict}</p>
          </div>

          {/* Individual Predictions with Bounding Box overlays */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {analysisResult.results.map((res, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs space-y-3 p-4">
                <div className="flex justify-between items-center text-xs font-bold text-gray-700">
                  <span>Photo #{idx + 1}: {res.filename}</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                    {res.detected_count} Plant(s) Detected
                  </span>
                </div>

                <div className="rounded-lg overflow-hidden border border-gray-100 aspect-video bg-gray-900 flex items-center justify-center">
                  <img
                    src={res.annotated_image}
                    alt="YOLO Detection Output"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  {res.detections.length > 0 ? (
                    res.detections.map((det, dIdx) => (
                      <div
                        key={dIdx}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded-lg text-xs border border-gray-100"
                      >
                        <span className="font-bold text-gray-800 uppercase tracking-wide">
                          🌱 {det.species}
                        </span>
                        <span className="font-extrabold text-emerald-700">
                          Confidence: {det.confidence_percentage}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 italic text-center py-2">
                      No matching orchid features found in this frame.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center pt-2">
            <button
              onClick={handleReset}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              Analyze Another Plant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}