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
  Edit,
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
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";

const SPECIES_OPTIONS = ["Dendrobium", "Phalaenopsis", "Oncidium", "Cattleya", "Vanda"];

export default function PlantDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user, token } = useSelector((state) => state.auth);

  const [plant, setPlant] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sensor Modules & NPK Burst Sampling State
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
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
  const [formName, setFormName] = useState("");
  const [formSpecies, setFormSpecies] = useState("Dendrobium");
  const [formLocationId, setFormLocationId] = useState("");
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

      // 1. Fetch Plant & Locations
      const [pRes, locRes, modRes] = await Promise.all([
        fetch(`${API_BASE_URL}/plants/${id}`, { headers }),
        fetch(`${API_BASE_URL}/locations/user/${user.user_id}`, { headers }),
        fetch(`${API_BASE_URL}/sensors/modules/user/${user.user_id}`, { headers }),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setPlant(pData);
        setFormName(pData.plant_name);
        setFormSpecies(pData.plant_species);
        setFormLocationId(pData.location_id || "");
      }
      if (locRes.ok) setLocations(await locRes.json());
      if (modRes.ok) {
        const mods = await modRes.json();
        setModules(mods);
        if (mods.length > 0 && !selectedModuleId) setSelectedModuleId(mods[0].module_id);
      }

      // 2. Fetch Real-Time Microclimate Telemetry (DHT11 & BH1750)
      const [dhtRes, bhRes] = await Promise.all([
        fetch(`${API_BASE_URL}/sensors/dht11/plant/${id}?page=1&limit=20`, { headers }),
        fetch(`${API_BASE_URL}/sensors/bh1750/plant/${id}?page=1&limit=20`, { headers }),
      ]);

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

      // 3. Fetch Last NPK Reading
      const npkRes = await fetch(`${API_BASE_URL}/sensors/npk/plant/${id}?page=1&limit=20`, { headers });
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

      // 4. Fetch Last Fertilizer Schedule
      const fertRes = await fetch(`${API_BASE_URL}/fertilizer/plant/${id}?page=1&limit=20`, { headers });
      if (fertRes.ok) {
        const fertData = await fertRes.json();
        const latestFert = extractLatestItem(fertData);
        if (latestFert) setLastFertilizerSchedule(latestFert);
      }

      // 5. Fetch Last Disease Output
      const diseaseRes = await fetch(`${API_BASE_URL}/disease/plant/${id}?page=1&limit=20`, { headers });
      if (diseaseRes.ok) {
        const disData = await diseaseRes.json();
        const latestDis = extractLatestItem(disData);
        if (latestDis) setLastDiseaseOutput(latestDis);
      }

      // 6. Fetch Last Bloom Prediction
      const bloomRes = await fetch(`${API_BASE_URL}/bloom/plant/${id}?page=1&limit=20`, { headers });
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
  }, [id, token, user?.user_id, selectedModuleId]);

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

  // Daily Plant NPK Burst Sampling (1-min average: 3 samples)
  const handleStartNpkSampling = (slot) => {
    if (!selectedModuleId) {
      Alert.alert("Hardware Required", "Please select an ESP32 NPK node.");
      return;
    }

    setSamplingNpkSlot(slot);
    setNpkCountdown(60);

    let secondsLeft = 60;
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

      if (secondsLeft === 40 || secondsLeft === 20 || secondsLeft === 0) {
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

  if (loading || !plant) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: colors.lightGray }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const locationName =
    plant.locations?.location_name ||
    locations.find((l) => l.location_id === plant.location_id)?.location_name ||
    "Unassigned Zone";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Plant Overview" />

      <ScrollView
        className="flex-1 p-5"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Top Info Card */}
        <View className="p-5 rounded-2xl border mb-4 bg-white shadow-xs" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-start mb-1.5">
            <Text className="text-2xl font-black" style={{ color: colors.darkGray }}>
              {plant.plant_name}
            </Text>
            <Text
              className="text-xs font-bold px-2.5 py-1 rounded-full uppercase border"
              style={{
                color: colors.primary,
                backgroundColor: colors.primaryLight,
                borderColor: colors.primaryLight,
              }}
            >
              {plant.plant_species}
            </Text>
          </View>
          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center gap-1">
              <MapPin size={14} color={colors.mediumGray} />
              <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>
                {locationName}
              </Text>
            </View>
            <Text className="text-xs font-semibold" style={{ color: colors.mediumGray }}>
              ID: {plant.plant_id || plant.id}
            </Text>
          </View>
        </View>

        {/* Diagnostic Triggers */}
        <View className="flex-row justify-between mb-4">
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/analyse-fertilizer",
                params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
              })
            }
            activeOpacity={0.8}
            className="w-[31%] p-3 rounded-2xl border items-center justify-center bg-white shadow-xs"
            style={{ borderColor: colors.borderGray }}
          >
            <Image source={require("../assets/home-icons/fertilizer.png")} className="w-10 h-10 mb-1.5" resizeMode="contain" />
            <Text className="text-[11px] font-bold text-center" style={{ color: colors.darkGray }}>
              Fertilizer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/analyse-disease",
                params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
              })
            }
            activeOpacity={0.8}
            className="w-[31%] p-3 rounded-2xl border items-center justify-center bg-white shadow-xs"
            style={{ borderColor: colors.borderGray }}
          >
            <Image source={require("../assets/home-icons/syringe.png")} className="w-10 h-10 mb-1.5" resizeMode="contain" />
            <Text className="text-[11px] font-bold text-center" style={{ color: colors.darkGray }}>
              Disease
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/predict-blooming",
                params: { plant_id: plant.plant_id || plant.id, plant_name: plant.plant_name },
              })
            }
            activeOpacity={0.8}
            className="w-[31%] p-3 rounded-2xl border items-center justify-center bg-white shadow-xs"
            style={{ borderColor: colors.borderGray }}
          >
            <Image source={require("../assets/home-icons/orchid.png")} className="w-10 h-10 mb-1.5" resizeMode="contain" />
            <Text className="text-[11px] font-bold text-center" style={{ color: colors.darkGray }}>
              Bloom
            </Text>
          </TouchableOpacity>
        </View>

        {/* 1. DAILY PLANT NPK SAMPLING CARD */}
        <View className="p-4 rounded-2xl border mb-4 bg-white shadow-xs" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center pb-2 mb-2 border-b" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row items-center gap-1.5">
              <Activity size={16} color={colors.primary} />
              <Text className="text-sm font-extrabold" style={{ color: colors.darkGray }}>
                Daily Plant NPK Sampling
              </Text>
            </View>
            <Text className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
              1-Min Burst
            </Text>
          </View>

          <Text className="text-[11px] text-gray-500 mb-3">
            Collect 3 consecutive sensor reads to log daily nutrient status.
          </Text>

          {/* Full Width Time-Slot Cards */}
          <View className="space-y-3">
            {["morning", "afternoon", "evening"].map((slot) => {
              const isSampling = samplingNpkSlot === slot;
              const staged = stagedNpk[slot];

              return (
                <View
                  key={slot}
                  className="p-3.5 bg-gray-50 rounded-2xl border space-y-2.5"
                  style={{ borderColor: colors.borderGray }}
                >
                  <View className="flex-row justify-between items-center">
                    <Text className="text-xs font-bold capitalize" style={{ color: colors.darkGray }}>
                      {slot} Slot Sampling
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

                  {/* Sampling In Progress Indicator */}
                  {isSampling ? (
                    <View className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1.5">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-xs font-bold text-emerald-800">
                          Collecting NPK samples...
                        </Text>
                        <Text className="text-xs font-bold text-emerald-800">
                          {npkCountdown}s remaining
                        </Text>
                      </View>
                      <View className="w-full bg-emerald-200 rounded-full h-1.5 overflow-hidden">
                        <View
                          className="bg-emerald-600 h-full rounded-full"
                          style={{ width: `${((60 - npkCountdown) / 60) * 100}%` }}
                        />
                      </View>
                    </View>
                  ) : staged ? (
                    /* Full-width metrics display */
                    <View className="flex-row justify-between items-center p-2.5 bg-white rounded-xl border" style={{ borderColor: colors.borderGray }}>
                      <View className="items-center flex-1">
                        <Text className="text-[10px] font-bold text-gray-400 uppercase">Nitrogen (N)</Text>
                        <Text className="text-sm font-black text-emerald-700">{staged.n} mg/kg</Text>
                      </View>
                      <View className="items-center flex-1 border-x border-gray-100">
                        <Text className="text-[10px] font-bold text-gray-400 uppercase">Phosphorus (P)</Text>
                        <Text className="text-sm font-black text-amber-700">{staged.p} mg/kg</Text>
                      </View>
                      <View className="items-center flex-1">
                        <Text className="text-[10px] font-bold text-gray-400 uppercase">Potassium (K)</Text>
                        <Text className="text-sm font-black text-rose-700">{staged.k} mg/kg</Text>
                      </View>
                    </View>
                  ) : (
                    <Text className="text-xs italic text-gray-400">
                      No NPK burst data recorded for this slot yet.
                    </Text>
                  )}

                  {/* Full-width action buttons */}
                  <View className="flex-row gap-2 pt-1">
                    <TouchableOpacity
                      onPress={() => handleStartNpkSampling(slot)}
                      disabled={Boolean(samplingNpkSlot)}
                      className="flex-1 py-2.5 rounded-xl items-center justify-center bg-white border"
                      style={{ borderColor: colors.borderGray }}
                    >
                      <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>
                        {isSampling ? "Reading..." : staged ? "Re-Check Values" : "Check Values"}
                      </Text>
                    </TouchableOpacity>

                    {staged && !staged.submitted && (
                      <TouchableOpacity
                        onPress={() => handleSubmitNpk(slot)}
                        disabled={submittingNpk || Boolean(samplingNpkSlot)}
                        className="flex-1 py-2.5 rounded-xl items-center justify-center shadow-xs"
                        style={{ backgroundColor: colors.primary }}
                      >
                        <Text className="text-xs font-bold text-white">
                          {submittingNpk ? "Saving..." : "Submit Reading"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* 2. REAL-TIME HARDWARE SENSOR TELEMETRY CARD */}
        <View className="p-4 rounded-2xl border mb-4 bg-white shadow-xs" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center pb-2 mb-3 border-b" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row items-center gap-1.5">
              <Radio size={16} color={colors.primary} />
              <Text className="text-sm font-extrabold" style={{ color: colors.darkGray }}>
                Real-Time Hardware Microclimate
              </Text>
            </View>
            <TouchableOpacity onPress={fetchPlantData}>
              <RefreshCw size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View className="grid grid-cols-3 gap-2 flex-row justify-between mb-2">
            <View className="flex-1 p-2 bg-rose-50/60 rounded-xl border border-rose-100 items-center">
              <Text className="text-[10px] font-bold text-rose-700 uppercase">Temp</Text>
              <Text className="text-sm font-black text-rose-900 mt-0.5">{ambientTelemetry.temp} °C</Text>
            </View>
            <View className="flex-1 p-2 bg-sky-50/60 rounded-xl border border-sky-100 items-center mx-1.5">
              <Text className="text-[10px] font-bold text-sky-700 uppercase">Humidity</Text>
              <Text className="text-sm font-black text-sky-900 mt-0.5">{ambientTelemetry.hum} %</Text>
            </View>
            <View className="flex-1 p-2 bg-amber-50/60 rounded-xl border border-amber-100 items-center">
              <Text className="text-[10px] font-bold text-amber-700 uppercase">Light</Text>
              <Text className="text-sm font-black text-amber-900 mt-0.5">{ambientTelemetry.lux} Lux</Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center pt-2 border-t" style={{ borderColor: colors.borderGray }}>
            <Text className="text-[10px] font-semibold text-gray-400 capitalize">
              Slot: <Text className="font-bold text-gray-600">{ambientTelemetry.timeSlot}</Text>
            </Text>
            <Text className="text-[10px] text-gray-400">
              {ambientTelemetry.timestamp ? new Date(ambientTelemetry.timestamp).toLocaleString() : "No reading"}
            </Text>
          </View>
        </View>

        {/* 3. LAST NPK READING CARD */}
        <View className="p-4 rounded-2xl border mb-4 bg-white shadow-xs" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center pb-2 mb-2 border-b" style={{ borderColor: colors.borderGray }}>
            <Text className="text-sm font-extrabold" style={{ color: colors.darkGray }}>
              Last Cocopeat NPK Reading
            </Text>
            {lastNpkReading?.time_slot && (
              <Text className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                {lastNpkReading.time_slot}
              </Text>
            )}
          </View>

          {lastNpkReading ? (
            <>
              <View className="flex-row justify-around py-1.5">
                <View className="items-center flex-1 p-2 rounded-xl bg-emerald-50">
                  <Text className="text-[10px] font-bold text-gray-400">Nitrogen</Text>
                  <Text className="text-base font-black text-emerald-700">
                    {lastNpkReading.nitrogen}
                  </Text>
                  <Text className="text-[9px] text-gray-400">mg/kg</Text>
                </View>
                <View className="items-center flex-1 p-2 rounded-xl bg-amber-50 mx-2">
                  <Text className="text-[10px] font-bold text-gray-400">Phosphorus</Text>
                  <Text className="text-base font-black text-amber-700">
                    {lastNpkReading.phosphorus}
                  </Text>
                  <Text className="text-[9px] text-gray-400">mg/kg</Text>
                </View>
                <View className="items-center flex-1 p-2 rounded-xl bg-rose-50">
                  <Text className="text-[10px] font-bold text-gray-400">Potassium</Text>
                  <Text className="text-base font-black text-rose-700">
                    {lastNpkReading.potassium}
                  </Text>
                  <Text className="text-[9px] text-gray-400">mg/kg</Text>
                </View>
              </View>
              <Text className="text-[10px] text-right pt-2 border-t text-gray-400 mt-1" style={{ borderColor: colors.borderGray }}>
                Recorded: {lastNpkReading.created_at ? new Date(lastNpkReading.created_at).toLocaleString() : "Latest"}
              </Text>
            </>
          ) : (
            <Text className="text-xs italic text-gray-400 py-2 text-center">No NPK telemetry logged yet.</Text>
          )}
        </View>

        {/* 4. LAST DISEASE OUTPUTS CARD */}
        <View className="p-4 rounded-2xl border mb-4 bg-white shadow-xs" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center pb-2 mb-2 border-b" style={{ borderColor: colors.borderGray }}>
            <Text className="text-sm font-extrabold" style={{ color: colors.darkGray }}>
              Last Disease Diagnostics
            </Text>
            {lastDiseaseOutput && (
              <Text className="text-[10px] font-bold text-gray-400">
                {lastDiseaseOutput.created_at ? new Date(lastDiseaseOutput.created_at).toLocaleDateString() : "Latest"}
              </Text>
            )}
          </View>

          {lastDiseaseOutput ? (
            <View className="space-y-2">
              <View
                className="p-2.5 rounded-xl flex-row items-center justify-between"
                style={{
                  backgroundColor:
                    lastDiseaseOutput.verdict === "HEALTHY" ? colors.primaryLight : colors.dangerLight,
                }}
              >
                <View className="flex-row items-center gap-1.5">
                  {lastDiseaseOutput.verdict === "HEALTHY" ? (
                    <ShieldCheck size={16} color={colors.primary} />
                  ) : (
                    <AlertTriangle size={16} color={colors.danger} />
                  )}
                  <Text
                    className="text-xs font-black"
                    style={{
                      color: lastDiseaseOutput.verdict === "HEALTHY" ? colors.primary : colors.danger,
                    }}
                  >
                    {lastDiseaseOutput.disease_name || lastDiseaseOutput.verdict || "Disease Evaluated"}
                  </Text>
                </View>
                <Text className="text-[10px] font-bold text-gray-600">
                  {lastDiseaseOutput.confidence ? `${lastDiseaseOutput.confidence}%` : "100%"} Match
                </Text>
              </View>

              {lastDiseaseOutput.treatment && (
                <Text className="text-[11px] text-gray-600 italic px-1">
                  Protocol: {Array.isArray(lastDiseaseOutput.treatment) ? lastDiseaseOutput.treatment[0] : lastDiseaseOutput.treatment}
                </Text>
              )}
            </View>
          ) : (
            <Text className="text-xs italic text-gray-400 py-2 text-center">No disease analysis conducted yet.</Text>
          )}
        </View>

        {/* 5. LAST FERTILIZER SCHEDULE CARD */}
        <View className="p-4 rounded-2xl border mb-4 bg-white shadow-xs" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center pb-2 mb-2 border-b" style={{ borderColor: colors.borderGray }}>
            <Text className="text-sm font-extrabold" style={{ color: colors.darkGray }}>
              Last Fertilizer Schedule
            </Text>
            {(lastFertilizerSchedule?.growth_stage || lastFertilizerSchedule?.fertilizer) && (
              <Text className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                {lastFertilizerSchedule.growth_stage || lastFertilizerSchedule.fertilizer}
              </Text>
            )}
          </View>

          {lastFertilizerSchedule ? (
            <View className="space-y-1.5">
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Target Ratio:</Text>
                <Text className="text-xs font-bold text-gray-800">
                  {lastFertilizerSchedule.npk_recommendation?.target_ratio ||
                    (lastFertilizerSchedule.qty ? `${lastFertilizerSchedule.qty} ${lastFertilizerSchedule.unit || ""}` : "20-20-20 Standard")}
                </Text>
              </View>
              {lastFertilizerSchedule.npk_recommendation?.recommendation && (
                <Text className="text-[11px] text-gray-600 pt-1">
                  • {Array.isArray(lastFertilizerSchedule.npk_recommendation.recommendation)
                      ? lastFertilizerSchedule.npk_recommendation.recommendation[0]
                      : lastFertilizerSchedule.npk_recommendation.recommendation}
                </Text>
              )}
            </View>
          ) : (
            <Text className="text-xs italic text-gray-400 py-2 text-center">No fertilizer schedule computed yet.</Text>
          )}
        </View>

        {/* 6. LAST BLOOM PREDICTIONS CARD */}
        <View className="p-4 rounded-2xl border mb-6 bg-white shadow-xs" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center pb-2 mb-2 border-b" style={{ borderColor: colors.borderGray }}>
            <Text className="text-sm font-extrabold" style={{ color: colors.darkGray }}>
              Last Bloom Prediction
            </Text>
            <Flower2 size={16} color={colors.primary} />
          </View>

          {lastBloomPrediction ? (
            <View className="items-center py-2 space-y-1">
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                Estimated in{" "}
                <Text className="text-xl font-black">
                  {lastBloomPrediction.weeks !== undefined
                    ? `${lastBloomPrediction.weeks} Weeks`
                    : lastBloomPrediction.bloom_status || lastBloomPrediction.prediction || "Analyzed"}
                </Text>
              </Text>
              {lastBloomPrediction.current_stage && (
                <Text className="text-xs text-gray-500">
                  Current Stage: <Text className="font-bold text-gray-700">{lastBloomPrediction.current_stage}</Text>
                </Text>
              )}
              {(lastBloomPrediction.flowering_date_range_display || lastBloomPrediction.created_at) && (
                <Text className="text-[10px] font-semibold text-gray-400">
                  Window: {lastBloomPrediction.flowering_date_range_display || new Date(lastBloomPrediction.created_at).toLocaleDateString()}
                </Text>
              )}
            </View>
          ) : (
            <Text className="text-xs italic text-gray-400 py-2 text-center">No bloom forecast on record.</Text>
          )}
        </View>

        {/* Action Controls */}
        <View className="flex-row justify-between mb-8">
          <TouchableOpacity
            onPress={() => setIsModalVisible(true)}
            className="w-[48%] py-3.5 rounded-xl flex-row items-center justify-center shadow-xs"
            style={{ backgroundColor: colors.primary }}
          >
            <Edit size={16} color={colors.white} />
            <Text className="font-bold ml-1.5 text-xs text-white">Edit Plant</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRemovePlant}
            className="w-[48%] py-3.5 rounded-xl border flex-row items-center justify-center shadow-xs"
            style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
          >
            <Trash2 size={16} color={colors.danger} />
            <Text className="font-bold ml-1.5 text-xs" style={{ color: colors.danger }}>Delete Plant</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* EDIT MODAL */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <View className="flex-1 justify-center items-center px-5" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View className="w-full rounded-3xl p-6 bg-white shadow-xl border" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row justify-between items-center mb-4 pb-2 border-b" style={{ borderColor: colors.borderGray }}>
              <Text className="text-lg font-bold" style={{ color: colors.darkGray }}>Update Plant</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <X size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>Plant Identifier</Text>
              <TextInput
                className="rounded-xl px-3.5 py-2.5 text-sm border bg-gray-50"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
                value={formName}
                onChangeText={setFormName}
              />
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>Species</Text>
              <TouchableOpacity
                onPress={() => setShowSpeciesDropdown(!showSpeciesDropdown)}
                className="rounded-xl px-3.5 py-2.5 flex-row justify-between items-center border bg-gray-50"
                style={{ borderColor: colors.borderGray }}
              >
                <Text className="text-sm font-semibold capitalize" style={{ color: colors.darkGray }}>
                  {formSpecies}
                </Text>
                <ChevronDown size={16} color={colors.mediumGray} />
              </TouchableOpacity>
              {showSpeciesDropdown && (
                <View className="rounded-xl mt-1 border bg-white overflow-hidden" style={{ borderColor: colors.borderGray }}>
                  {SPECIES_OPTIONS.map((spec) => (
                    <TouchableOpacity
                      key={spec}
                      onPress={() => {
                        setFormSpecies(spec);
                        setShowSpeciesDropdown(false);
                      }}
                      className="px-3.5 py-2 border-b flex-row justify-between items-center"
                      style={{ borderColor: colors.borderGray }}
                    >
                      <Text className="text-xs font-medium" style={{ color: colors.darkGray }}>{spec}</Text>
                      {formSpecies === spec && <Check size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View className="mb-5">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>Assign Zone</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 pt-1">
                <TouchableOpacity
                  onPress={() => setFormLocationId("")}
                  className="px-3 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: !formLocationId ? colors.primaryLight : colors.white,
                    borderColor: !formLocationId ? colors.primary : colors.borderGray,
                  }}
                >
                  <Text className="text-xs font-semibold" style={{ color: !formLocationId ? colors.primary : colors.mediumGray }}>None</Text>
                </TouchableOpacity>
                {locations.map((l) => (
                  <TouchableOpacity
                    key={l.location_id}
                    onPress={() => setFormLocationId(l.location_id)}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{
                      backgroundColor: formLocationId === l.location_id ? colors.primaryLight : colors.white,
                      borderColor: formLocationId === l.location_id ? colors.primary : colors.borderGray,
                    }}
                  >
                    <Text className="text-xs font-semibold" style={{ color: formLocationId === l.location_id ? colors.primary : colors.mediumGray }}>
                      {l.location_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View className="flex-row justify-end gap-2">
              <TouchableOpacity onPress={() => setIsModalVisible(false)} className="px-4 py-2.5 rounded-xl bg-gray-100">
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveUpdate}
                disabled={savingUpdate}
                className="px-5 py-2.5 rounded-xl"
                style={{ backgroundColor: colors.primary }}
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