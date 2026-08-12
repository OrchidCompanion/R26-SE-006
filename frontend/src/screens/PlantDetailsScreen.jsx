import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function PlantDetailsScreen({ selectedPlant, selectedUser, onBack }) {
  const [activeTab, setActiveTab] = useState("dht11"); // 'dht11' | 'bh1750' | 'npk' | 'disease' | 'fertilizer' | 'bloom'
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const LIMIT = 10;

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    fetchTabData();
  }, [activeTab, page, selectedPlant]);

  const fetchTabData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      let endpoint = "";

      if (activeTab === "dht11") endpoint = `${API_BASE_URL}/sensors/dht11/plant/${selectedPlant.plant_id}?page=${page}&limit=${LIMIT}`;
      if (activeTab === "bh1750") endpoint = `${API_BASE_URL}/sensors/bh1750/plant/${selectedPlant.plant_id}?page=${page}&limit=${LIMIT}`;
      if (activeTab === "npk") endpoint = `${API_BASE_URL}/sensors/npk/plant/${selectedPlant.plant_id}?page=${page}&limit=${LIMIT}`;
      if (activeTab === "disease") endpoint = `${API_BASE_URL}/disease/plant/${selectedPlant.plant_id}?page=${page}&limit=${LIMIT}`;
      if (activeTab === "fertilizer") endpoint = `${API_BASE_URL}/fertilizer/plant/${selectedPlant.plant_id}?page=${page}&limit=${LIMIT}`;
      if (activeTab === "bloom") endpoint = `${API_BASE_URL}/bloom/plant/${selectedPlant.plant_id}?page=${page}&limit=${LIMIT}`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const responseData = await res.json();
        // Check if response is paginated object { data, total } or array
        if (responseData.data && Array.isArray(responseData.data)) {
          setData(responseData.data);
          setTotal(responseData.total || responseData.data.length);
        } else if (Array.isArray(responseData)) {
          setData(responseData);
          setTotal(responseData.length);
        }
      } else {
        setData([]);
        setTotal(0);
      }
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT) || 1;

  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <button
          onClick={onBack}
          className="text-xs text-emerald-600 hover:underline font-semibold mb-1"
        >
          ← Back to Plants
        </button>
        <h2 className="text-[#1f2937] text-2xl font-extrabold">{selectedPlant.plant_name}</h2>
        <div className="flex space-x-4 text-xs text-gray-500 mt-1">
          <span>Species: <strong className="text-gray-700">{selectedPlant.plant_species}</strong></span>
          <span>Location: <strong className="text-gray-700">{selectedPlant.plant_location}</strong></span>
          <span>Owner: <strong className="text-gray-700">{selectedUser.first_name} {selectedUser.last_name}</strong></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {[
          { id: "dht11", label: "DHT11 Temp/Humidity" },
          { id: "bh1750", label: "BH1750 Light" },
          { id: "npk", label: "NPK Soil Sensor" },
          { id: "disease", label: "Disease AI Outputs" },
          { id: "fertilizer", label: "Fertilizer Schedule" },
          { id: "bloom", label: "Bloom Predictions" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${activeTab === tab.id
                ? "bg-[#059669] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table Content */}
      {loading ? (
        <p className="text-gray-400 text-sm py-4">Loading data...</p>
      ) : data.length === 0 ? (
        <p className="text-gray-500 text-sm py-4">No records logged for this category yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#1f2937]">
            <thead className="bg-[#f9fafb] text-[#6b7280] uppercase text-xs border-b border-gray-200">
              <tr>
                {activeTab === "dht11" && (
                  <>
                    <th className="px-4 py-3">Temperature (°C)</th>
                    <th className="px-4 py-3">Humidity (%)</th>
                    <th className="px-4 py-3">Module ID</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </>
                )}
                {activeTab === "bh1750" && (
                  <>
                    <th className="px-4 py-3">Light Level (Lux)</th>
                    <th className="px-4 py-3">Module ID</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </>
                )}
                {activeTab === "npk" && (
                  <>
                    <th className="px-4 py-3">Nitrogen (N)</th>
                    <th className="px-4 py-3">Phosphorus (P)</th>
                    <th className="px-4 py-3">Potassium (K)</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </>
                )}
                {activeTab === "disease" && (
                  <>
                    <th className="px-4 py-3">Verdict</th>
                    <th className="px-4 py-3">Disease Name</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Annotated Image</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </>
                )}
                {activeTab === "fertilizer" && (
                  <>
                    <th className="px-4 py-3">Fertilizer Type</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </>
                )}
                {activeTab === "bloom" && (
                  <>
                    <th className="px-4 py-3">Bloom Prediction</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  {activeTab === "dht11" && (
                    <>
                      <td className="px-4 py-3 font-semibold">{row.temperature} °C</td>
                      <td className="px-4 py-3">{row.humidity} %</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{row.module_id || "N/A"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                    </>
                  )}
                  {activeTab === "bh1750" && (
                    <>
                      <td className="px-4 py-3 font-semibold">{row.lux_lx || row.lux} Lux</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{row.module_id || "N/A"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                    </>
                  )}
                  {activeTab === "npk" && (
                    <>
                      <td className="px-4 py-3 font-semibold text-emerald-700">{row.nitrogen_n} mg/kg</td>
                      <td className="px-4 py-3 font-semibold text-amber-700">{row.phosphorus_p} mg/kg</td>
                      <td className="px-4 py-3 font-semibold text-rose-700">{row.potassium_k} mg/kg</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                    </>
                  )}
                  {activeTab === "disease" && (
                    <>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${row.verdict === "HEALTHY" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                          {row.verdict}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{row.disease_name}</td>
                      <td className="px-4 py-3 font-bold">{row.confidence}%</td>
                      <td className="px-4 py-3">
                        {row.result_image_b64 ? (
                          <button
                            onClick={() => setSelectedImage(`data:image/jpeg;base64,${row.result_image_b64}`)}
                            className="px-2 py-1 bg-sky-100 text-sky-700 rounded text-xs font-semibold hover:bg-sky-200"
                          >
                            Preview Image 🔍
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">No Image</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                    </>
                  )}
                  {activeTab === "fertilizer" && (
                    <>
                      <td className="px-4 py-3 font-semibold">{row.fertilizer}</td>
                      <td className="px-4 py-3">{row.qty}</td>
                      <td className="px-4 py-3">{row.unit}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                    </>
                  )}
                  {activeTab === "bloom" && (
                    <>
                      <td className="px-4 py-3 font-semibold">{row.bloom_status || row.prediction}</td>
                      <td className="px-4 py-3 text-xs">{row.status || "Completed"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex justify-between items-center border-t pt-4 text-xs">
        <span className="text-gray-500">
          Showing Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total items)
        </span>
        <div className="space-x-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            ← Previous
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-4 rounded-xl max-w-2xl w-full">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-gray-800">YOLO Disease Detection Result</h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-500 font-bold hover:text-gray-800 text-lg"
              >
                ✕
              </button>
            </div>
            <img src={selectedImage} alt="Annotated Leaf" className="w-full rounded-lg border max-h-[70vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}