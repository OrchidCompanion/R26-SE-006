import React from "react";

export default function DashboardScreen({ user }) {
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-[#e5e7eb] shadow-sm">
        <h2 className="text-[#1f2937] text-xl font-bold mb-4">System Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-4 bg-[#ecfdf5] rounded-lg border border-[#10b981]/20">
            <h3 className="text-[#059669] text-sm font-semibold">User Role</h3>
            <p className="text-[#1f2937] text-xl font-extrabold mt-1 uppercase">
              {user.role}
            </p>
          </div>
          <div className="p-4 bg-[#ecfdf5] rounded-lg border border-[#10b981]/20">
            <h3 className="text-[#059669] text-sm font-semibold">Account Status</h3>
            <p className="text-[#10b981] text-xl font-extrabold mt-1 uppercase">
              {user.status}
            </p>
          </div>
          <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
            <h3 className="text-[#0284c7] text-sm font-semibold">Admin Account</h3>
            <p className="text-[#1f2937] text-base font-semibold mt-1 truncate">
              {user.email}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}