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

  const uniqueReadingDays = (rows) => {
    const days = new Set();
    for (const row of rows || []) {
      if (!row?.created_at) continue;
      const d = new Date(row.created_at);
      if (Number.isNaN(d.getTime())) continue;
      days.add(d.toISOString().slice(0, 10));
    }
    return days.size;
  };

  const fetchLast7DaysNpkReadings = async () => {
    const plantId = selectedPlant?.plant_id;
    if (!plantId) {
      setNpkReadings([]);
      setLoadingNpk(false);
      return;
    }

    setLoadingNpk(true);
    try {
      const token = localStorage.getItem("admin_token") || localStorage.getItem("token");
      const params = new URLSearchParams();
      if (selectedUser?.user_id) params.set("user_id", selectedUser.user_id);
      const query = params.toString() ? `?${params.toString()}` : "";
      const headers = { Authorization: `Bearer ${token}` };

      const urls = [
        `${API_BASE_URL}/sensors/npk/plant/${plantId}?page=1&limit=25`,
        `${API_BASE_URL}/disease/plant/${plantId}?include_npk=true&limit=1${query ? `&${query.slice(1)}` : ""}`,
      ];

      let list = [];
      for (const url of urls) {
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const responseData = await res.json();
        const next = Array.isArray(responseData)
          ? responseData
          : responseData.npk_data || responseData.data || responseData.rows || [];
        if (Array.isArray(next) && next.length && next[0] && ("nitrogen_n" in next[0] || "nitrogen" in next[0])) {
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
      const token = localStorage.getItem("admin_token") || localStorage.getItem("token");
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
        throw new Error(data.detail || "Disease analysis failed.");
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
          className="text-xs text-emerald-600 hover:underline font-semibold mb-1 cursor-pointer"
        >
          ← Back to Plant Details
        </button>
        <h2 className="text-[#1f2937] text-2xl font-extrabold">
          Disease Diagnostics — {selectedPlant.plant_name}
        </h2>
        <p className="text-gray-500 text-sm">
          Upload leaf imagery and integrate recent NPK cocopeat telemetry for AI disease detection.
        </p>
      </div>

      {/* Main Grid: Upload Slot (5 cols) + Telemetry Table (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Image Upload Area (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-5 rounded-xl text-center flex flex-col justify-center min-h-[260px]">
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
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xl shadow-2xs">
                🍃
              </div>
              <span className="text-sm font-bold text-emerald-800">
                Click or drag leaf photo to upload
              </span>
              <span className="text-xs text-gray-500">Supports JPG, PNG</span>
            </label>

            {previewUrl && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                <img
                  src={previewUrl}
                  alt="Selected Leaf Preview"
                  className="w-full max-h-56 mx-auto rounded-lg border shadow-xs object-cover"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 text-rose-700 border border-rose-200 text-xs p-3 rounded-lg text-center font-medium">
              {error}
            </div>
          )}

          <button
            onClick={handleRunAnalysis}
            disabled={analyzing || !selectedFile}
            className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-3.5 rounded-xl transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
          >
            {analyzing ? "Running Multi-Model Disease Ensemble..." : "Run Disease Diagnostics"}
          </button>
        </div>

        {/* Right Column: Last 7 Days of NPK Readings (7 cols) */}
        <div className="lg:col-span-7 border border-gray-200 rounded-xl p-4 bg-gray-50/50 flex flex-col h-[380px]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-800 text-sm">
              Cocopeat NPK History (Last 7 Days)
            </h3>
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md">
              {npkReadings.length} reading(s)
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Recent 7-day readings identify recent nutrient imbalances correlated with fungal/bacterial leaf symptoms.
          </p>

          {!loadingNpk && uniqueReadingDays(npkReadings) < 7 && (
            <div className="mb-2 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-950 text-xs font-semibold">
              {npkReadings.length === 0
                ? "No NPK readings recorded in the last 7 days."
                : `Active window: ${uniqueReadingDays(npkReadings)} of 7 days recorded.`}
            </div>
          )}

          {loadingNpk ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
              Loading NPK telemetry...
            </div>
          ) : npkReadings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-xs text-gray-400 p-4 text-center">
              <span>No NPK readings recorded for this plant yet.</span>
              <span className="text-[11px] text-gray-400 mt-1">Standard baseline nutrient parameters will be applied.</span>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 rounded-lg border border-gray-200 bg-white shadow-2xs">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-100 text-gray-600 uppercase sticky top-0 text-[10px] font-bold">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Date & Time</th>
                    <th className="px-3 py-2">Slot</th>
                    <th className="px-3 py-2 text-right">Nitrogen (N)</th>
                    <th className="px-3 py-2 text-right">Phosphorus (P)</th>
                    <th className="px-3 py-2 text-right">Potassium (K)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {npkReadings.map((r, i) => {
                    const nVal = r.nitrogen_n ?? r.nitrogen ?? r.N ?? 0;
                    const pVal = r.phosphorus_p ?? r.phosphorous ?? r.P ?? 0;
                    const kVal = r.potassium_k ?? r.potassium ?? r.K ?? 0;
                    const slot = r.time_slot ? r.time_slot.charAt(0).toUpperCase() + r.time_slot.slice(1) : "Auto";

                    return (
                      <tr key={r.reading_id || i} className="hover:bg-emerald-50/20">
                        <td className="px-3 py-2 text-gray-400 font-sans">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-500 font-sans text-[11px]">
                          {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 font-medium font-sans text-gray-700">{slot}</td>
                        <td className="px-3 py-2 font-bold text-emerald-700 text-right">{nVal} mg/kg</td>
                        <td className="px-3 py-2 font-bold text-amber-700 text-right">{pVal} mg/kg</td>
                        <td className="px-3 py-2 font-bold text-rose-700 text-right">{kVal} mg/kg</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Analysis Output Section */}
      {analysisResult && (
        <div className="border-t pt-6 space-y-6 animate-fade-in max-w-4xl mx-auto">
          <h3 className="text-xl font-extrabold text-gray-900">Diagnostic Verdict & Results</h3>

          {/* Verdict Banner */}
          <div
            className={`p-5 rounded-2xl text-center text-white font-extrabold text-xl shadow-md ${
              analysisResult.verdict === "HEALTHY"
                ? "bg-gradient-to-r from-emerald-600 to-green-500"
                : "bg-gradient-to-r from-rose-600 to-red-500"
            }`}
          >
            {analysisResult.verdict_msg || (analysisResult.verdict === "HEALTHY" ? "Plant Leaf is Healthy" : `Disease Detected: ${analysisResult.disease_name}`)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Detection Specs & Treatment */}
            <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/60 space-y-4 shadow-2xs">
              <div className="flex justify-between items-center">
                <h4 className="font-extrabold text-sm text-gray-800">Detection Confidence</h4>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                  {analysisResult.disease_info || analysisResult.disease_name}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-gray-700">
                  <span>Confidence Rating</span>
                  <span className="text-emerald-700 text-sm">{analysisResult.confidence}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-emerald-600 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${analysisResult.confidence}%` }}
                  ></div>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200">
                <h5 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-2">Recommended Treatment Protocol:</h5>
                <ul className="space-y-2">
                  {analysisResult.treatment?.map((t, idx) => (
                    <li
                      key={idx}
                      className={`text-xs font-semibold leading-relaxed px-3 py-2.5 rounded-lg border flex items-start gap-2 ${
                        analysisResult.verdict === "HEALTHY"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : "bg-amber-50 border-amber-300 text-amber-950"
                      }`}
                    >
                      <span className="font-bold text-emerald-600">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* NPK Snapshot & Environmental Advice */}
            <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/60 space-y-4 shadow-2xs">
              <h4 className="font-extrabold text-sm text-gray-800">NPK Cocopeat Context</h4>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 border border-emerald-200 rounded-xl bg-white shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Nitrogen</span>
                  <span className="font-extrabold text-emerald-700 text-sm">
                    {analysisResult.npk_reading?.nitrogen ?? analysisResult.npk?.N ?? "—"} mg/kg
                  </span>
                </div>
                <div className="p-3 border border-amber-200 rounded-xl bg-white shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Phosphorus</span>
                  <span className="font-extrabold text-amber-700 text-sm">
                    {analysisResult.npk_reading?.phosphorous ?? analysisResult.npk?.P ?? "—"} mg/kg
                  </span>
                </div>
                <div className="p-3 border border-rose-200 rounded-xl bg-white shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Potassium</span>
                  <span className="font-extrabold text-rose-700 text-sm">
                    {analysisResult.npk_reading?.potassium ?? analysisResult.npk?.K ?? "—"} mg/kg
                  </span>
                </div>
              </div>

              {analysisResult.npk_advice && (
                <div className="pt-2 border-t border-gray-200">
                  <h5 className="font-bold text-xs text-gray-700 uppercase tracking-wider mb-2">Nutrient Balancing Advice:</h5>
                  <ul className="space-y-1.5 text-xs text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
                    {analysisResult.npk_advice.map((adv, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span>{adv}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Annotated Result Image */}
          {analysisResult.result_image && (
            <div className="p-5 border border-gray-200 rounded-2xl bg-gray-50 text-center space-y-3 shadow-xs">
              <h4 className="font-extrabold text-sm text-gray-800">
                AI Detection Output (Bounding Box Localization)
              </h4>
              <img
                src={`data:image/jpeg;base64,${analysisResult.result_image}`}
                alt="AI Detection Annotation"
                className="max-h-96 mx-auto rounded-xl border shadow-sm object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}