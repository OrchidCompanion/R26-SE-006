import React, { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Login failed");
      }

      if (data.user.role !== "admin") {
        throw new Error("Access denied. Admin rights required.");
      }

      localStorage.setItem("admin_token", data.access_token);
      localStorage.setItem("admin_user", JSON.stringify(data.user));

      onLoginSuccess(data.access_token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#059669] flex flex-col justify-between items-center p-12">
      {/* Header */}
      <div className="text-center mt-10">
        <h1 className="text-white text-4xl sm:text-5xl font-extrabold tracking-tight">
          Orchid<span className="text-[#ecfdf5]">Companion</span>
        </h1>
        <p className="text-[#ecfdf5] text-base font-medium mt-2">
          Smart Orchid Care & Diagnostics Admin Portal
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="text-[#1f2937] text-2xl font-bold mb-6 text-center">
          Admin Login
        </h2>

        {error && (
          <div className="bg-[#fef2f2] text-[#dc2626] p-3 rounded-lg text-sm mb-4 text-center border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[#1f2937] text-sm font-semibold mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@orchidcompanion.com"
              className="w-full px-3 py-2 rounded-lg border border-[#e5e7eb] focus:outline-none focus:ring-2 focus:ring-[#059669] text-base"
            />
          </div>

          <div>
            <label className="block text-[#1f2937] text-sm font-semibold mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-lg border border-[#e5e7eb] focus:outline-none focus:ring-2 focus:ring-[#059669] text-base"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-3 rounded-lg transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed shadow-md mt-2"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center">
        <p className="text-[#ecfdf5] text-xs tracking-widest uppercase opacity-80">
          R26-SE-006
        </p>
      </div>
    </div>
  );
}