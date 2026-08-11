import React, { useState } from "react";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import SensorsScreen from "./screens/SensorsScreen";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("admin_token") || null);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("admin_user") || "null"));
  const [activeTab, setActiveTab] = useState("dashboard");

  const handleLoginSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    setToken(null);
    setUser(null);
  };

  if (!token || !user) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="bg-[#f9fafb] min-h-screen text-[#1f2937]">
      {/* Admin Navigation Bar */}
      <header className="bg-[#059669] text-white px-8 py-4 flex flex-col md:flex-row justify-between items-center shadow-md gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-wide">
            Orchid<span className="text-[#ecfdf5]">Companion</span>
          </h1>
          <p className="text-xs text-[#ecfdf5]/80">Admin Management Portal</p>
        </div>

        {/* Tab Links */}
        <nav className="flex items-center space-x-2 bg-[#047857] p-1 rounded-lg">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition ${
              activeTab === "dashboard"
                ? "bg-white text-[#059669] shadow-sm"
                : "text-white hover:bg-white/10"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("sensors")}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition ${
              activeTab === "sensors"
                ? "bg-white text-[#059669] shadow-sm"
                : "text-white hover:bg-white/10"
            }`}
          >
            Sensors
          </button>
        </nav>

        {/* User Info & Logout */}
        <div className="flex items-center space-x-4">
          <span className="text-sm">
            Welcome, <strong>{user.first_name} {user.last_name}</strong>
          </span>
          <button
            onClick={handleLogout}
            className="bg-[#dc2626] hover:bg-red-700 text-white font-semibold text-xs px-4 py-2 rounded-md shadow transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto p-8">
        {activeTab === "dashboard" && <DashboardScreen user={user} />}
        {activeTab === "sensors" && <SensorsScreen />}
      </main>
    </div>
  );
}