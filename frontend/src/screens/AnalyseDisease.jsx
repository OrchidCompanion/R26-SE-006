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
    fetchLast7DaysNpkReadings();
  }, [selectedPlant, selectedUser]);

  const fetchLast7DaysNpkReadings = async () => {
    const plantId = selectedPlant?.plant_id;
    if (!plantId) {
      setNpkReadings([]);
      setLoadingNpk(false);
      return;
    }

    setLoadingNpk(true);
    try {
      const token = localStorage.getItem("admin_token");
      const params = new URLSearchParams();
      if (selectedUser?.user_id) params.set("user_id", selectedUser.user_id);
      const query = params.toString() ? `?${params.toString()}` : "";
      const headers = { Authorization: `Bearer ${token}` };

      const urls = [
        `${API_BASE_URL}/disease/plant/${plantId}?include_npk=true&limit=1${query ? `&${query.slice(1)}` : ""}`,
        `${API_BASE_URL}/disease/plant/${plantId}/npk-history${query}`,
        `${API_BASE_URL}/disease/npk-history/${plantId}${query}`,
      ];

      let list = [];
      for (const url of urls) {
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const responseData = await res.json();
        const next = Array.isArray(responseData)
          ? responseData
          : responseData.npk_data || responseData.data || responseData.rows || [];
        if (Array.isArray(next) && next.length && next[0] && ("nitrogen_n" in next[0] || "N" in next[0])) {
          list = next;
          break;
        }
        if (Array.isArray(next) && next.length && next[0]?.nitrogen_n != null) {
          list = next;
          break;
        }
      }

      setNpkReadings(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
      setNpkReadings([]);
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
            {analyzing ? "Running YOLO + MobileNetV2 + CNN ensemble..." : "Run Disease Analysis"}
          </button>
        </div>

        {/* Right Column: last 7 days of NPK readings */}
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 flex flex-col h-100">
          <h3 className="font-bold text-gray-800 text-sm mb-1">
            Soil NPK History (Last 7 days — {npkReadings.length} readings)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Only readings from the last 7 days. Older values are excluded so a recent
            deficiency is not hidden by earlier healthy averages.
          </p>

          {loadingNpk ? (
            <p className="text-xs text-gray-400 my-auto text-center">Loading NPK telemetry...</p>
          ) : npkReadings.length === 0 ? (
            <p className="text-xs text-gray-400 my-auto text-center">No NPK readings in the last 7 days for this plant.</p>
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
                    <tr key={r.reading_id || i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-1.5 font-semibold text-emerald-700">{r.nitrogen_n}</td>
                      <td className="px-3 py-1.5 font-semibold text-amber-700">{r.phosphorus_p}</td>
                      <td className="px-3 py-1.5 font-semibold text-rose-700">{r.potassium_k}</td>
                      <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
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
            <div className="p-4 border rounded-xl bg-gray-50 space-y-4">
              <h4 className="font-bold text-sm text-gray-700">NPK Soil Context</h4>

              <div>
                <h5 className="font-bold text-xs text-gray-600 mb-2">Latest reading</h5>
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
                <ul className="list-disc list-inside text-xs text-gray-700 space-y-1 mt-2">
                  {analysisResult.npk_advice?.map((adv, idx) => (
                    <li key={idx}>{adv}</li>
                  ))}
                </ul>
              </div>

              {analysisResult.npk_window && (
                <div className="pt-3 border-t">
                  <h5 className="font-bold text-xs text-gray-600 mb-1">
                    Last {analysisResult.npk_window.days || 7} days ({analysisResult.npk_window.sample_size} readings)
                    {analysisResult.npk_window.skipped_all_zero
                      ? ` (${analysisResult.npk_window.used} used, ${analysisResult.npk_window.skipped_all_zero} all-zero skipped)`
                      : ""}
                  </h5>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Deficiency uses the 7-day average so older month-start readings cannot
                    mask a current problem. Majority vote is also shown.
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 border rounded-lg bg-white">
                      <span className="text-xs text-gray-500 block">Avg N</span>
                      <span className="font-extrabold text-emerald-700">
                        {analysisResult.npk_window.mean?.N ?? "N/A"}
                      </span>
                      <span className="text-[10px] text-gray-500 block">
                        {analysisResult.npk_window.mean_status?.N}
                      </span>
                    </div>
                    <div className="p-2 border rounded-lg bg-white">
                      <span className="text-xs text-gray-500 block">Avg P</span>
                      <span className="font-extrabold text-amber-700">
                        {analysisResult.npk_window.mean?.P ?? "N/A"}
                      </span>
                      <span className="text-[10px] text-gray-500 block">
                        {analysisResult.npk_window.mean_status?.P}
                      </span>
                    </div>
                    <div className="p-2 border rounded-lg bg-white">
                      <span className="text-xs text-gray-500 block">Avg K</span>
                      <span className="font-extrabold text-rose-700">
                        {analysisResult.npk_window.mean?.K ?? "N/A"}
                      </span>
                      <span className="text-[10px] text-gray-500 block">
                        {analysisResult.npk_window.mean_status?.K}
                      </span>
                    </div>
                  </div>
                  <h5 className="font-bold text-xs text-gray-600 mt-2 mb-1">
                    7-day advice (from averages):
                  </h5>
                  <ul className="list-disc list-inside text-xs text-gray-700 space-y-1">
                    {analysisResult.npk_window.mean_advice?.map((adv, idx) => (
                      <li key={idx}>{adv}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {analysisResult.ensemble && (
            <div className="p-4 border rounded-xl bg-gray-50">
              <h4 className="font-bold text-sm text-gray-700 mb-2">Ensemble votes</h4>
              <p className="text-xs text-gray-500 mb-3">
                YOLO locates the spot; MobileNetV2 and CNN classify the crop; weighted average is the final class.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-white rounded-lg border">
                  <p className="font-bold text-gray-600">YOLO</p>
                  <p className="font-semibold mt-1">
                    {analysisResult.ensemble.yolo?.class_name || "no box"}{" "}
                    {analysisResult.ensemble.yolo?.confidence
                      ? `(${Math.round(analysisResult.ensemble.yolo.confidence * 100)}%)`
                      : ""}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <p className="font-bold text-gray-600">MobileNetV2</p>
                  <p className="font-semibold mt-1">
                    {analysisResult.ensemble.mobilenet?.class_name} (
                    {Math.round((analysisResult.ensemble.mobilenet?.confidence || 0) * 100)}%)
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <p className="font-bold text-gray-600">CNN</p>
                  <p className="font-semibold mt-1">
                    {analysisResult.ensemble.cnn?.class_name} (
                    {Math.round((analysisResult.ensemble.cnn?.confidence || 0) * 100)}%)
                  </p>
                </div>
              </div>
            </div>
          )}

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