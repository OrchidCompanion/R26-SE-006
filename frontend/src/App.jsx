import React, { useState } from "react";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import PlantsScreen from "./screens/PlantsScreen";
import PlantDetailsScreen from "./screens/PlantDetailsScreen";
import IdentifySpecies from "./screens/IdentifySpecies";
import AnalayseLocation from "./screens/AnalayseLocation";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("admin_token") || null);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("admin_user") || "null"));
  const [activeTab, setActiveTab] = useState("dashboard");

  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedPlant, setSelectedPlant] = useState(null);

  const handleLoginSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    setToken(null);
    setUser(null);
    setSelectedUser(null);
    setSelectedPlant(null);
  };

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setActiveTab("plants");
  };

  const handleSelectPlant = (p) => {
    setSelectedPlant(p);
    setActiveTab("plant_details");
  };

  if (!token || !user) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="bg-[#f9fafb] min-h-screen text-[#1f2937]">
      <header className="bg-[#059669] text-white px-8 py-4 flex flex-col md:flex-row justify-between items-center shadow-md gap-4">
        <div>
          <h1
            onClick={() => {
              setSelectedUser(null);
              setSelectedPlant(null);
              setActiveTab("dashboard");
            }}
            className="text-2xl font-extrabold tracking-wide cursor-pointer"
          >
            Orchid<span className="text-[#ecfdf5]">Companion</span>
          </h1>
          <p className="text-xs text-[#ecfdf5]/80">Admin Management Portal</p>
        </div>

        {/* User Profile & Logout */}
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

      {/* Main Content View */}
      <main className="max-w-6xl mx-auto p-8">
        {activeTab === "dashboard" && (
          <DashboardScreen
            user={user}
            onSelectUser={handleSelectUser}
            onNavigateToIdentifySpecies={() => setActiveTab("identify_species")}
            onNavigateToAnalyseLocation={() => setActiveTab("analyse_location")}
          />
        )}
        {activeTab === "plants" && selectedUser && (
          <PlantsScreen
            selectedUser={selectedUser}
            onSelectPlant={handleSelectPlant}
            onBack={() => setActiveTab("dashboard")}
          />
        )}
        {activeTab === "plant_details" && selectedPlant && (
          <PlantDetailsScreen
            selectedPlant={selectedPlant}
            selectedUser={selectedUser}
            onBack={() => setActiveTab("plants")}
          />
        )}
        {activeTab === "identify_species" && (
          <IdentifySpecies onBack={() => setActiveTab("dashboard")} />
        )}
        {activeTab === "analyse_location" && (
          <AnalayseLocation onBack={() => setActiveTab("dashboard")} />
        )}
      </main>
    </div>
  );
}