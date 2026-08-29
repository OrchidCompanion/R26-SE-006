import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function AnalyseDisease({ selectedPlant, selectedUser, onBack }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [npkReadings, setNpkReadings] = useState([]);
  const [loadingNpk, setLoadingNpk] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchLast90NpkReadings();
  }, [selectedPlant]);

  const fetchLast90NpkReadings = async () => {
    setLoadingNpk(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(
        `${API_BASE_URL}/sensors/npk/plant/${selectedPlant.plant_id}?page=1&limit=90`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const responseData = await res.json();
        const list = Array.isArray(responseData)
          ? responseData
          : responseData.data || [];
        setNpkReadings(list);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingNpk(false);
    }
  };

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
      setError("Please select or drag a leaf image first.");
      return;
    }

    setAnalyzing(true);
    setError("");

    try {
      const token = localStorage.getItem("admin_token");
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("plant_id", selectedPlant.plant_id);

      const res = await fetch(`${API_BASE_URL}/disease/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Analysis failed.");
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
          className="text-xs text-emerald-600 hover:underline font-semibold mb-1"
        >
          ← Back to Plant Details
        </button>
        <h2 className="text-[#1f2937] text-2xl font-extrabold">
          Disease Diagnostics — {selectedPlant.plant_name}
        </h2>
        <p className="text-gray-500 text-sm">
          Upload leaf imagery and combine with latest NPK soil readings for AI detection.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/40 py-14 px-6 rounded-xl text-center">
            <input
              type="file"
              id="leafImageInput"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="leafImageInput"
              className="cursor-pointer flex flex-col items-center justify-center space-y-2"
            >
              <span className="text-sm font-bold text-emerald-700">
                Click or drag leaf image to upload
              </span>
              <span className="text-xs text-gray-500">Supports JPG, PNG</span>
            </label>

            {previewUrl && (
              <div className="mt-4 pt-4 border-t border-emerald-200">
                <p className="text-xs font-semibold text-gray-600 mb-2">Image Preview:</p>
                <img
                  src={previewUrl}
                  alt="Selected Leaf"
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
            onClick={handleRunAnalysis}
            disabled={analyzing || !selectedFile}
            className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-3 rounded-xl transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzing ? "Running ONNX AI Analysis..." : "Run Disease Analysis"}
          </button>
        </div>

        {/* Right Column: Last 90 NPK Sensor Readings */}
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 flex flex-col h-100">
          <h3 className="font-bold text-gray-800 text-sm mb-1">
            Soil NPK History (Last {npkReadings.length} / 90 Entries)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Real-time nitrogen, phosphorus, and potassium soil context.
          </p>

          {loadingNpk ? (
            <p className="text-xs text-gray-400 my-auto text-center">Loading NPK telemetry...</p>
          ) : npkReadings.length === 0 ? (
            <p className="text-xs text-gray-400 my-auto text-center">No NPK readings recorded for this plant.</p>
          ) : (
            <div className="overflow-y-auto flex-1 rounded border border-gray-200 bg-white">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-100 text-gray-600 uppercase sticky top-0">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Nitrogen (N)</th>
                    <th className="px-3 py-2">Phosphorus (P)</th>
                    <th className="px-3 py-2">Potassium (K)</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {npkReadings.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-1.5 font-semibold text-emerald-700">{r.nitrogen_n}</td>
                      <td className="px-3 py-1.5 font-semibold text-amber-700">{r.phosphorus_p}</td>
                      <td className="px-3 py-1.5 font-semibold text-rose-700">{r.potassium_k}</td>
                      <td className="px-3 py-1.5 text-gray-400">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Analysis Output Section */}
      {analysisResult && (
        <div className="border-t pt-6 space-y-6 animate-fade-in">
          <h3 className="text-lg font-bold text-gray-800">Diagnostic Verdict & Results</h3>

          {/* Verdict Banner */}
          <div
            className={`p-4 rounded-xl text-center text-white font-extrabold text-lg shadow-sm ${analysisResult.verdict === "HEALTHY"
              ? "bg-linear-to-r from-emerald-600 to-green-500"
              : "bg-linear-to-r from-rose-600 to-red-500"
              }`}
          >
            {analysisResult.verdict_msg}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Detection Specs */}
            <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
              <h4 className="font-bold text-sm text-gray-700">Detection Confidence</h4>
              <div className="flex justify-between items-center text-xl font-extrabold text-emerald-800">
                <span>{analysisResult.disease_info}</span>
                <span>{analysisResult.confidence}%</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${analysisResult.confidence}%` }}
                ></div>
              </div>

              <div className="pt-2">
                <h5 className="font-bold text-xs text-gray-600 mb-1">Recommended Treatment:</h5>
                <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
                  {analysisResult.treatment?.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* NPK Snapshot & Advice */}
            <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
              <h4 className="font-bold text-sm text-gray-700">NPK Soil Context Snapshot</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 border rounded-lg bg-white">
                  <span className="text-xs text-gray-500 block">Nitrogen</span>
                  <span className="font-extrabold text-emerald-700">
                    {analysisResult.npk?.N ?? "N/A"}
                  </span>
                </div>
                <div className="p-2 border rounded-lg bg-white">
                  <span className="text-xs text-gray-500 block">Phosphorus</span>
                  <span className="font-extrabold text-amber-700">
                    {analysisResult.npk?.P ?? "N/A"}
                  </span>
                </div>
                <div className="p-2 border rounded-lg bg-white">
                  <span className="text-xs text-gray-500 block">Potassium</span>
                  <span className="font-extrabold text-rose-700">
                    {analysisResult.npk?.K ?? "N/A"}
                  </span>
                </div>
              </div>

              <div>
                <h5 className="font-bold text-xs text-gray-600 mb-1">Nutrient Advice:</h5>
                <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
                  {analysisResult.npk_advice?.map((adv, idx) => (
                    <li key={idx}>{adv}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Annotated Result Image */}
          {analysisResult.result_image && (
            <div className="p-4 border rounded-xl bg-gray-50">
              <h4 className="font-bold text-sm text-gray-700 mb-2">
                AI Detection Output (Bounding Box Overlay)
              </h4>
              <img
                src={`data:image/jpeg;base64,${analysisResult.result_image}`}
                alt="Annotated Result"
                className="max-h-100 mx-auto rounded-lg border shadow-sm object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}