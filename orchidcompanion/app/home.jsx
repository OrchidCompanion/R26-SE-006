import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSelector } from "react-redux";
import {
  User,
  Plus,
  MapPin,
  RefreshCw,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  Radio,
  Clock,
  Sparkles,
  Compass,
  Flower2,
  Thermometer,
  Droplets,
  Sun,
  Layers,
  Activity,
  Check,
} from "lucide-react-native";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";
import PlantCard from "../src/components/PlantCard";

export default function HomeScreen() {
  const router = useRouter();
  const { user, token } = useSelector((state) => state.auth);

  const [locations, setLocations] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sensor Hardware State
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [sensorStatus, setSensorStatus] = useState(null);

  // 1-Minute Burst Sampling State (3 samples across 60 seconds)
  const [samplingSlotKey, setSamplingSlotKey] = useState(null);
  const [countdown, setCountdown] = useState(60);
  const [burstSamplesCount, setBurstSamplesCount] = useState(0);
  const timerRef = useRef(null);

  // Staged Telemetry Averages: { [slotKey]: { temp, hum, lux, timestamp, submitted } }
  const [stagedReadings, setStagedReadings] = useState({});
  const [submittingSlotKey, setSubmittingSlotKey] = useState(null);

  // Zone Active Time Slot Tabs: { [locationId]: "morning" | "afternoon" | "evening" }
  const [activeZoneSlots, setActiveZoneSlots] = useState({});

  // Location Modals & Edit States
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationName, setLocationName] = useState("");
  const [locationDesc, setLocationDesc] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  // Plant Modal States
  const [showPlantModal, setShowPlantModal] = useState(false);
  const [targetLocationId, setTargetLocationId] = useState("");
  const [plantName, setPlantName] = useState("");
  const [plantSpecies, setPlantSpecies] = useState("Dendrobium");
  const [savingPlant, setSavingPlant] = useState(false);

  const getZoneSlot = (locId) => activeZoneSlots[locId] || "morning";
  const setZoneSlot = (locId, slot) =>
    setActiveZoneSlots((prev) => ({ ...prev, [locId]: slot }));

  const loadData = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const headers = getAuthHeaders(token);
      const [locRes, plantRes, modRes] = await Promise.all([
        fetch(`${API_BASE_URL}/locations/user/${user.user_id}`, { headers }),
        fetch(`${API_BASE_URL}/plants/user/${user.user_id}`, { headers }),
        fetch(`${API_BASE_URL}/sensors/modules/user/${user.user_id}`, { headers }),
      ]);

      if (locRes.ok) setLocations(await locRes.json());
      if (plantRes.ok) setPlants(await plantRes.json());
      if (modRes.ok) {
        const modData = await modRes.json();
        setModules(modData);
        if (modData.length > 0 && !selectedModuleId) {
          const envMod = modData.find(
            (m) => m.module_id === "2884858a2b4c" || m.device_name?.toLowerCase().includes("env")
          );
          setSelectedModuleId(envMod ? envMod.module_id : modData[0].module_id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, token, selectedModuleId]);

  useEffect(() => {
    loadData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Hardware Status Check
  const handleCheckSensorStatus = async () => {
    if (!selectedModuleId) return;
    setCheckingStatus(true);
    setSensorStatus(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/sensors/modules/${selectedModuleId}/status`,
        { headers: getAuthHeaders(token) }
      );
      if (res.ok) {
        setSensorStatus(await res.json());
      } else {
        setSensorStatus({ online: false, dht11: false, bh1750: false, msg: "Module unreachable." });
      }
    } catch {
      setSensorStatus({ online: false, dht11: false, bh1750: false, msg: "Connection error." });
    } finally {
      setCheckingStatus(false);
    }
  };

  // 30-Second 3-Sample Burst Ambient Telemetry Sampling (1s, 15s, 28s)
  const handleStartBurstSampling = (locationId, slot) => {
    if (!selectedModuleId) {
      Alert.alert("Hardware Notice", "Please choose an ESP32 sensor module above.");
      return;
    }

    if (sensorStatus && !sensorStatus.online) {
      Alert.alert(
        "Module Offline",
        "Cannot start sampling: Sensor module is offline. Please power on the ESP32 and check status."
      );
      return;
    }

    const slotKey = `${locationId}_${slot}`;
    setSamplingSlotKey(slotKey);
    setCountdown(30);
    setBurstSamplesCount(0);

    let secondsLeft = 30;
    const collected = [];

    const fetchSingleSample = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-ambient`,
          { headers: getAuthHeaders(token) }
        );
        if (res.ok) {
          const data = await res.json();
          return {
            temp: Number(data.temperature),
            hum: Number(data.humidity),
            lux: Number(data.lux),
          };
        }
      } catch (err) {
        console.warn("Burst sample read failed:", err);
      }
      return null;
    };

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(async () => {
      secondsLeft -= 1;
      setCountdown(secondsLeft);
      const elapsed = 30 - secondsLeft;

      // 1st reading at 1st second, 2nd reading at 15th second, 3rd reading at 28th second
      if (elapsed === 1 || elapsed === 15 || elapsed === 28) {
        const sample = await fetchSingleSample();
        if (sample) {
          collected.push(sample);
          setBurstSamplesCount(collected.length);
        }
      }

      if (secondsLeft <= 0) {
        clearInterval(timerRef.current);
        setSamplingSlotKey(null);

        if (collected.length > 0) {
          const avgTemp = Number(
            (collected.reduce((acc, r) => acc + r.temp, 0) / collected.length).toFixed(1)
          );
          const avgHum = Number(
            (collected.reduce((acc, r) => acc + r.hum, 0) / collected.length).toFixed(1)
          );
          const avgLux = Number(
            (collected.reduce((acc, r) => acc + r.lux, 0) / collected.length).toFixed(0)
          );

          setStagedReadings((prev) => ({
            ...prev,
            [slotKey]: {
              temp: avgTemp,
              hum: avgHum,
              lux: avgLux,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              submitted: false,
            },
          }));
        } else {
          Alert.alert("Sampling Error", `Could not read valid sensor data for ${slot}.`);
        }
      }
    }, 1000);
  };

  // Submit Staged Reading to Supabase
  const handleSubmitReading = async (locationId, slot) => {
    const slotKey = `${locationId}_${slot}`;
    const reading = stagedReadings[slotKey];
    if (!reading) return;

    setSubmittingSlotKey(slotKey);
    try {
      const headers = getAuthHeaders(token);
      await Promise.all([
        fetch(`${API_BASE_URL}/sensors/dht11`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            temperature: reading.temp,
            humidity: reading.hum,
            time_slot: slot,
            location_id: locationId,
            module_id: selectedModuleId,
          }),
        }),
        fetch(`${API_BASE_URL}/sensors/bh1750`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            lux: reading.lux,
            time_slot: slot,
            location_id: locationId,
            module_id: selectedModuleId,
          }),
        }),
      ]);

      setStagedReadings((prev) => ({
        ...prev,
        [slotKey]: { ...prev[slotKey], submitted: true },
      }));
      Alert.alert("Success", `${slot.toUpperCase()} telemetry stored in database.`);
    } catch {
      Alert.alert("Error", `Failed to save ${slot} reading.`);
    } finally {
      setSubmittingSlotKey(null);
    }
  };

  // Location CRUD Operations
  const handleSaveLocation = async () => {
    if (!locationName.trim()) {
      Alert.alert("Error", "Location zone name is required.");
      return;
    }

    setSavingLocation(true);
    try {
      const headers = getAuthHeaders(token);
      const isEdit = Boolean(editingLocation);
      const url = isEdit
        ? `${API_BASE_URL}/locations/${editingLocation.location_id}`
        : `${API_BASE_URL}/locations`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          location_name: locationName.trim(),
          description: locationDesc.trim(),
          user_id: user.user_id,
        }),
      });

      if (res.ok) {
        setShowLocationModal(false);
        setEditingLocation(null);
        setLocationName("");
        setLocationDesc("");
        loadData();
      } else {
        const d = await res.json();
        Alert.alert("Error", d.detail || "Failed to save location.");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeleteLocation = (loc) => {
    Alert.alert(
      "Delete Location",
      `Are you sure you want to delete "${loc.location_name}"? Plants inside will be unassigned.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/locations/${loc.location_id}`, {
                method: "DELETE",
                headers: getAuthHeaders(token),
              });
              if (res.ok) loadData();
            } catch (err) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ]
    );
  };

  // Plant CRUD Operations
  const handleCreatePlant = async () => {
    if (!plantName.trim()) {
      Alert.alert("Error", "Plant identifier is required.");
      return;
    }

    setSavingPlant(true);
    try {
      const res = await fetch(`${API_BASE_URL}/plants`, {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          plant_name: plantName.trim(),
          plant_species: plantSpecies,
          location_id: targetLocationId || null,
          user_id: user.user_id,
        }),
      });

      if (res.ok) {
        setShowPlantModal(false);
        setPlantName("");
        setPlantSpecies("Dendrobium");
        setTargetLocationId("");
        loadData();
      } else {
        const d = await res.json();
        Alert.alert("Error", d.detail || "Failed to create plant.");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSavingPlant(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#f8fafc" }}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        <View className="px-5 pt-3 pb-8">
          {/* 1. HERO GREETING & STATS CARD */}
          <View className="bg-white rounded-3xl p-5 mb-5 border border-emerald-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-1 mr-3">
                <View className="flex-row items-center gap-1.5 mb-0.5">
                  <Text className="text-sm">🌿</Text>
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Orchid Sanctuary
                  </Text>
                </View>
                <Text className="text-2xl font-black text-gray-900 tracking-tight" numberOfLines={1}>
                  {user ? `${user.first_name} ${user.last_name}` : "Welcome Grower"}
                </Text>
                <Text className="text-xs text-gray-500 mt-0.5">
                  Monitor microclimate, health & growth
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => router.push("/profile")}
                activeOpacity={0.8}
                className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 items-center justify-center shadow-xs"
              >
                <Text className="text-xl">👤</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Metrics Banner */}
            <View className="flex-row items-center justify-between pt-3 border-t border-gray-100">
              <View className="flex-row items-center flex-1">
                <View className="w-8 h-8 rounded-xl bg-emerald-50 items-center justify-center mr-2">
                  <Text className="text-base">🪴</Text>
                </View>
                <View>
                  <Text className="text-xs font-black text-gray-900">{plants.length}</Text>
                  <Text className="text-[10px] font-medium text-gray-400">Orchids</Text>
                </View>
              </View>

              <View className="h-6 w-px bg-gray-100" />

              <View className="flex-row items-center flex-1 pl-3">
                <View className="w-8 h-8 rounded-xl bg-sky-50 items-center justify-center mr-2">
                  <Text className="text-base">📍</Text>
                </View>
                <View>
                  <Text className="text-xs font-black text-gray-900">{locations.length}</Text>
                  <Text className="text-[10px] font-medium text-gray-400">Zones</Text>
                </View>
              </View>

              <View className="h-6 w-px bg-gray-100" />

              <View className="flex-row items-center flex-1 pl-3">
                <View className="w-8 h-8 rounded-xl bg-amber-50 items-center justify-center mr-2">
                  <Text className="text-base">⚡</Text>
                </View>
                <View>
                  <Text className="text-xs font-black text-gray-900">{modules.length}</Text>
                  <Text className="text-[10px] font-medium text-gray-400">Sensors</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 2. CORE ACTIONS HUB (Care Tools - Removed redundant My Orchid Plants) */}
          <View className="mb-5">
            <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 px-0.5">
              🛠️ Care Tools & Diagnostics
            </Text>

            <View className="space-y-2.5">
              <TouchableOpacity
                onPress={() => router.push("/identify-species")}
                activeOpacity={0.8}
                className="p-3.5 rounded-2xl bg-white border border-gray-100 shadow-xs flex-row items-center justify-between"
              >
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 items-center justify-center">
                    <Text className="text-xl">🔍</Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-extrabold text-gray-900">Identify Species</Text>
                      <View className="bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                        <Text className="text-[10px] font-bold text-emerald-800">✨ AI Powered</Text>
                      </View>
                    </View>
                    <Text className="text-xs text-gray-400 font-medium mt-0.5" numberOfLines={1}>
                      Scan flower or foliage to classify variety
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/analyse-location")}
                activeOpacity={0.8}
                className="p-3.5 rounded-2xl bg-white border border-gray-100 shadow-xs flex-row items-center justify-between"
              >
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 items-center justify-center">
                    <Text className="text-xl">🌤️</Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-extrabold text-gray-900">Analyze Location</Text>
                      <View className="bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
                        <Text className="text-[10px] font-bold text-sky-800">📍 Microclimate</Text>
                      </View>
                    </View>
                    <Text className="text-xs text-gray-400 font-medium mt-0.5" numberOfLines={1}>
                      Assess temp, humidity & sunlight suitability
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/sensors")}
                activeOpacity={0.8}
                className="p-3.5 rounded-2xl bg-white border border-gray-100 shadow-xs flex-row items-center justify-between"
              >
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 items-center justify-center">
                    <Text className="text-xl">⚡</Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-extrabold text-gray-900">Hardware Sensor Nodes</Text>
                      <View className="bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                        <Text className="text-[10px] font-bold text-purple-800">📡 ESP32 Hub</Text>
                      </View>
                    </View>
                    <Text className="text-xs text-gray-400 font-medium mt-0.5" numberOfLines={1}>
                      Manage paired DHT11, BH1750 & NPK nodes ({modules.length})
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. HARDWARE SENSOR MODULE CONTROLS */}
          <View className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs mb-5">
            <View className="flex-row justify-between items-center mb-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-base">⚡</Text>
                <Text className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  Active Sensor Node
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={() => router.push("/sensors")}
                  className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200"
                >
                  <Text className="text-[10px] font-bold text-gray-700">⚙️ Hub</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCheckSensorStatus}
                  disabled={checkingStatus || !selectedModuleId}
                  className="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200"
                >
                  <Text className="text-[10px] font-bold text-emerald-800">
                    {checkingStatus ? "📡 Pinging..." : "📶 Ping Node"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Module Picker Chips */}
            {modules.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 mb-2">
                {modules.map((m) => {
                  const isSelected = selectedModuleId === m.module_id;
                  return (
                    <TouchableOpacity
                      key={m.module_id}
                      onPress={() => {
                        setSelectedModuleId(m.module_id);
                        setSensorStatus(null);
                      }}
                      className={`px-3 py-1.5 rounded-xl border flex-row items-center gap-1 ${
                        isSelected
                          ? "bg-emerald-50 border-emerald-500"
                          : "bg-gray-50 border-gray-100"
                      }`}
                    >
                      <Text className="text-[11px]">{isSelected ? "🟢" : "⚪"}</Text>
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? "text-emerald-800" : "text-gray-600"
                        }`}
                      >
                        {m.device_name || m.module_id}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text className="text-xs text-gray-400 italic mb-2">
                No sensor nodes linked yet.
              </Text>
            )}

            {/* Live Hardware Status Pills */}
            {sensorStatus && (
              <View className="flex-row justify-between pt-2.5 border-t border-gray-100 mt-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-[10px]">{sensorStatus.online ? "🟢" : "🔴"}</Text>
                  <Text className="text-[11px] font-bold text-gray-700">
                    ESP32: {sensorStatus.online ? "Online" : "Offline"}
                  </Text>
                </View>

                <View className="flex-row items-center gap-1.5">
                  <Text className="text-[10px]">{sensorStatus.dht11 ? "🌡️" : "⚠️"}</Text>
                  <Text className="text-[11px] font-bold text-gray-700">
                    DHT11: {sensorStatus.dht11 ? "Ready" : "Error"}
                  </Text>
                </View>

                <View className="flex-row items-center gap-1.5">
                  <Text className="text-[10px]">{sensorStatus.bh1750 ? "💡" : "⚠️"}</Text>
                  <Text className="text-[11px] font-bold text-gray-700">
                    BH1750: {sensorStatus.bh1750 ? "Ready" : "Error"}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* 4. GROWING ZONES & ORCHIDS HEADER */}
          <View className="flex-row justify-between items-center mb-3 px-0.5">
            <View>
              <View className="flex-row items-center gap-1.5 mb-0.5">
                <Text className="text-base">🏡</Text>
                <Text className="text-base font-extrabold text-gray-900 tracking-tight">
                  Growing Zones ({locations.length})
                </Text>
              </View>
              <Text className="text-[11px] text-gray-400">
                Organized microclimates and orchid care
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => {
                  setEditingLocation(null);
                  setLocationName("");
                  setLocationDesc("");
                  setShowLocationModal(true);
                }}
                className="flex-row items-center px-3 py-1.5 rounded-xl bg-emerald-600 shadow-xs"
              >
                <Text className="text-xs font-bold text-white">➕ Zone</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setTargetLocationId("");
                  setShowPlantModal(true);
                }}
                className="flex-row items-center px-3 py-1.5 rounded-xl bg-white border border-emerald-600 shadow-xs"
              >
                <Text className="text-xs font-bold text-emerald-700">➕ Orchid</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 5. ZONE LIST WITH TABBED TELEMETRY SAMPLING */}
          {loading ? (
            <ActivityIndicator color={colors.primary} className="py-12" />
          ) : locations.length === 0 ? (
            <View className="p-8 rounded-3xl bg-white border border-dashed border-gray-200 items-center justify-center mb-5">
              <View className="w-14 h-14 rounded-full bg-emerald-50 items-center justify-center mb-3">
                <Text className="text-2xl">📍</Text>
              </View>
              <Text className="text-base font-extrabold text-gray-800 text-center">
                No Location Zones Registered
              </Text>
              <Text className="text-xs text-gray-400 text-center mt-1 px-4 mb-4">
                Create a growing zone (like Balcony, Greenhouse, or Living Room) to track ambient conditions and manage orchids.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditingLocation(null);
                  setLocationName("");
                  setLocationDesc("");
                  setShowLocationModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600"
              >
                <Text className="text-xs font-bold text-white">➕ Create First Zone</Text>
              </TouchableOpacity>
            </View>
          ) : (
            locations.map((loc) => {
              const locPlants = plants.filter((p) => p.location_id === loc.location_id);
              const activeSlot = getZoneSlot(loc.location_id);
              const slotKey = `${loc.location_id}_${activeSlot}`;
              const isSampling = samplingSlotKey === slotKey;
              const staged = stagedReadings[slotKey];
              const isSubmitting = submittingSlotKey === slotKey;

              const slotEmoji = {
                morning: "☀️",
                afternoon: "⛅",
                evening: "🌙",
              }[activeSlot] || "⏱️";

              return (
                <View
                  key={loc.location_id}
                  className="mb-5 rounded-3xl border border-gray-100 bg-white overflow-hidden shadow-xs"
                >
                  {/* Zone Header Banner */}
                  <View className="p-4 bg-emerald-50/40 border-b border-gray-100 flex-row justify-between items-center">
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center gap-2 mb-0.5">
                        <View className="w-7 h-7 rounded-lg bg-emerald-100/70 items-center justify-center">
                          <Text className="text-xs">📍</Text>
                        </View>
                        <Text className="text-base font-black text-gray-900 tracking-tight">
                          {loc.location_name}
                        </Text>
                        <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
                          <Text className="text-[10px] font-bold text-emerald-800">
                            🪴 {locPlants.length} Orchids
                          </Text>
                        </View>
                      </View>
                      {loc.description ? (
                        <Text className="text-xs text-gray-500 pl-9" numberOfLines={1}>
                          {loc.description}
                        </Text>
                      ) : null}
                    </View>

                    {/* Zone Actions */}
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => {
                          setEditingLocation(loc);
                          setLocationName(loc.location_name);
                          setLocationDesc(loc.description || "");
                          setShowLocationModal(true);
                        }}
                        className="w-8 h-8 rounded-full bg-white border border-gray-100 items-center justify-center"
                      >
                        <Edit2 size={13} color={colors.mediumGray} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteLocation(loc)}
                        className="w-8 h-8 rounded-full bg-white border border-gray-100 items-center justify-center"
                      >
                        <Trash2 size={13} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Zone Ambient Telemetry (Tabbed UI for Clean UX) */}
                  <View className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <View className="flex-row justify-between items-center mb-2.5">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-xs">⏱️</Text>
                        <Text className="text-xs font-bold uppercase tracking-wider text-gray-700">
                          Ambient Telemetry (30s Live)
                        </Text>
                      </View>
                      <Text className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                        🌡️ DHT11 & 💡 BH1750
                      </Text>
                    </View>

                    {/* Time Slot Selector Pills */}
                    <View className="flex-row gap-2 mb-3">
                      {[
                        { slot: "morning", label: "Morning", emoji: "☀️" },
                        { slot: "afternoon", label: "Afternoon", emoji: "⛅" },
                        { slot: "evening", label: "Evening", emoji: "🌙" },
                      ].map(({ slot, label, emoji }) => {
                        const key = `${loc.location_id}_${slot}`;
                        const currentStaged = stagedReadings[key];
                        const isSelected = activeSlot === slot;

                        return (
                          <TouchableOpacity
                            key={slot}
                            onPress={() => setZoneSlot(loc.location_id, slot)}
                            className={`flex-1 py-1.5 px-2 rounded-xl border flex-row items-center justify-center gap-1 ${
                              isSelected
                                ? "bg-white border-emerald-600 shadow-xs"
                                : "bg-white/80 border-gray-100"
                            }`}
                          >
                            <Text className="text-[10px]">{emoji}</Text>
                            <Text
                              className={`text-[11px] font-bold ${
                                isSelected ? "text-emerald-800" : "text-gray-600"
                              }`}
                            >
                              {label}
                            </Text>
                            <View
                              className={`w-1.5 h-1.5 rounded-full ml-0.5 ${
                                currentStaged?.submitted
                                  ? "bg-emerald-500"
                                  : currentStaged
                                  ? "bg-amber-500"
                                  : "bg-gray-300"
                              }`}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Active Selected Slot Content Card */}
                    <View className="p-3.5 bg-white rounded-2xl border border-gray-100 shadow-xs">
                      <View className="flex-row justify-between items-center mb-2">
                        <View className="flex-row items-center gap-1">
                          <Text className="text-xs">{slotEmoji}</Text>
                          <Text className="text-xs font-extrabold capitalize text-gray-800">
                            {activeSlot} Microclimate
                          </Text>
                        </View>
                        {staged?.submitted ? (
                          <View className="bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100 flex-row items-center gap-1">
                            <Text className="text-[10px] font-bold text-emerald-800">✅ Saved to DB</Text>
                          </View>
                        ) : staged ? (
                          <View className="bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100">
                            <Text className="text-[10px] font-bold text-amber-800">🟡 Ready to Save</Text>
                          </View>
                        ) : (
                          <Text className="text-[10px] text-gray-400 font-medium">⚪ Pending Sample</Text>
                        )}
                      </View>

                      {/* 30s Countdown Progress Bar */}
                      {isSampling ? (
                        <View className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200/80 mb-2.5">
                          <View className="flex-row justify-between items-center mb-1.5">
                            <Text className="text-xs font-bold text-emerald-800">
                              📡 Sampling Live ({burstSamplesCount}/3)...
                            </Text>
                            <Text className="text-xs font-black text-emerald-800">
                              ⏱️ {countdown}s
                            </Text>
                          </View>
                          <View className="w-full bg-emerald-200/80 rounded-full h-2 overflow-hidden mb-1">
                            <View
                              className="bg-emerald-600 h-full rounded-full"
                              style={{ width: `${((30 - countdown) / 30) * 100}%` }}
                            />
                          </View>
                          <Text className="text-[10px] text-emerald-700 font-medium">
                            Capturing at 1s, 15s, and 28s (30s average)
                          </Text>
                        </View>
                      ) : staged ? (
                        /* Results Display */
                        <View className="p-2.5 bg-gray-50/80 rounded-xl border border-gray-100 mb-2.5">
                          <View className="flex-row justify-between items-center py-0.5">
                            <View className="items-center flex-1">
                              <Text className="text-[10px] font-bold text-gray-400 uppercase">🌡️ Temp</Text>
                              <Text className="text-sm font-black text-rose-600">{staged.temp} °C</Text>
                            </View>
                            <View className="items-center flex-1 border-x border-gray-200">
                              <Text className="text-[10px] font-bold text-gray-400 uppercase">💧 Humidity</Text>
                              <Text className="text-sm font-black text-sky-600">{staged.hum} %</Text>
                            </View>
                            <View className="items-center flex-1">
                              <Text className="text-[10px] font-bold text-gray-400 uppercase">☀️ Light</Text>
                              <Text className="text-sm font-black text-amber-600">{staged.lux} Lux</Text>
                            </View>
                          </View>
                          <Text className="text-[10px] text-gray-400 text-center border-t border-gray-200 pt-1 mt-1">
                            30s average recorded at {staged.timestamp}
                          </Text>
                        </View>
                      ) : (
                        <Text className="text-xs italic text-gray-400 py-1.5 mb-1.5">
                          No telemetry recorded for this time slot. Tap below to capture 30-second live sensor reading.
                        </Text>
                      )}

                      {/* Action Buttons */}
                      <View className="flex-row gap-2">
                        {isSampling ? (
                          <View className="flex-1 py-2.5 bg-emerald-100 rounded-xl items-center justify-center">
                            <Text className="text-xs font-bold text-emerald-800">
                              Sampling ({countdown}s)...
                            </Text>
                          </View>
                        ) : staged && !staged.submitted ? (
                          <>
                            <TouchableOpacity
                              onPress={() => handleSubmitReading(loc.location_id, activeSlot)}
                              disabled={isSubmitting || Boolean(samplingSlotKey)}
                              className="flex-1 py-2.5 rounded-xl bg-emerald-600 items-center justify-center shadow-xs"
                            >
                              <Text className="text-xs font-bold text-white">
                                {isSubmitting ? "Saving..." : "💾 Save Reading to DB"}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => handleStartBurstSampling(loc.location_id, activeSlot)}
                              disabled={Boolean(samplingSlotKey) || isSubmitting}
                              className="px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200 items-center justify-center"
                            >
                              <Text className="text-xs font-bold text-gray-700">🔄 Re-Sample</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            onPress={() => handleStartBurstSampling(loc.location_id, activeSlot)}
                            disabled={Boolean(samplingSlotKey)}
                            className="flex-1 py-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200 items-center justify-center"
                          >
                            <Text className="text-xs font-bold text-emerald-800">
                              {staged?.submitted
                                ? `🔄 Re-Sample ${activeSlot.toUpperCase()} (30s)`
                                : `📡 Read ${activeSlot.toUpperCase()} Sensor Data (30s)`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Assigned Orchids in Zone */}
                  <View className="p-4">
                    <View className="flex-row justify-between items-center mb-3">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-xs font-bold uppercase tracking-wider text-gray-700">
                          🌸 Assigned Orchids ({locPlants.length})
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setTargetLocationId(loc.location_id);
                          setShowPlantModal(true);
                        }}
                        className="flex-row items-center gap-1"
                      >
                        <Text className="text-xs font-bold text-emerald-700">➕ Add Orchid</Text>
                      </TouchableOpacity>
                    </View>

                    {locPlants.length === 0 ? (
                      <View className="py-4 items-center justify-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                        <Text className="text-xs text-gray-400 font-medium">
                          🪴 No orchids placed in this zone yet.
                        </Text>
                      </View>
                    ) : (
                      locPlants.map((plant) => (
                        <PlantCard
                          key={plant.plant_id || plant.id}
                          plant={plant}
                          onPress={() =>
                            router.push({
                              pathname: "/plant-details",
                              params: {
                                id: plant.plant_id || plant.id,
                                plant_name: plant.plant_name || plant.name || "",
                                plant_species: plant.plant_species || plant.species || "Dendrobium",
                                location_id: plant.location_id || loc.location_id || "",
                                location_name: loc.location_name || "",
                              },
                            })
                          }
                        />
                      ))
                    )}
                  </View>
                </View>
              );
            })
          )}

          {/* 6. UNASSIGNED ORCHID PLANTS */}
          {plants.filter((p) => !p.location_id).length > 0 && (
            <View className="p-4 rounded-3xl border border-dashed border-gray-200 bg-white mb-6">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Unassigned Orchids ({plants.filter((p) => !p.location_id).length})
                </Text>
                <Text className="text-[11px] text-gray-400">Needs Zone Placement</Text>
              </View>
              {plants
                .filter((p) => !p.location_id)
                .map((plant) => (
                  <PlantCard
                    key={plant.plant_id || plant.id}
                    plant={plant}
                    onPress={() =>
                      router.push({
                        pathname: "/plant-details",
                        params: {
                          id: plant.plant_id || plant.id,
                          plant_name: plant.plant_name || plant.name || "",
                          plant_species: plant.plant_species || plant.species || "Dendrobium",
                          location_id: "",
                          location_name: "Unassigned Zone",
                        },
                      })
                    }
                  />
                ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* LOCATION ZONE MODAL */}
      <Modal visible={showLocationModal} transparent animationType="fade">
        <View className="flex-1 justify-center items-center px-5 bg-black/50">
          <View className="w-full bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
            <View className="flex-row justify-between items-center pb-3 mb-4 border-b border-gray-100">
              <Text className="text-lg font-black text-gray-900">
                {editingLocation ? "Edit Growing Zone" : "New Growing Zone"}
              </Text>
              <TouchableOpacity
                onPress={() => setShowLocationModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
              >
                <X size={16} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1.5 text-gray-700">Zone Name</Text>
              <TextInput
                className="rounded-2xl px-4 py-3 text-sm border border-gray-200 bg-gray-50/50"
                style={{ color: colors.darkGray }}
                placeholder="e.g. Balcony East Shelf"
                value={locationName}
                onChangeText={setLocationName}
              />
            </View>

            <View className="mb-5">
              <Text className="text-xs font-bold uppercase mb-1.5 text-gray-700">Description</Text>
              <TextInput
                className="rounded-2xl px-4 py-3 text-sm border border-gray-200 bg-gray-50/50"
                style={{ color: colors.darkGray }}
                placeholder="e.g. Filtered morning light with good airflow"
                value={locationDesc}
                onChangeText={setLocationDesc}
              />
            </View>

            <View className="flex-row justify-end gap-2.5">
              <TouchableOpacity
                onPress={() => setShowLocationModal(false)}
                className="px-4 py-3 rounded-xl bg-gray-100"
              >
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveLocation}
                disabled={savingLocation}
                className="px-6 py-3 rounded-xl bg-emerald-600 shadow-xs"
              >
                {savingLocation ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text className="text-xs font-bold text-white">Save Zone</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PLANT MODAL */}
      <Modal visible={showPlantModal} transparent animationType="fade">
        <View className="flex-1 justify-center items-center px-5 bg-black/50">
          <View className="w-full bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
            <View className="flex-row justify-between items-center pb-3 mb-4 border-b border-gray-100">
              <Text className="text-lg font-black text-gray-900">Add Orchid Plant</Text>
              <TouchableOpacity
                onPress={() => setShowPlantModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
              >
                <X size={16} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <View className="mb-3.5">
              <Text className="text-xs font-bold uppercase mb-1.5 text-gray-700">Plant Identifier</Text>
              <TextInput
                className="rounded-2xl px-4 py-3 text-sm border border-gray-200 bg-gray-50/50"
                style={{ color: colors.darkGray }}
                placeholder="e.g. Dendrobium Nobile #1"
                value={plantName}
                onChangeText={setPlantName}
              />
            </View>

            <View className="mb-3.5">
              <Text className="text-xs font-bold uppercase mb-1.5 text-gray-700">Species</Text>
              <View className="flex-row gap-2">
                {["Dendrobium", "Phalaenopsis", "Oncidium"].map((spec) => {
                  const isSelected = plantSpecies === spec;
                  return (
                    <TouchableOpacity
                      key={spec}
                      onPress={() => setPlantSpecies(spec)}
                      className={`flex-1 py-2.5 rounded-xl border items-center ${
                        isSelected
                          ? "bg-emerald-50 border-emerald-600"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? "text-emerald-800" : "text-gray-600"
                        }`}
                      >
                        {spec}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="mb-5">
              <Text className="text-xs font-bold uppercase mb-1.5 text-gray-700">Assign Zone</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 pt-1">
                <TouchableOpacity
                  onPress={() => setTargetLocationId("")}
                  className={`px-3.5 py-2 rounded-xl border ${
                    !targetLocationId
                      ? "bg-emerald-50 border-emerald-600"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      !targetLocationId ? "text-emerald-800" : "text-gray-600"
                    }`}
                  >
                    Unassigned
                  </Text>
                </TouchableOpacity>
                {locations.map((l) => {
                  const isSelected = targetLocationId === l.location_id;
                  return (
                    <TouchableOpacity
                      key={l.location_id}
                      onPress={() => setTargetLocationId(l.location_id)}
                      className={`px-3.5 py-2 rounded-xl border ${
                        isSelected
                          ? "bg-emerald-50 border-emerald-600"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? "text-emerald-800" : "text-gray-600"
                        }`}
                      >
                        {l.location_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View className="flex-row justify-end gap-2.5">
              <TouchableOpacity
                onPress={() => setShowPlantModal(false)}
                className="px-4 py-3 rounded-xl bg-gray-100"
              >
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreatePlant}
                disabled={savingPlant}
                className="px-6 py-3 rounded-xl bg-emerald-600 shadow-xs"
              >
                {savingPlant ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text className="text-xs font-bold text-white">Save Plant</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}