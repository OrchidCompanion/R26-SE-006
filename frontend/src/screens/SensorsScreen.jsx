import React from "react";

export default function SensorsScreen() {
  return (
    <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm">
      <h2 className="text-[#1f2937] text-xl font-bold mb-2">
        DHT11 Sensor Telemetry
      </h2>
      <p className="text-[#6b7280] text-sm mb-6">
        Real-time temperature and humidity readings from active monitoring nodes.
      </p>

      {/* Placeholder table for telemetry data */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-[#1f2937]">
          <thead className="bg-[#f9fafb] text-[#6b7280] uppercase text-xs">
            <tr>
              <th className="px-4 py-3">Plant ID</th>
              <th className="px-4 py-3">Temperature (°C)</th>
              <th className="px-4 py-3">Humidity (%)</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">Plant #1</td>
              <td className="px-4 py-3">28.5 °C</td>
              <td className="px-4 py-3">65 %</td>
              <td className="px-4 py-3 text-xs text-gray-500">Just now</td>
              <td className="px-4 py-3">
                <span className="px-2 py-1 bg-[#ecfdf5] text-[#059669] text-xs font-semibold rounded-full">
                  Active
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}