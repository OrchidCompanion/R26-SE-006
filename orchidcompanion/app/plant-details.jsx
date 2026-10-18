import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSelector } from "react-redux";
import {
  RefreshCw,
  Edit2,
  Trash2,
  ChevronDown,
  X,
  Check,
  MapPin,
  Radio,
  Clock,
  Activity,
  Droplets,
  Sun,
  ShieldCheck,
  AlertTriangle,
  Flower2,
  Calendar,
  Thermometer,
  Sparkles,
  Cpu,
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";

const SPECIES_OPTIONS = ["Dendrobium", "Phalaenopsis", "Oncidium", "Cattleya", "Vanda"];

export default function PlantDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = params.id;
  const { user, token } = useSelector((state) => state.auth);

  const [plant, setPlant] = useState(() => {
    if (params.plant_name) {
      return {
        plant_id: id,
        id: id,
        plant_name: params.plant_name,
        plant_species: params.plant_species || "Dendrobium",
        location_id: params.location_id || null,
        locations: params.location_name ? { location_name: params.location_name } : undefined,
      };
    }
    return null;
  });
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(() => !params.plant_name);
  const [refreshing, setRefreshing] = useState(false);

  // Active Screen Segment Tab: "sensors" | "care" (Soil NPK & Sensors highlighted by default)
  const [activeTab, setActiveTab] = useState("sensors");

  // Sensor Modules & NPK Burst Sampling State
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [sensorStatus, setSensorStatus] = useState(null);
  const [activeNpkSlot, setActiveNpkSlot] = useState("morning");
  const [samplingNpkSlot, setSamplingNpkSlot] = useState(null);
  const [npkCountdown, setNpkCountdown] = useState(60);
  const [stagedNpk, setStagedNpk] = useState({});
  const [submittingNpk, setSubmittingNpk] = useState(false);
  const timerRef = useRef(null);

  // Diagnostic Logs & Latest Cards State
  const [ambientTelemetry, setAmbientTelemetry] = useState({
    temp: "--",
    hum: "--",
    lux: "--",
    timeSlot: "Recorded",
    timestamp: null,
  });
  const [lastNpkReading, setLastNpkReading] = useState(null);
  const [lastDiseaseOutput, setLastDiseaseOutput] = useState(null);
  const [lastFertilizerSchedule, setLastFertilizerSchedule] = useState(null);
  const [lastBloomPrediction, setLastBloomPrediction] = useState(null);

  // Edit Plant Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [formName, setFormName] = useState(params.plant_name || "");
  const [formSpecies, setFormSpecies] = useState(params.plant_species || "Dendrobium");
  const [formLocationId, setFormLocationId] = useState(params.location_id || "");
  const [showSpeciesDropdown, setShowSpeciesDropdown] = useState(false);
  const [savingUpdate, setSavingUpdate] = useState(false);

  // Sort and extract the absolute latest record by timestamp
  const extractLatestItem = (data) => {
    if (!data) return null;
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.results)
      ? data.results
      : [];

    if (list.length > 0) {
      return [...list].sort(
        (a, b) => new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0)
      )[0];
    }

    if (typeof data === "object" && !Array.isArray(data)) return data;
    return null;
  };

  const fetchPlantData = useCallback(async () => {
    if (!id || !token) return;
    try {
      const headers = getAuthHeaders(token);

      // Fetch all required data concurrently in parallel
      const [
        pRes,
        locRes,
        modRes,
        dhtRes,
        bhRes,
        npkRes,
        fertRes,
        diseaseRes,
        bloomRes,
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/plants/${id}`, { headers }),
        user?.user_id
          ? fetch(`${API_BASE_URL}/locations/user/${user.user_id}`, { headers })
          : Promise.resolve({ ok: false }),
        user?.user_id
          ? fetch(`${API_BASE_URL}/sensors/modules/user/${user.user_id}`, { headers })
          : Promise.resolve({ ok: false }),
        fetch(`${API_BASE_URL}/sensors/dht11/plant/${id}?page=1&limit=20`, { headers }),
        fetch(`${API_BASE_URL}/sensors/bh1750/plant/${id}?page=1&limit=20`, { headers }),
        fetch(`${API_BASE_URL}/sensors/npk/plant/${id}?page=1&limit=20`, { headers }),
        fetch(`${API_BASE_URL}/fertilizer/plant/${id}?page=1&limit=20`, { headers }),
        fetch(`${API_BASE_URL}/disease/plant/${id}?page=1&limit=20`, { headers }),
        fetch(`${API_BASE_URL}/bloom/plant/${id}?page=1&limit=20`, { headers }),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setPlant((prev) => ({ ...prev, ...pData }));
        setFormName(pData.plant_name);
        setFormSpecies(pData.plant_species);
        setFormLocationId(pData.location_id || "");
      }
      if (locRes.ok) setLocations(await locRes.json());
      if (modRes.ok) {
        const mods = await modRes.json();
        setModules(mods);
        setSelectedModuleId((prev) => {
          if (prev) return prev;
          if (mods.length > 0) {
            const npkMod = mods.find(
              (m) =>
                m.module_id === "441bf68cbc78" ||
                m.device_name?.toLowerCase().includes("npk")
            );
            return npkMod ? npkMod.module_id : mods[0].module_id;
          }
          return "";
        });
      }

      // Microclimate (DHT11 & BH1750)
      const dhtData = dhtRes.ok ? await dhtRes.json() : null;
      const bhData = bhRes.ok ? await bhRes.json() : null;
      const latestDht = extractLatestItem(dhtData);
      const latestBh = extractLatestItem(bhData);
      if (latestDht || latestBh) {
        setAmbientTelemetry({
          temp: latestDht?.temperature ?? "--",
          hum: latestDht?.humidity ?? "--",
          lux: latestBh?.lux ?? "--",
          timeSlot: latestDht?.time_slot || latestBh?.time_slot || "Recorded",
          timestamp: latestDht?.created_at || latestBh?.created_at || null,
        });
      }

      // NPK Telemetry
      if (npkRes.ok) {
        const npkData = await npkRes.json();
        const latest = extractLatestItem(npkData);
        if (latest) {
          setLastNpkReading({
            nitrogen: latest.nitrogen_n ?? latest.nitrogen ?? latest.N ?? 0,
            phosphorus: latest.phosphorus_p ?? latest.phosphorus ?? latest.phosphorous ?? latest.P ?? 0,
            potassium: latest.potassium_k ?? latest.potassium ?? latest.K ?? 0,
            time_slot: latest.time_slot || "Recorded",
            created_at: latest.created_at || null,
          });
        }
      }

      // Fertilizer Recommendation
      if (fertRes.ok) {
        const fertData = await fertRes.json();
        const latestFert = extractLatestItem(fertData);
        if (latestFert) setLastFertilizerSchedule(latestFert);
      }

      // Disease Diagnosis
      if (diseaseRes.ok) {
        const disData = await diseaseRes.json();
        const latestDis = extractLatestItem(disData);
        if (latestDis) setLastDiseaseOutput(latestDis);
      }

      // Bloom Forecast
      if (bloomRes.ok) {
        const bData = await bloomRes.json();
        const latestBloom = extractLatestItem(bData);
        if (latestBloom) setLastBloomPrediction(latestBloom);
      }
    } catch (err) {
      console.error("Error fetching plant details:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, token, user?.user_id]);

  useEffect(() => {
    fetchPlantData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchPlantData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPlantData();
  };

  // Daily Plant NPK 30-Second Burst Sampling (1s, 15s, 28s)
  const handleStartNpkSampling = (slot) => {
    if (!selectedModuleId) {
      Alert.alert("Hardware Required", "Please select an ESP32 NPK node.");
      return;
    }

    if (sensorStatus && !sensorStatus.online) {
      Alert.alert("Module Offline", "Cannot start sampling: NPK Sensor module is offline. Please power on the ESP32 and check status.");
      return;
    }

    setSamplingNpkSlot(slot);
    setNpkCountdown(30);

    let secondsLeft = 30;
    const collected = [];

    const fetchSample = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-npk`, {
          headers: getAuthHeaders(token),
        });
        if (res.ok) {
          const d = await res.json();
          return {
            n: Number(d.nitrogen_n ?? d.nitrogen ?? 0),
            p: Number(d.phosphorus_p ?? d.phosphorus ?? 0),
            k: Number(d.potassium_k ?? d.potassium ?? 0),
          };
        }
      } catch (err) {
        console.warn("NPK sample read failed:", err);
      }
      return null;
    };

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(async () => {
      secondsLeft -= 1;
      setNpkCountdown(secondsLeft);
      const elapsed = 30 - secondsLeft;

      // 1st sample at 1st second, 2nd sample at 15th second, 3rd sample at 28th second
      if (elapsed === 1 || elapsed === 15 || elapsed === 28) {
        const sample = await fetchSample();
        if (sample) collected.push(sample);
      }

      if (secondsLeft <= 0) {
        clearInterval(timerRef.current);
        setSamplingNpkSlot(null);

        if (collected.length > 0) {
          const avgN = Math.round(collected.reduce((acc, r) => acc + r.n, 0) / collected.length);
          const avgP = Math.round(collected.reduce((acc, r) => acc + r.p, 0) / collected.length);
          const avgK = Math.round(collected.reduce((acc, r) => acc + r.k, 0) / collected.length);

          setStagedNpk((prev) => ({
            ...prev,
            [slot]: {
              n: avgN,
              p: avgP,
              k: avgK,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              submitted: false,
            },
          }));
        } else {
          Alert.alert("Sampling Error", "Failed to retrieve valid NPK telemetry.");
        }
      }
    }, 1000);
  };

  // Submit Daily Staged NPK to Supabase
  const handleSubmitNpk = async (slot) => {
    const staged = stagedNpk[slot];
    if (!staged) return;

    setSubmittingNpk(true);
    try {
      const res = await fetch(`${API_BASE_URL}/sensors/npk`, {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          nitrogen_n: staged.n,
          phosphorus_p: staged.p,
          potassium_k: staged.k,
          plant_id: id,
          time_slot: slot,
          module_id: selectedModuleId,
        }),
      });

      if (res.ok) {
        setStagedNpk((prev) => ({
          ...prev,
          [slot]: { ...prev[slot], submitted: true },
        }));
        Alert.alert("Success", `${slot.toUpperCase()} NPK reading saved to database.`);
        fetchPlantData();
      } else {
        const d = await res.json();
        Alert.alert("Error", d.detail || "Failed to save NPK reading.");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSubmittingNpk(false);
    }
  };

  const handleSaveUpdate = async () => {
    setSavingUpdate(true);
    try {
      const res = await fetch(`${API_BASE_URL}/plants/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          plant_name: formName.trim(),
          plant_species: formSpecies,
          location_id: formLocationId || null,
        }),
      });

      if (res.ok) {
        setIsModalVisible(false);
        fetchPlantData();
      } else {
        const d = await res.json();
        Alert.alert("Error", d.detail || "Failed to update plant.");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleRemovePlant = () => {
    Alert.alert(
      "Remove Plant",
      `Are you sure you want to remove "${plant?.plant_name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/plants/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders(token),
              });
              if (res.ok) router.back();
            } catch (err) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ]
    );
  };

  if (loading && !plant) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#f8fafc" }}>
        <Header title="Orchid Overview" />
        <View className="flex-1 items-center justify-center p-6">
          <ActivityIndicator color={colors.primary} size="large" />
          <Text className="text-xs text-gray-400 font-semibold mt-3">Loading orchid data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!plant) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#f8fafc" }}>
        <Header title="Orchid Overview" />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-base font-extrabold text-gray-800 mb-1">Orchid Not Found</Text>
          <Text className="text-xs text-gray-400 text-center mb-4">Could not retrieve information for this plant.</Text>
          <TouchableOpacity
            onPress={fetchPlantData}
            className="px-4 py-2 rounded-xl bg-emerald-600 shadow-xs"
          >
            <Text className="text-xs font-bold text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const locationName =
    plant.locations?.location_name ||
    locations.find((l) => l.location_id === plant.location_id)?.location_name ||
    "Unassigned Zone";

  const stagedActiveNpk = stagedNpk[activeNpkSlot];
  const isSamplingActiveSlot = samplingNpkSlot === activeNpkSlot;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#f8fafc" }}>
      <Header
        title="Orchid Overview"
        rightElement={
          <TouchableOpacity
            onPress={fetchPlantData}
            disabled={loading}
            className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-100 items-center justify-center"
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <RefreshCw size={14} color={colors.primary} />
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        className="flex-1 px-5 pt-3"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* 1. HERO PLANT INFO CARD */}
        <View className="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm mb-4">
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-1.5 mb-1">
                <View className="bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                  <Text className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                    {plant.plant_species}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full">
                  <MapPin size={10} color={colors.mediumGray} />
                  <Text className="text-[10px] font-medium text-gray-600">{locationName}</Text>
                </View>
              </View>

              <Text className="text-2xl font-black text-gray-900 tracking-tight" numberOfLines={1}>
                {plant.plant_name}
              </Text>
            </View>

            {/* Edit / Delete Icon Controls */}
            <View className="flex-row items-center gap-1.5">
              <TouchableOpacity
                onPress={() => setIsModalVisible(true)}
                className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200/80 items-center justify-center"
              >
                <Edit2 size={13} color={colors.mediumGray} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRemovePlant}
                className="w-8 h-8 rounded-full bg-red-50 border border-red-100 items-center justify-center"
              >
                <Trash2 size={13} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Soil NPK & Sensor Telemetry Highlights */}
          <View className="flex-row justify-between items-center pt-3 border-t border-gray-100 mt-1">
            <View className="flex-row items-center gap-1.5">
              <Radio size={13} color={colors.primary} />
              {loading ? (
                <View className="flex-row items-center gap-1.5">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text className="text-xs font-medium text-gray-400">Syncing telemetry...</Text>
                </View>
              ) : (
                <Text className="text-xs font-bold text-gray-700">
                  Sensors: {ambientTelemetry.temp !== "--" ? `${ambientTelemetry.temp}°C · ${ambientTelemetry.hum}%` : "Telemetry Ready"}
                </Text>
              )}
            </View>

            <View className="flex-row items-center gap-1.5">
              <Activity size={13} color="#059669" />
              {loading ? (
                <View className="flex-row items-center gap-1.5">
                  <ActivityIndicator size="small" color="#059669" />
                  <Text className="text-xs font-medium text-gray-400">Reading NPK...</Text>
                </View>
              ) : (
                <Text className="text-xs font-bold text-emerald-800">
                  Soil NPK: {lastNpkReading ? `${lastNpkReading.nitrogen}-${lastNpkReading.phosphorus}-${lastNpkReading.potassium} mg/kg` : "Ready"}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* 2. DIAGNOSTIC ACTION LAUNCHPAD */}
        <View className="flex-row justify-between mb-5">
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/analyse-fertilizer",
                params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
              })
            }
            activeOpacity={0.8}
            className="w-[31%] p-3.5 rounded-2xl bg-white border border-gray-100 shadow-xs items-center justify-center"
          >
            <View className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 items-center justify-center mb-1.5">
              <Image
                source={require("../assets/home-icons/fertilizer.png")}
                className="w-6 h-6"
                resizeMode="contain"
              />
            </View>
            <Text className="text-xs font-extrabold text-gray-800 text-center">Fertilizer</Text>
            <Text className="text-[9px] text-gray-400 font-medium">Nutrient Plan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/analyse-disease",
                params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
              })
            }
            activeOpacity={0.8}
            className="w-[31%] p-3.5 rounded-2xl bg-white border border-gray-100 shadow-xs items-center justify-center"
          >
            <View className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 items-center justify-center mb-1.5">
              <Image
                source={require("../assets/home-icons/syringe.png")}
                className="w-6 h-6"
                resizeMode="contain"
              />
            </View>
            <Text className="text-xs font-extrabold text-gray-800 text-center">Disease</Text>
            <Text className="text-[9px] text-gray-400 font-medium">AI Leaf Scan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/predict-blooming",
                params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
              })
            }
            activeOpacity={0.8}
            className="w-[31%] p-3.5 rounded-2xl bg-white border border-gray-100 shadow-xs items-center justify-center"
          >
            <View className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 items-center justify-center mb-1.5">
              <Image
                source={require("../assets/home-icons/orchid.png")}
                className="w-6 h-6"
                resizeMode="contain"
              />
            </View>
            <Text className="text-xs font-extrabold text-gray-800 text-center">Bloom</Text>
            <Text className="text-[9px] text-gray-400 font-medium">Forecast</Text>
          </TouchableOpacity>
        </View>

        {/* 3. SEGMENTED VIEW SWITCHER (Soil NPK & Sensors Highlighted First) */}
        <View className="flex-row p-1 bg-gray-200/60 rounded-2xl mb-4">
          <TouchableOpacity
            onPress={() => setActiveTab("sensors")}
            className={`flex-1 py-2.5 rounded-xl items-center justify-center ${
              activeTab === "sensors" ? "bg-white shadow-xs" : ""
            }`}
          >
            <Text
              className={`text-xs font-extrabold ${
                activeTab === "sensors" ? "text-emerald-800" : "text-gray-500"
              }`}
            >
              📡 Soil NPK & Sensors
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab("care")}
            className={`flex-1 py-2.5 rounded-xl items-center justify-center ${
              activeTab === "care" ? "bg-white shadow-xs" : ""
            }`}
          >
            <Text
              className={`text-xs font-extrabold ${
                activeTab === "care" ? "text-emerald-800" : "text-gray-500"
              }`}
            >
              🌱 Health & AI Care
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: HEALTH & AI CARE INSIGHTS */}
        {activeTab === "care" && (
          <View className="space-y-4 mb-8">
            {/* LAST DISEASE DIAGNOSTICS CARD */}
            <View className="p-4 rounded-3xl bg-white border border-gray-100 shadow-xs">
              <View className="flex-row justify-between items-center pb-2.5 mb-2.5 border-b border-gray-100">
                <View className="flex-row items-center gap-2">
                  <ShieldCheck size={16} color={colors.primary} />
                  <Text className="text-xs font-bold uppercase tracking-wider text-gray-800">
                    Disease Health Evaluation
                  </Text>
                </View>
                {lastDiseaseOutput?.created_at && (
                  <Text className="text-[10px] text-gray-400 font-medium">
                    {new Date(lastDiseaseOutput.created_at).toLocaleDateString()}
                  </Text>
                )}
              </View>

              {loading ? (
                <View className="py-7 items-center justify-center">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text className="text-xs text-gray-400 font-semibold mt-2.5">
                    Loading health evaluation history...
                  </Text>
                </View>
              ) : lastDiseaseOutput ? (
                <View className="space-y-2">
                  <View
                    className={`p-3 rounded-2xl flex-row items-center justify-between ${
                      lastDiseaseOutput.verdict === "HEALTHY"
                        ? "bg-emerald-50 border border-emerald-100"
                        : "bg-red-50 border border-red-100"
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      {lastDiseaseOutput.verdict === "HEALTHY" ? (
                        <ShieldCheck size={18} color={colors.primary} />
                      ) : (
                        <AlertTriangle size={18} color={colors.danger} />
                      )}
                      <Text
                        className={`text-sm font-black ${
                          lastDiseaseOutput.verdict === "HEALTHY"
                            ? "text-emerald-800"
                            : "text-red-700"
                        }`}
                      >
                        {lastDiseaseOutput.disease_name || lastDiseaseOutput.verdict || "Disease Evaluated"}
                      </Text>
                    </View>
                    <Text className="text-xs font-bold text-gray-600">
                      {lastDiseaseOutput.confidence ? `${lastDiseaseOutput.confidence}%` : "100%"} Confidence
                    </Text>
                  </View>

                  {lastDiseaseOutput.treatment && (
                    <View className="bg-gray-50/80 p-2.5 rounded-xl border border-gray-100 mt-1">
                      <Text className="text-[11px] font-bold text-gray-700 mb-0.5">Recommended Care Protocol:</Text>
                      <Text className="text-xs text-gray-600 italic">
                        {Array.isArray(lastDiseaseOutput.treatment)
                          ? lastDiseaseOutput.treatment[0]
                          : lastDiseaseOutput.treatment}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View className="py-4 items-center">
                  <Text className="text-xs italic text-gray-400 mb-2">No disease scans recorded yet.</Text>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/analyse-disease",
                        params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
                      })
                    }
                    className="px-4 py-1.5 rounded-xl bg-rose-50 border border-rose-200"
                  >
                    <Text className="text-xs font-bold text-rose-700">+ Run Leaf Scan</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* LAST BLOOM PREDICTIONS CARD */}
            <View className="p-4 rounded-3xl bg-white border border-gray-100 shadow-xs">
              <View className="flex-row justify-between items-center pb-2.5 mb-2.5 border-b border-gray-100">
                <View className="flex-row items-center gap-2">
                  <Flower2 size={16} color="#9333ea" />
                  <Text className="text-xs font-bold uppercase tracking-wider text-gray-800">
                    Bloom Forecast & Window
                  </Text>
                </View>
                <Sparkles size={14} color="#9333ea" />
              </View>

              {loading ? (
                <View className="py-7 items-center justify-center">
                  <ActivityIndicator size="small" color="#9333ea" />
                  <Text className="text-xs text-gray-400 font-semibold mt-2.5">
                    Calculating bloom forecast...
                  </Text>
                </View>
              ) : lastBloomPrediction ? (
                <View className="items-center py-2 space-y-1.5">
                  <Text className="text-xs text-gray-500 font-medium">Estimated Flowering</Text>
                  <Text className="text-2xl font-black text-purple-700 tracking-tight">
                    {lastBloomPrediction.weeks !== undefined
                      ? `${lastBloomPrediction.weeks} Weeks`
                      : lastBloomPrediction.bloom_status || lastBloomPrediction.prediction || "Analyzed"}
                  </Text>
                  {lastBloomPrediction.current_stage && (
                    <View className="bg-purple-50 px-3 py-1 rounded-full border border-purple-100 mt-1">
                      <Text className="text-xs font-bold text-purple-800">
                        Current Stage: {lastBloomPrediction.current_stage}
                      </Text>
                    </View>
                  )}
                  {(lastBloomPrediction.flowering_date_range_display || lastBloomPrediction.created_at) && (
                    <Text className="text-[11px] text-gray-400 mt-1">
                      Target Window: {lastBloomPrediction.flowering_date_range_display || new Date(lastBloomPrediction.created_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              ) : (
                <View className="py-4 items-center">
                  <Text className="text-xs italic text-gray-400 mb-2">No flowering forecast calculated yet.</Text>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/predict-blooming",
                        params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
                      })
                    }
                    className="px-4 py-1.5 rounded-xl bg-purple-50 border border-purple-200"
                  >
                    <Text className="text-xs font-bold text-purple-700">+ Forecast Bloom</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* LAST FERTILIZER SCHEDULE CARD */}
            <View className="p-4 rounded-3xl bg-white border border-gray-100 shadow-xs">
              <View className="flex-row justify-between items-center pb-2.5 mb-2.5 border-b border-gray-100">
                <View className="flex-row items-center gap-2">
                  <Activity size={16} color="#d97706" />
                  <Text className="text-xs font-bold uppercase tracking-wider text-gray-800">
                    Fertilizer Dosage & Schedule
                  </Text>
                </View>
                {(lastFertilizerSchedule?.growth_stage || lastFertilizerSchedule?.fertilizer) && (
                  <View className="bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100">
                    <Text className="text-[10px] font-bold text-amber-800">
                      {lastFertilizerSchedule.growth_stage || lastFertilizerSchedule.fertilizer}
                    </Text>
                  </View>
                )}
              </View>

              {loading ? (
                <View className="py-7 items-center justify-center">
                  <ActivityIndicator size="small" color="#d97706" />
                  <Text className="text-xs text-gray-400 font-semibold mt-2.5">
                    Loading fertilizer dosage schedule...
                  </Text>
                </View>
              ) : lastFertilizerSchedule ? (
                <View className="space-y-2">
                  <View className="flex-row justify-between items-center p-2.5 rounded-xl bg-amber-50/50 border border-amber-100">
                    <Text className="text-xs font-bold text-gray-700">Target NPK Formula:</Text>
                    <Text className="text-xs font-black text-amber-900">
                      {lastFertilizerSchedule.npk_recommendation?.target_ratio ||
                        (lastFertilizerSchedule.qty ? `${lastFertilizerSchedule.qty} ${lastFertilizerSchedule.unit || ""}` : "20-20-20 Standard")}
                    </Text>
                  </View>
                  {lastFertilizerSchedule.npk_recommendation?.recommendation && (
                    <Text className="text-xs text-gray-600 px-1 pt-1 leading-relaxed">
                      • {Array.isArray(lastFertilizerSchedule.npk_recommendation.recommendation)
                          ? lastFertilizerSchedule.npk_recommendation.recommendation[0]
                          : lastFertilizerSchedule.npk_recommendation.recommendation}
                    </Text>
                  )}
                </View>
              ) : (
                <View className="py-4 items-center">
                  <Text className="text-xs italic text-gray-400 mb-2">No fertilizer plan computed yet.</Text>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/analyse-fertilizer",
                        params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
                      })
                    }
                    className="px-4 py-1.5 rounded-xl bg-amber-50 border border-amber-200"
                  >
                    <Text className="text-xs font-bold text-amber-800">+ Calculate Dosage</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {/* TAB 2: SOIL NPK & HARDWARE SENSORS */}
        {activeTab === "sensors" && (
          <View className="space-y-4 mb-8">
            {/* REAL-TIME MICROCLIMATE METERS */}
            <View className="p-4 rounded-3xl bg-white border border-gray-100 shadow-xs">
              <View className="flex-row justify-between items-center pb-2.5 mb-3 border-b border-gray-100">
                <View className="flex-row items-center gap-2">
                  <Radio size={16} color={colors.primary} />
                  <Text className="text-xs font-bold uppercase tracking-wider text-gray-800">
                    Microclimate Readings
                  </Text>
                </View>
                <TouchableOpacity onPress={fetchPlantData}>
                  <RefreshCw size={13} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {loading ? (
                <View className="py-8 items-center justify-center">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text className="text-xs text-gray-400 font-semibold mt-2.5">
                    Fetching microclimate readings...
                  </Text>
                </View>
              ) : (
                <>
                  <View className="flex-row justify-between gap-2 mb-2">
                    <View className="flex-1 p-3 bg-rose-50/70 rounded-2xl border border-rose-100 items-center">
                      <Thermometer size={16} color="#e11d48" />
                      <Text className="text-[10px] font-bold text-rose-700 uppercase mt-1">Temp</Text>
                      <Text className="text-base font-black text-rose-900 mt-0.5">{ambientTelemetry.temp} °C</Text>
                    </View>

                    <View className="flex-1 p-3 bg-sky-50/70 rounded-2xl border border-sky-100 items-center">
                      <Droplets size={16} color="#0284c7" />
                      <Text className="text-[10px] font-bold text-sky-700 uppercase mt-1">Humidity</Text>
                      <Text className="text-base font-black text-sky-900 mt-0.5">{ambientTelemetry.hum} %</Text>
                    </View>

                    <View className="flex-1 p-3 bg-amber-50/70 rounded-2xl border border-amber-100 items-center">
                      <Sun size={16} color="#d97706" />
                      <Text className="text-[10px] font-bold text-amber-700 uppercase mt-1">Light</Text>
                      <Text className="text-base font-black text-amber-900 mt-0.5">{ambientTelemetry.lux} Lux</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between items-center pt-2 border-t border-gray-100 mt-1">
                    <Text className="text-[10px] text-gray-400 capitalize">
                      Slot: <Text className="font-bold text-gray-700">{ambientTelemetry.timeSlot}</Text>
                    </Text>
                    <Text className="text-[10px] text-gray-400">
                      {ambientTelemetry.timestamp ? new Date(ambientTelemetry.timestamp).toLocaleString() : "No reading"}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* LAST COCOPEAT NPK READING */}
            <View className="p-4 rounded-3xl bg-white border border-gray-100 shadow-xs">
              <View className="flex-row justify-between items-center pb-2.5 mb-2.5 border-b border-gray-100">
                <Text className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  Latest Cocopeat NPK
                </Text>
                {lastNpkReading?.time_slot && (
                  <View className="bg-gray-100 px-2 py-0.5 rounded-full">
                    <Text className="text-[10px] font-bold uppercase text-gray-600">
                      {lastNpkReading.time_slot}
                    </Text>
                  </View>
                )}
              </View>

              {loading ? (
                <View className="py-8 items-center justify-center">
                  <ActivityIndicator size="small" color="#059669" />
                  <Text className="text-xs text-gray-400 font-semibold mt-2.5">
                    Retrieving latest soil NPK levels...
                  </Text>
                </View>
              ) : lastNpkReading ? (
                <>
                  <View className="flex-row justify-between gap-2 py-1">
                    <View className="items-center flex-1 p-2.5 rounded-2xl bg-emerald-50 border border-emerald-100">
                      <Text className="text-[10px] font-bold text-emerald-800 uppercase">Nitrogen</Text>
                      <Text className="text-lg font-black text-emerald-900 mt-0.5">{lastNpkReading.nitrogen}</Text>
                      <Text className="text-[9px] text-emerald-600 font-medium">mg/kg</Text>
                    </View>

                    <View className="items-center flex-1 p-2.5 rounded-2xl bg-amber-50 border border-amber-100">
                      <Text className="text-[10px] font-bold text-amber-800 uppercase">Phosphorus</Text>
                      <Text className="text-lg font-black text-amber-900 mt-0.5">{lastNpkReading.phosphorus}</Text>
                      <Text className="text-[9px] text-amber-600 font-medium">mg/kg</Text>
                    </View>

                    <View className="items-center flex-1 p-2.5 rounded-2xl bg-rose-50 border border-rose-100">
                      <Text className="text-[10px] font-bold text-rose-800 uppercase">Potassium</Text>
                      <Text className="text-lg font-black text-rose-900 mt-0.5">{lastNpkReading.potassium}</Text>
                      <Text className="text-[9px] text-rose-600 font-medium">mg/kg</Text>
                    </View>
                  </View>

                  <Text className="text-[10px] text-right pt-2 border-t border-gray-100 text-gray-400 mt-2">
                    Logged: {lastNpkReading.created_at ? new Date(lastNpkReading.created_at).toLocaleString() : "Latest"}
                  </Text>
                </>
              ) : (
                <Text className="text-xs italic text-gray-400 py-3 text-center">No NPK telemetry logged yet.</Text>
              )}
            </View>

            {/* DAILY PLANT NPK BURST SAMPLING (TABBED CLEAN UI) */}
            <View className="p-4 rounded-3xl bg-white border border-gray-100 shadow-xs">
              <View className="flex-row justify-between items-center pb-2.5 mb-2.5 border-b border-gray-100">
                <View className="flex-row items-center gap-1.5">
                  <Activity size={16} color={colors.primary} />
                  <Text className="text-xs font-bold uppercase tracking-wider text-gray-800">
                    Daily NPK Burst Sampling
                  </Text>
                </View>
                <Text className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                  30-Sec Burst
                </Text>
              </View>

              {/* Sensor Node Select Component */}
              <View className="mb-3">
                <View className="flex-row items-center justify-between mb-1.5">
                  <View className="flex-row items-center gap-1.5">
                    <Cpu size={12} color={colors.primary} />
                    <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      NPK Sensor Node
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push("/sensors")}
                    className="flex-row items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100"
                  >
                    <Text className="text-[10px] font-bold text-emerald-800">⚙️ Hub</Text>
                  </TouchableOpacity>
                </View>

                {modules.length === 0 ? (
                  <View className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/90 flex-row items-center justify-between">
                    <Text className="text-[11px] text-amber-800 font-medium flex-1 mr-2">
                      No ESP32 sensor nodes paired.
                    </Text>
                    <TouchableOpacity
                      onPress={() => router.push("/sensors")}
                      className="px-2.5 py-1 bg-amber-600 rounded-lg"
                    >
                      <Text className="text-[10px] font-bold text-white">+ Pair Node</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                  >
                    {modules.map((m) => {
                      const isSelected = selectedModuleId === m.module_id;

                      return (
                        <TouchableOpacity
                          key={m.module_id}
                          onPress={() => setSelectedModuleId(m.module_id)}
                          className={`px-3 py-1.5 rounded-xl border flex-row items-center gap-2 ${
                            isSelected
                              ? "bg-white border-emerald-600 shadow-xs"
                              : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <View
                            className={`w-2 h-2 rounded-full ${
                              isSelected ? "bg-emerald-500" : "bg-gray-300"
                            }`}
                          />
                          <Text
                            className={`text-[11px] font-bold ${
                              isSelected ? "text-emerald-950" : "text-gray-700"
                            }`}
                          >
                            {m.device_name || "ESP32 Node"}
                          </Text>
                          <Text
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              isSelected
                                ? "bg-emerald-100 text-emerald-800 font-bold"
                                : "bg-gray-200/70 text-gray-500"
                            }`}
                          >
                            {m.module_id?.length > 6 ? m.module_id.slice(-6) : m.module_id}
                          </Text>
                          {isSelected && (
                            <View className="bg-emerald-600 px-1.5 py-0.5 rounded-md">
                              <Text className="text-[8px] font-black text-white tracking-wider">
                                ACTIVE
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              {/* Time Slot Tabs */}
              <View className="flex-row gap-2 mb-3">
                {[
                  { slot: "morning", label: "Morning", emoji: "☀️" },
                  { slot: "afternoon", label: "Afternoon", emoji: "⛅" },
                  { slot: "evening", label: "Evening", emoji: "🌙" },
                ].map(({ slot, label, emoji }) => {
                  const staged = stagedNpk[slot];
                  const isSelected = activeNpkSlot === slot;

                  return (
                    <TouchableOpacity
                      key={slot}
                      onPress={() => setActiveNpkSlot(slot)}
                      className={`flex-1 py-1.5 px-2 rounded-xl border flex-row items-center justify-center gap-1 ${
                        isSelected
                          ? "bg-emerald-50 border-emerald-600 shadow-xs"
                          : "bg-gray-50 border-gray-100"
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
                          staged?.submitted
                            ? "bg-emerald-500"
                            : staged
                            ? "bg-amber-500"
                            : "bg-gray-300"
                        }`}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Active Slot Sampling Card */}
              <View className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-100">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-xs font-bold capitalize text-gray-800">
                    {activeNpkSlot} Soil Sampling
                  </Text>
                  {stagedActiveNpk?.submitted ? (
                    <View className="bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex-row items-center gap-1">
                      <Text className="text-[10px] font-bold text-emerald-800">✅ Saved to DB</Text>
                    </View>
                  ) : stagedActiveNpk ? (
                    <View className="bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100">
                      <Text className="text-[10px] font-bold text-amber-800">🟡 Ready to Save</Text>
                    </View>
                  ) : (
                    <Text className="text-[10px] text-gray-400 font-medium">⚪ Ready to Sample</Text>
                  )}
                </View>

                {/* Sampling In Progress Indicator */}
                {isSamplingActiveSlot ? (
                  <View className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 mb-2.5">
                    <View className="flex-row justify-between items-center mb-1.5">
                      <Text className="text-xs font-bold text-emerald-800">
                        📡 Collecting NPK live samples...
                      </Text>
                      <Text className="text-xs font-black text-emerald-800">
                        ⏱️ {npkCountdown}s
                      </Text>
                    </View>
                    <View className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden mb-1">
                      <View
                        className="bg-emerald-600 h-full rounded-full"
                        style={{ width: `${((30 - npkCountdown) / 30) * 100}%` }}
                      />
                    </View>
                    <Text className="text-[10px] text-emerald-700">
                      Reading at 1s, 15s, and 28s (30s burst average)
                    </Text>
                  </View>
                ) : stagedActiveNpk ? (
                  <View className="flex-row justify-between items-center p-2.5 bg-white rounded-xl border border-gray-100 mb-2.5">
                    <View className="items-center flex-1">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase">🌱 Nitrogen</Text>
                      <Text className="text-sm font-black text-emerald-700">{stagedActiveNpk.n} mg/kg</Text>
                    </View>
                    <View className="items-center flex-1 border-x border-gray-100">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase">🌾 Phosphorus</Text>
                      <Text className="text-sm font-black text-amber-700">{stagedActiveNpk.p} mg/kg</Text>
                    </View>
                    <View className="items-center flex-1">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase">🌿 Potassium</Text>
                      <Text className="text-sm font-black text-rose-700">{stagedActiveNpk.k} mg/kg</Text>
                    </View>
                  </View>
                ) : (
                  <Text className="text-xs italic text-gray-400 py-1.5 mb-1.5">
                    No NPK data recorded for this slot yet. (30s 3-sample average)
                  </Text>
                )}

                {/* Sampling Action Buttons */}
                <View className="flex-row gap-2">
                  {isSamplingActiveSlot ? (
                    <View className="flex-1 py-2.5 bg-emerald-100 rounded-xl items-center justify-center">
                      <Text className="text-xs font-bold text-emerald-800">
                        Sampling ({npkCountdown}s)...
                      </Text>
                    </View>
                  ) : stagedActiveNpk && !stagedActiveNpk.submitted ? (
                    <>
                      <TouchableOpacity
                        onPress={() => handleSubmitNpk(activeNpkSlot)}
                        disabled={submittingNpk || Boolean(samplingNpkSlot)}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 items-center justify-center shadow-xs"
                      >
                        <Text className="text-xs font-bold text-white">
                          {submittingNpk ? "Saving..." : "💾 Save Reading to DB"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleStartNpkSampling(activeNpkSlot)}
                        disabled={Boolean(samplingNpkSlot) || submittingNpk}
                        className="px-3.5 py-2.5 bg-white rounded-xl border border-gray-200 items-center justify-center"
                      >
                        <Text className="text-xs font-bold text-gray-700">🔄 Re-Sample</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleStartNpkSampling(activeNpkSlot)}
                      disabled={Boolean(samplingNpkSlot)}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 items-center justify-center"
                    >
                      <Text className="text-xs font-bold text-emerald-800">
                        {stagedActiveNpk?.submitted
                          ? `🔄 Re-Sample ${activeNpkSlot.toUpperCase()} (30s)`
                          : `📡 Read ${activeNpkSlot.toUpperCase()} NPK (30s)`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* EDIT MODAL */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <View className="flex-1 justify-center items-center px-5 bg-black/50">
          <View className="w-full rounded-3xl p-6 bg-white shadow-xl border border-gray-100">
            <View className="flex-row justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <Text className="text-lg font-black text-gray-900">Update Orchid Plant</Text>
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
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
                value={formName}
                onChangeText={setFormName}
              />
            </View>

            <View className="mb-3.5">
              <Text className="text-xs font-bold uppercase mb-1.5 text-gray-700">Species</Text>
              <TouchableOpacity
                onPress={() => setShowSpeciesDropdown(!showSpeciesDropdown)}
                className="rounded-2xl px-4 py-3 flex-row justify-between items-center border border-gray-200 bg-gray-50/50"
              >
                <Text className="text-sm font-semibold capitalize text-gray-800">
                  {formSpecies}
                </Text>
                <ChevronDown size={16} color={colors.mediumGray} />
              </TouchableOpacity>
              {showSpeciesDropdown && (
                <View className="rounded-2xl mt-1.5 border border-gray-100 bg-white overflow-hidden shadow-sm">
                  {SPECIES_OPTIONS.map((spec) => (
                    <TouchableOpacity
                      key={spec}
                      onPress={() => {
                        setFormSpecies(spec);
                        setShowSpeciesDropdown(false);
                      }}
                      className="px-4 py-2.5 border-b border-gray-50 flex-row justify-between items-center"
                    >
                      <Text className="text-xs font-semibold text-gray-700">{spec}</Text>
                      {formSpecies === spec && <Check size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View className="mb-5">
              <Text className="text-xs font-bold uppercase mb-1.5 text-gray-700">Assign Zone</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 pt-1">
                <TouchableOpacity
                  onPress={() => setFormLocationId("")}
                  className={`px-3.5 py-2 rounded-xl border ${
                    !formLocationId
                      ? "bg-emerald-50 border-emerald-600"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      !formLocationId ? "text-emerald-800" : "text-gray-600"
                    }`}
                  >
                    Unassigned
                  </Text>
                </TouchableOpacity>
                {locations.map((l) => {
                  const isSelected = formLocationId === l.location_id;
                  return (
                    <TouchableOpacity
                      key={l.location_id}
                      onPress={() => setFormLocationId(l.location_id)}
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
                onPress={() => setIsModalVisible(false)}
                className="px-4 py-3 rounded-xl bg-gray-100"
              >
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveUpdate}
                disabled={savingUpdate}
                className="px-6 py-3 rounded-xl bg-emerald-600 shadow-xs"
              >
                {savingUpdate ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text className="text-xs font-bold text-white">Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}