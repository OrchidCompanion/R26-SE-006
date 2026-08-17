import React, { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverStatus, setServerStatus] = useState("checking");

  useEffect(() => {
    let isMounted = true;

    const checkServerHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (res.ok) {
          if (isMounted) setServerStatus("connected");
        } else {
          if (isMounted) setServerStatus("error");
        }
      } catch {
        if (isMounted) setServerStatus("error");
      }
    };

    checkServerHealth();
    const interval = setInterval(checkServerHealth, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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
    <div className="relative min-h-screen bg-[#059669] flex flex-col justify-between items-center p-8 sm:p-12">
      {/* Full Screen Loading Animation Overlay */}
      {serverStatus === "checking" && (
        <div className="fixed inset-0 z-50 bg-[#047857]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="relative flex items-center justify-center mb-6">
            <div className="w-20 h-20 border-4 border-emerald-200 border-t-white rounded-full animate-spin"></div>
            <span className="absolute text-2xl">🌸</span>
          </div>
          <h2 className="text-white text-2xl sm:text-3xl font-extrabold tracking-tight">
            Waking OrchidCompanion Server...
          </h2>
          <p className="text-emerald-100 text-sm mt-2 max-w-sm">
            Spinning up backend microservices and database link. Please wait a moment.
          </p>
          <div className="mt-6 flex items-center space-x-2 text-xs text-emerald-200">
            <span className="w-2.5 h-2.5 bg-amber-300 rounded-full animate-ping"></span>
            <span>Establishing secure cloud handshake</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center mt-6">
        <h1 className="text-white text-4xl sm:text-5xl font-extrabold tracking-tight">
          Orchid<span className="text-[#ecfdf5]">Companion</span>
        </h1>
        <p className="text-[#ecfdf5] text-base font-medium mt-2">
          Smart Orchid Care & Diagnostics Admin Portal
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl my-auto">
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
            disabled={loading || serverStatus === "checking"}
            className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-3 rounded-lg transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed shadow-md mt-2"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="text-center mt-6">
        <p className="text-[#ecfdf5] text-xs tracking-widest uppercase opacity-80">
          R26-SE-006
        </p>
      </div>

      {/* Status indicator */}
      {serverStatus === "error" && (
        <div className="fixed bottom-4 right-4 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-full shadow-lg text-xs font-semibold flex items-center space-x-2">
          <span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
          <span>Backend Unavailable</span>
        </div>
      )}
    </div>
  );
}