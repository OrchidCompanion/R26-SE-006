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
          Upload leaf imagery and combine with latest NPK cocopeat readings for AI detection.
        </p>
      </div>

      {/* 5 / 7 Column Split to reduce upload area width */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Image Upload Area (5 cols) */}
        <div className="lg:col-span-5 space-y-2">
          <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/40 py-4 px-4 rounded-xl text-center">
            <input
              type="file"
              id="leafImageInput"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="leafImageInput"
              className="cursor-pointer flex flex-col items-center justify-center"
            >
              <span className="text-sm font-bold text-emerald-700">
                Click leaf image to upload
              </span>
            </label>

            {previewUrl && (
              <div className="mt-2 pt-3 border-t border-emerald-200">
                <img
                  src={previewUrl}
                  alt="Selected Leaf"
                  className="max-h-40 max-w-[180px] w-auto mx-auto rounded-lg border shadow-xs object-contain"
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
        <div className="lg:col-span-7 border border-gray-200 rounded-xl p-4 bg-white flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="font-bold text-[#1e3a5f] text-sm">
              Cocopeat NPK History (Last 7 Days)
            </h3>
            <span className="shrink-0 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
              {loadingNpk ? "…" : `${npkReadings.length} reading(s)`}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Recent 7-day readings identify recent nutrient imbalances correlated with fungal/bacterial leaf symptoms.
          </p>

          {!loadingNpk && uniqueReadingDays(npkReadings) < 7 && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs font-medium">
              {npkReadings.length === 0
                ? "No readings this week."
                : `Need more readings (${uniqueReadingDays(npkReadings)}/7 days).`}
            </div>
          )}

          {loadingNpk ? (
            <p className="text-xs text-gray-400 my-auto text-center">Loading…</p>
          ) : npkReadings.length === 0 ? (
            <p className="text-xs text-gray-400 my-auto text-center">No NPK readings this week.</p>
          ) : (
            <div className="h-80 overflow-y-auto overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-[#1e3a5f] uppercase sticky top-0 z-10">
                  <tr>
                    <th className="px-2.5 py-2 text-left font-semibold">#</th>
                    <th className="px-2.5 py-2 text-left font-semibold">Date & Time</th>
                    <th className="px-2.5 py-2 text-left font-semibold">Slot</th>
                    <th className="px-2.5 py-2 text-center font-semibold">Nitrogen (N)</th>
                    <th className="px-2.5 py-2 text-center font-semibold">Phosphorus (P)</th>
                    <th className="px-2.5 py-2 text-center font-semibold">Potassium (K)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {npkReadings.map((r, i) => (
                    <tr key={r.reading_id || i} className="hover:bg-gray-50">
                      <td className="px-2.5 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-2.5 py-2 text-gray-500 whitespace-nowrap">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString("en-US", {
                              month: "numeric",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-2.5 py-2 font-medium text-[#1e3a5f]">
                        {r.time_slot
                          ? r.time_slot.charAt(0).toUpperCase() + r.time_slot.slice(1)
                          : "—"}
                      </td>
                      <td className="px-2.5 py-2 text-center text-emerald-700">
                        <span className="block font-bold">{r.nitrogen_n ?? "—"}</span>
                        <span className="block text-[10px] font-medium">mg/kg</span>
                      </td>
                      <td className="px-2.5 py-2 text-center text-amber-700">
                        <span className="block font-bold">{r.phosphorus_p ?? "—"}</span>
                        <span className="block text-[10px] font-medium">mg/kg</span>
                      </td>
                      <td className="px-2.5 py-2 text-center text-rose-700">
                        <span className="block font-bold">{r.potassium_k ?? "—"}</span>
                        <span className="block text-[10px] font-medium">mg/kg</span>
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
                <h5 className="font-bold text-xs text-gray-600 mb-2">Recommended Treatment:</h5>
                <ul className="space-y-2">
                  {analysisResult.treatment?.map((t, idx) => (
                    <li
                      key={idx}
                      className={`text-xs font-semibold leading-snug px-3 py-2 rounded-lg border ${
                        analysisResult.verdict === "HEALTHY"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : "bg-amber-50 border-amber-300 text-amber-950"
                      }`}
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* NPK Snapshot & Advice */}
            <div className="p-4 border rounded-xl bg-gray-50 space-y-4">
              <h4 className="font-bold text-sm text-gray-700">NPK Cocopeat Context</h4>

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
              </div>

              {analysisResult.npk_window && (
                <div className="pt-3 border-t">
                  <h5 className="font-bold text-xs text-gray-600 mb-1">
                    Last {analysisResult.npk_window.days || 7} days ({analysisResult.npk_window.sample_size} readings
                    {analysisResult.npk_window.days_covered != null
                      ? `, ${analysisResult.npk_window.days_covered} day(s) covered`
                      : ""}
                    )
                    {analysisResult.npk_window.skipped_all_zero
                      ? ` (${analysisResult.npk_window.used} used, ${analysisResult.npk_window.skipped_all_zero} all-zero skipped)`
                      : ""}
                  </h5>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Avg N/P/K is the mean of last-7-day readings. Status uses
                    N 25–65, P 15–35, K 50–130. Older month-start readings are excluded.
                  </p>
                  {analysisResult.npk_window.sufficient === false && (
                    <div className="mb-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-950 text-xs font-semibold">
                      {analysisResult.npk_window.prompt ||
                        "Not enough NPK readings for a full 7-day window. Please take more cocopeat NPK readings."}
                    </div>
                  )}
                  {analysisResult.npk_window.deficiency_msg && (
                    <div
                      className={`mb-2 px-3 py-2 rounded-lg border text-xs font-bold ${
                        analysisResult.npk_window.has_deficiency
                          ? "bg-rose-50 border-rose-300 text-rose-900"
                          : "bg-emerald-50 border-emerald-200 text-emerald-900"
                      }`}
                    >
                      {analysisResult.npk_window.deficiency_msg}
                    </div>
                  )}
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