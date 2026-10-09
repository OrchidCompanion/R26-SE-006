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
  X,
  Radio,
  Clock,
  Sparkles,
  Compass,
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
          setSelectedModuleId(modData[0].module_id);
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

  // 1-Minute 3-Sample Burst Ambient Telemetry Sampling
  const handleStartBurstSampling = (locationId, slot) => {
    if (!selectedModuleId) {
      Alert.alert("Hardware Notice", "Please choose an ESP32 sensor module above.");
      return;
    }

    const slotKey = `${locationId}_${slot}`;
    setSamplingSlotKey(slotKey);
    setCountdown(60);
    setBurstSamplesCount(0);

    let secondsLeft = 60;
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

      if (secondsLeft === 40 || secondsLeft === 20 || secondsLeft === 0) {
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <View className="px-5 py-3">
          {/* Header Bar */}
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.mediumGray }}>
                Welcome
              </Text>
              <Text className="text-2xl font-black" style={{ color: colors.darkGray }}>
                {user ? `${user.first_name} ${user.last_name}` : "Orchid Grower"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/profile")}
              className="w-11 h-11 rounded-full border items-center justify-center bg-white shadow-xs"
              style={{ borderColor: colors.borderGray }}
            >
              <User size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Core Action Navigation Grid */}
          <View className="flex-row justify-between mb-4">
            <TouchableOpacity
              onPress={() => router.push("/identify-species")}
              activeOpacity={0.8}
              className="w-[48%] p-3.5 rounded-2xl border items-center justify-center bg-white shadow-xs"
              style={{ borderColor: colors.borderGray }}
            >
              <Image source={require("../assets/home-icons/magnifying-glass.png")} className="w-10 h-10 mb-1.5" resizeMode="contain" />
              <Text className="text-xs font-bold text-center" style={{ color: colors.darkGray }}>
                Identify Species
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/analyse-location")}
              activeOpacity={0.8}
              className="w-[48%] p-3.5 rounded-2xl border items-center justify-center bg-white shadow-xs"
              style={{ borderColor: colors.borderGray }}
            >
              <Image source={require("../assets/home-icons/climate.png")} className="w-10 h-10 mb-1.5" resizeMode="contain" />
              <Text className="text-xs font-bold text-center" style={{ color: colors.darkGray }}>
                Analyze Location
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sensor Hardware Strip */}
          <View className="p-4 rounded-2xl border bg-white mb-4 shadow-xs" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row justify-between items-center mb-2">
              <View className="flex-row items-center gap-1.5">
                <Radio size={16} color={colors.primary} />
                <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.darkGray }}>
                  IoT Sensor Hardware
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCheckSensorStatus}
                disabled={checkingStatus || !selectedModuleId}
                className="px-2.5 py-1 rounded-lg border"
                style={{ backgroundColor: colors.primaryLight, borderColor: colors.primary }}
              >
                <Text className="text-[10px] font-bold" style={{ color: colors.primary }}>
                  {checkingStatus ? "Checking..." : "Ping Module"}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 mb-2">
              {modules.map((m) => (
                <TouchableOpacity
                  key={m.module_id}
                  onPress={() => {
                    setSelectedModuleId(m.module_id);
                    setSensorStatus(null);
                  }}
                  className="px-3 py-1.5 rounded-xl border"
                  style={{
                    backgroundColor: selectedModuleId === m.module_id ? colors.primaryLight : colors.lightGray,
                    borderColor: selectedModuleId === m.module_id ? colors.primary : colors.borderGray,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: selectedModuleId === m.module_id ? colors.primary : colors.darkGray }}
                  >
                    {m.device_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {sensorStatus && (
              <View className="flex-row justify-around pt-2 border-t" style={{ borderColor: colors.borderGray }}>
                <Text className="text-[10px] font-bold" style={{ color: sensorStatus.online ? colors.primary : colors.danger }}>
                  ESP32: {sensorStatus.online ? "Online" : "Offline"}
                </Text>
                <Text className="text-[10px] font-bold" style={{ color: sensorStatus.dht11 ? colors.primary : colors.danger }}>
                  DHT11: {sensorStatus.dht11 ? "Ready" : "Error"}
                </Text>
                <Text className="text-[10px] font-bold" style={{ color: sensorStatus.bh1750 ? colors.primary : colors.danger }}>
                  BH1750: {sensorStatus.bh1750 ? "Ready" : "Error"}
                </Text>
              </View>
            )}
          </View>

          {/* Zone Locations Header */}
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-base font-extrabold" style={{ color: colors.darkGray }}>
              Zone Locations ({locations.length})
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => {
                  setEditingLocation(null);
                  setLocationName("");
                  setLocationDesc("");
                  setShowLocationModal(true);
                }}
                className="flex-row items-center px-2.5 py-1.5 rounded-xl"
                style={{ backgroundColor: colors.primary }}
              >
                <Plus size={14} color={colors.white} />
                <Text className="text-xs font-bold text-white ml-1">Zone</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setTargetLocationId("");
                  setShowPlantModal(true);
                }}
                className="flex-row items-center px-2.5 py-1.5 rounded-xl border"
                style={{ backgroundColor: colors.white, borderColor: colors.primary }}
              >
                <Plus size={14} color={colors.primary} />
                <Text className="text-xs font-bold ml-1" style={{ color: colors.primary }}>Plant</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Locations & Plants List */}
          {loading ? (
            <ActivityIndicator color={colors.primary} className="py-8" />
          ) : locations.length === 0 ? (
            <View className="p-6 rounded-2xl bg-white border border-dashed items-center justify-center mb-4" style={{ borderColor: colors.borderGray }}>
              <MapPin size={28} color={colors.mediumGray} />
              <Text className="text-sm font-bold mt-2" style={{ color: colors.darkGray }}>No Location Zones Registered</Text>
              <Text className="text-xs text-center mt-1" style={{ color: colors.mediumGray }}>
                Add your greenhouse or growing zone to track ambient telemetry and place orchids.
              </Text>
            </View>
          ) : (
            locations.map((loc) => {
              const locPlants = plants.filter((p) => p.location_id === loc.location_id);

              return (
                <View
                  key={loc.location_id}
                  className="mb-4 rounded-2xl border bg-white overflow-hidden shadow-xs"
                  style={{ borderColor: colors.borderGray }}
                >
                  {/* Zone Header Strip */}
                  <View className="p-3.5 bg-gray-50 border-b flex-row justify-between items-center" style={{ borderColor: colors.borderGray }}>
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center gap-1.5">
                        <MapPin size={16} color={colors.primary} />
                        <Text className="text-sm font-black" style={{ color: colors.darkGray }}>
                          {loc.location_name}
                        </Text>
                        <Text className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.primaryLight, color: colors.primary }}>
                          {locPlants.length} Plants
                        </Text>
                      </View>
                      {loc.description ? (
                        <Text className="text-[11px] text-gray-500 mt-0.5">{loc.description}</Text>
                      ) : null}
                    </View>

                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => {
                          setEditingLocation(loc);
                          setLocationName(loc.location_name);
                          setLocationDesc(loc.description || "");
                          setShowLocationModal(true);
                        }}
                      >
                        <Edit2 size={16} color={colors.mediumGray} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteLocation(loc)}>
                        <Trash2 size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Ambient Telemetry 1-Min Burst Sampling Controls */}
                  <View className="p-3.5 border-b space-y-3" style={{ borderColor: colors.borderGray }}>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xs font-bold uppercase" style={{ color: colors.mediumGray }}>
                        Zone Telemetry Sampling (1-Min Average)
                      </Text>
                      <Text className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        DHT11 & BH1750
                      </Text>
                    </View>

                    {/* Full Width Time-Slot Cards */}
                    <View className="space-y-3">
                      {["morning", "afternoon", "evening"].map((slot) => {
                        const slotKey = `${loc.location_id}_${slot}`;
                        const isSampling = samplingSlotKey === slotKey;
                        const staged = stagedReadings[slotKey];
                        const isSubmitting = submittingSlotKey === slotKey;

                        return (
                          <View
                            key={slot}
                            className="p-3.5 bg-gray-50 rounded-2xl border space-y-2.5"
                            style={{ borderColor: colors.borderGray }}
                          >
                            <View className="flex-row justify-between items-center">
                              <Text className="text-xs font-bold capitalize" style={{ color: colors.darkGray }}>
                                {slot} Time Slot
                              </Text>

                              {staged?.submitted ? (
                                <Text className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                  Saved to DB ✓
                                </Text>
                              ) : staged ? (
                                <Text className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                  Averaged & Ready
                                </Text>
                              ) : null}
                            </View>

                            {/* Sampling Countdown Progress Bar */}
                            {isSampling ? (
                              <View className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1.5">
                                <View className="flex-row justify-between items-center">
                                  <Text className="text-xs font-bold text-emerald-800">
                                    Collecting burst samples ({burstSamplesCount}/3)...
                                  </Text>
                                  <Text className="text-xs font-bold text-emerald-800">
                                    {countdown}s remaining
                                  </Text>
                                </View>
                                <View className="w-full bg-emerald-200 rounded-full h-1.5 overflow-hidden">
                                  <View
                                    className="bg-emerald-600 h-full rounded-full"
                                    style={{ width: `${((60 - countdown) / 60) * 100}%` }}
                                  />
                                </View>
                              </View>
                            ) : staged ? (
                              /* Averaged Result Display */
                              <View className="p-2.5 bg-white rounded-xl border space-y-1.5" style={{ borderColor: colors.borderGray }}>
                                <View className="flex-row justify-between items-center">
                                  <Text className="text-xs font-bold text-rose-600">
                                    {staged.temp} °C <Text className="text-[10px] text-gray-400 font-normal">Temp</Text>
                                  </Text>
                                  <Text className="text-xs font-bold text-sky-600">
                                    {staged.hum} % <Text className="text-[10px] text-gray-400 font-normal">Humidity</Text>
                                  </Text>
                                  <Text className="text-xs font-bold text-amber-600">
                                    {staged.lux} Lux <Text className="text-[10px] text-gray-400 font-normal">Light</Text>
                                  </Text>
                                </View>
                                <Text className="text-[10px] text-gray-400 border-t pt-1" style={{ borderColor: colors.borderGray }}>
                                  Logged at {staged.timestamp}
                                </Text>
                              </View>
                            ) : (
                              <Text className="text-xs italic text-gray-400">
                                No telemetry sampled for this slot yet.
                              </Text>
                            )}

                            {/* Full Width Action Buttons */}
                            <View className="flex-row gap-2 pt-1">
                              <TouchableOpacity
                                onPress={() => handleStartBurstSampling(loc.location_id, slot)}
                                disabled={Boolean(samplingSlotKey)}
                                className="flex-1 py-2.5 bg-white hover:bg-gray-100 rounded-xl border items-center justify-center"
                                style={{ borderColor: colors.borderGray }}
                              >
                                <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>
                                  {isSampling ? "Reading..." : staged ? "Re-Check Values" : "Read Values"}
                                </Text>
                              </TouchableOpacity>

                              {staged && !staged.submitted && (
                                <TouchableOpacity
                                  onPress={() => handleSubmitReading(loc.location_id, slot)}
                                  disabled={isSubmitting || Boolean(samplingSlotKey)}
                                  className="flex-1 py-2.5 rounded-xl items-center justify-center shadow-xs"
                                  style={{ backgroundColor: colors.primary }}
                                >
                                  <Text className="text-xs font-bold text-white">
                                    {isSubmitting ? "Saving..." : "Submit Reading"}
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Plants Assigned in Zone */}
                  <View className="p-3">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-xs font-bold uppercase" style={{ color: colors.darkGray }}>
                        Assigned Orchids
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setTargetLocationId(loc.location_id);
                          setShowPlantModal(true);
                        }}
                      >
                        <Text className="text-xs font-bold" style={{ color: colors.primary }}>+ Add to Zone</Text>
                      </TouchableOpacity>
                    </View>

                    {locPlants.length === 0 ? (
                      <Text className="text-xs italic text-center py-2" style={{ color: colors.mediumGray }}>
                        No plants in this zone yet.
                      </Text>
                    ) : (
                      locPlants.map((plant) => (
                        <PlantCard
                          key={plant.plant_id || plant.id}
                          plant={plant}
                          onPress={() =>
                            router.push({
                              pathname: "/plant-details",
                              params: { id: plant.plant_id || plant.id },
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

          {/* Unassigned Plants Section */}
          {plants.filter((p) => !p.location_id).length > 0 && (
            <View className="p-4 rounded-2xl border border-dashed bg-white mb-6" style={{ borderColor: colors.borderGray }}>
              <Text className="text-xs font-bold uppercase mb-2" style={{ color: colors.darkGray }}>
                Unassigned Orchid Plants ({plants.filter((p) => !p.location_id).length})
              </Text>
              {plants
                .filter((p) => !p.location_id)
                .map((plant) => (
                  <PlantCard
                    key={plant.plant_id || plant.id}
                    plant={plant}
                    onPress={() =>
                      router.push({
                        pathname: "/plant-details",
                        params: { id: plant.plant_id || plant.id },
                      })
                    }
                  />
                ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* LOCATION MODAL */}
      <Modal visible={showLocationModal} transparent animationType="fade">
        <View className="flex-1 justify-center items-center px-5" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View className="w-full bg-white rounded-3xl p-6 shadow-xl border" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row justify-between items-center pb-3 mb-4 border-b" style={{ borderColor: colors.borderGray }}>
              <Text className="text-lg font-bold" style={{ color: colors.darkGray }}>
                {editingLocation ? "Edit Location Zone" : "Add Location Zone"}
              </Text>
              <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                <X size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>Zone Name</Text>
              <TextInput
                className="rounded-xl px-3.5 py-2.5 text-sm border bg-gray-50"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
                placeholder="e.g. Balcony Shelf 1"
                value={locationName}
                onChangeText={setLocationName}
              />
            </View>

            <View className="mb-4">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>Description</Text>
              <TextInput
                className="rounded-xl px-3.5 py-2.5 text-sm border bg-gray-50"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
                placeholder="e.g. Filtered morning light"
                value={locationDesc}
                onChangeText={setLocationDesc}
              />
            </View>

            <View className="flex-row justify-end gap-2">
              <TouchableOpacity onPress={() => setShowLocationModal(false)} className="px-4 py-2.5 rounded-xl bg-gray-100">
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveLocation}
                disabled={savingLocation}
                className="px-5 py-2.5 rounded-xl"
                style={{ backgroundColor: colors.primary }}
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
        <View className="flex-1 justify-center items-center px-5" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View className="w-full bg-white rounded-3xl p-6 shadow-xl border" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row justify-between items-center pb-3 mb-4 border-b" style={{ borderColor: colors.borderGray }}>
              <Text className="text-lg font-bold" style={{ color: colors.darkGray }}>Add Orchid Plant</Text>
              <TouchableOpacity onPress={() => setShowPlantModal(false)}>
                <X size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>Plant Identifier</Text>
              <TextInput
                className="rounded-xl px-3.5 py-2.5 text-sm border bg-gray-50"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
                placeholder="e.g. Dendrobium Nobile #1"
                value={plantName}
                onChangeText={setPlantName}
              />
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>Species</Text>
              <View className="flex-row gap-2">
                {["Dendrobium", "Phalaenopsis", "Oncidium"].map((spec) => (
                  <TouchableOpacity
                    key={spec}
                    onPress={() => setPlantSpecies(spec)}
                    className="flex-1 py-2 rounded-lg border items-center"
                    style={{
                      backgroundColor: plantSpecies === spec ? colors.primaryLight : colors.white,
                      borderColor: plantSpecies === spec ? colors.primary : colors.borderGray,
                    }}
                  >
                    <Text className="text-xs font-bold" style={{ color: plantSpecies === spec ? colors.primary : colors.mediumGray }}>
                      {spec}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="mb-5">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>Assign Zone</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 pt-1">
                <TouchableOpacity
                  onPress={() => setTargetLocationId("")}
                  className="px-3 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: !targetLocationId ? colors.primaryLight : colors.white,
                    borderColor: !targetLocationId ? colors.primary : colors.borderGray,
                  }}
                >
                  <Text className="text-xs font-semibold" style={{ color: !targetLocationId ? colors.primary : colors.mediumGray }}>None</Text>
                </TouchableOpacity>
                {locations.map((l) => (
                  <TouchableOpacity
                    key={l.location_id}
                    onPress={() => setTargetLocationId(l.location_id)}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{
                      backgroundColor: targetLocationId === l.location_id ? colors.primaryLight : colors.white,
                      borderColor: targetLocationId === l.location_id ? colors.primary : colors.borderGray,
                    }}
                  >
                    <Text className="text-xs font-semibold" style={{ color: targetLocationId === l.location_id ? colors.primary : colors.mediumGray }}>
                      {l.location_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View className="flex-row justify-end gap-2">
              <TouchableOpacity onPress={() => setShowPlantModal(false)} className="px-4 py-2.5 rounded-xl bg-gray-100">
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreatePlant}
                disabled={savingPlant}
                className="px-5 py-2.5 rounded-xl"
                style={{ backgroundColor: colors.primary }}
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