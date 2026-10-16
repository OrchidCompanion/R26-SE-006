import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSelector } from "react-redux";
import {
  Camera,
  RotateCcw,
  AlertCircle,
  Clock,
  Sparkles,
  Info,
  CheckCircle2,
  Calendar,
  Layers,
  Thermometer,
  Droplets,
  Sun,
  Flower2,
  Trash2,
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";

const STAGE_CONFIG = {
  Seedling: {
    bg: "#ecfdf5",
    border: "#a7f3d0",
    text: "#065f46",
    badge: "#059669",
    desc: "Early juvenile vegetative growth phase with developing root structure.",
  },
  Vegetative: {
    bg: "#f0fdfa",
    border: "#99f6e4",
    text: "#115e59",
    badge: "#0d9488",
    desc: "Active vegetative development of leaves and elongated pseudobulb canes.",
  },
  Mature_Pseudobulb: {
    bg: "#fffbeb",
    border: "#fde68a",
    text: "#92400e",
    badge: "#d97706",
    desc: "Fully swollen mature pseudobulbs storing carbohydrate reserves for spikes.",
  },
  Bud_formation: {
    bg: "#faf5ff",
    border: "#e9d5ff",
    text: "#6b21a8",
    badge: "#9333ea",
    desc: "Elongated flower spikes with visible swollen floral bud clusters.",
  },
  Flowering: {
    bg: "#fff1f2",
    border: "#fecdd3",
    text: "#9f1239",
    badge: "#e11d48",
    desc: "Full floral anthesis with vibrant, fully opened orchid blossoms.",
  },
  Invalid: {
    bg: "#fff1f2",
    border: "#fda4af",
    text: "#9f1239",
    badge: "#e11d48",
    desc: "Identified as 'Invalid' — Non-orchid image detected. Please upload a clear photo of your Dendrobium orchid.",
  },
  "Non-Orchid": {
    bg: "#fff1f2",
    border: "#fda4af",
    text: "#9f1239",
    badge: "#e11d48",
    desc: "Non-orchid image or document detected. Please upload a genuine Dendrobium orchid photo.",
  },
};

const ANGLE_SLOTS = [
  {
    id: "slot1",
    key: "image1",
    title: "Angle 1: Frontal View",
    tag: "90° Perpendicular",
    requirement: "Full-plant frontal view at eye level, camera positioned perpendicular (90°) to plant base.",
    icon: "📸",
  },
  {
    id: "slot2",
    key: "image2",
    title: "Angle 2: Lateral Profile 1",
    tag: "Side Angle 1",
    requirement: "First lateral side profile (~120°) capturing pseudobulb canes and leaf junctions.",
    icon: "📐",
  },
  {
    id: "slot3",
    key: "image3",
    title: "Angle 3: Lateral Profile 2",
    tag: "Side Angle 2",
    requirement: "Opposite lateral side profile (~240°) displaying canopy density and active spike tips.",
    icon: "🔄",
  },
];

export default function PredictBloomingScreen() {
  const router = useRouter();
  const { plant_id, plant_name } = useLocalSearchParams();
  const { user, token } = useSelector((state) => state.auth);

  const [angleFiles, setAngleFiles] = useState({
    slot1: null,
    slot2: null,
    slot3: null,
  });
  const [invalidSlots, setInvalidSlots] = useState({
    slot1: false,
    slot2: false,
    slot3: false,
  });
  const [invalidAngleInfo, setInvalidAngleInfo] = useState([]);

  const [telemetryReadings, setTelemetryReadings] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  const fetchPlantEnvironmentTelemetry = useCallback(async () => {
    if (!plant_id) {
      setLoadingTelemetry(false);
      return;
    }

    setLoadingTelemetry(true);
    try {
      const headers = getAuthHeaders(token);
      const [dhtRes, bhRes] = await Promise.all([
        fetch(`${API_BASE_URL}/sensors/dht11/plant/${plant_id}?page=1&limit=100`, { headers }),
        fetch(`${API_BASE_URL}/sensors/bh1750/plant/${plant_id}?page=1&limit=100`, { headers }),
      ]);

      const dhtData = dhtRes.ok ? await dhtRes.json() : { data: [] };
      const bhData = bhRes.ok ? await bhRes.json() : { data: [] };

      const dhtList = Array.isArray(dhtData) ? dhtData : dhtData.data || [];
      const bhList = Array.isArray(bhData) ? bhData : bhData.data || [];

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const combined = dhtList
        .filter((item) => !item.created_at || new Date(item.created_at).getTime() >= thirtyDaysAgo)
        .map((dhtItem, idx) => {
          const matchingLux = bhList[idx] ? (bhList[idx].lux ?? bhList[idx].lux_lx) : null;
          return {
            id: dhtItem.reading_id || idx,
            temperature: dhtItem.temperature,
            humidity: dhtItem.humidity,
            lux: matchingLux !== null ? matchingLux : "—",
            created_at: dhtItem.created_at,
          };
        });

      setTelemetryReadings(combined);
    } catch (err) {
      console.error("Failed to load environment telemetry:", err);
    } finally {
      setLoadingTelemetry(false);
    }
  }, [plant_id, token]);

  const fetchPlantPredictionHistory = useCallback(async () => {
    if (!plant_id) return;
    setLoadingHistory(true);
    try {
      const headers = getAuthHeaders(token);
      const res = await fetch(`${API_BASE_URL}/bloom/plant/${plant_id}?limit=10`, { headers });
      if (res.ok) {
        const data = await res.json();
        setHistoryList(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch prediction history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [plant_id, token]);

  useEffect(() => {
    fetchPlantEnvironmentTelemetry();
    fetchPlantPredictionHistory();
  }, [fetchPlantEnvironmentTelemetry, fetchPlantPredictionHistory]);

  const pickImageForSlot = async (slotId) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Allow photo library access to upload angle photos.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (!res.canceled && res.assets[0]) {
      setAngleFiles((prev) => ({ ...prev, [slotId]: res.assets[0] }));
      setInvalidSlots((prev) => ({ ...prev, [slotId]: false }));
      setError("");
    }
  };

  const handleRemoveSlotFile = (slotId) => {
    setAngleFiles((prev) => ({ ...prev, [slotId]: null }));
    setInvalidSlots((prev) => ({ ...prev, [slotId]: false }));
  };

  const handleResetScan = () => {
    setAngleFiles({ slot1: null, slot2: null, slot3: null });
    setInvalidSlots({ slot1: false, slot2: false, slot3: false });
    setInvalidAngleInfo([]);
    setPredictionResult(null);
    setError("");
  };

  const uploadedCount = Object.values(angleFiles).filter(Boolean).length;
  const isReadyToPredict = uploadedCount === 3;

  const handleRunPrediction = async () => {
    if (!isReadyToPredict) {
      setError(`All 3 angle photos are strictly required. Currently uploaded: ${uploadedCount}/3.`);
      return;
    }

    setAnalyzing(true);
    setError("");
    setInvalidSlots({ slot1: false, slot2: false, slot3: false });
    setInvalidAngleInfo([]);

    try {
      const formData = new FormData();
      formData.append("plant_id", plant_id || "default");
      formData.append("image1", {
        uri: angleFiles.slot1.uri,
        name: "angle1.jpg",
        type: "image/jpeg",
      });
      formData.append("image2", {
        uri: angleFiles.slot2.uri,
        name: "angle2.jpg",
        type: "image/jpeg",
      });
      formData.append("image3", {
        uri: angleFiles.slot3.uri,
        name: "angle3.jpg",
        type: "image/jpeg",
      });

      const res = await fetch(`${API_BASE_URL}/bloom/predict`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        const errDetail = data.detail || "Bloom prediction analysis failed.";

        const isNonOrchid =
          errDetail.toLowerCase().includes("non-orchid") ||
          errDetail.toLowerCase().includes("not an orchid") ||
          errDetail.toLowerCase().includes("invalid");

        if (isNonOrchid) {
          const newInvalidSlots = { slot1: false, slot2: false, slot3: false };
          const details = [];

          const hasAngle1 = /angle\s*1/i.test(errDetail) || /frontal/i.test(errDetail);
          const hasAngle2 = /angle\s*2/i.test(errDetail) || /lateral profile 1/i.test(errDetail);
          const hasAngle3 = /angle\s*3/i.test(errDetail) || /lateral profile 2/i.test(errDetail);

          if (hasAngle1) {
            newInvalidSlots.slot1 = true;
            details.push("Angle 1 (Frontal View)");
          }
          if (hasAngle2) {
            newInvalidSlots.slot2 = true;
            details.push("Angle 2 (Lateral Profile 1)");
          }
          if (hasAngle3) {
            newInvalidSlots.slot3 = true;
            details.push("Angle 3 (Lateral Profile 2)");
          }

          if (!hasAngle1 && !hasAngle2 && !hasAngle3) {
            newInvalidSlots.slot1 = true;
            newInvalidSlots.slot2 = true;
            newInvalidSlots.slot3 = true;
            details.push("Uploaded Images");
          }

          setInvalidSlots(newInvalidSlots);
          setInvalidAngleInfo(details);
        }

        throw new Error(errDetail);
      }

      setPredictionResult(data);
      fetchPlantPredictionHistory();
    } catch (err) {
      setError(err.message || "Failed to complete prediction.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Bloom Prediction" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Top Header Card */}
        <View className="mb-4">
          <Text className="text-xl font-black" style={{ color: colors.darkGray }}>
            AI Bloom Prediction {plant_name ? `— ${plant_name}` : ""}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            3-Angle Stage Classification (RF-DETR) & Timeline Forecasting (Gradient Boosting) using 30-day ambient telemetry.
          </Text>
        </View>

        {/* Photography Guidance Protocol */}
        <View className="p-4 rounded-3xl bg-purple-50/70 border border-purple-200 mb-4 shadow-xs space-y-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5 flex-1 mr-2">
              <Text className="text-base">📸</Text>
              <Text className="text-xs font-black uppercase text-purple-950 tracking-wide">
                Photography Protocol (3 Angles)
              </Text>
            </View>
            <Text className="text-[10px] font-bold text-purple-800 bg-purple-200/80 px-2 py-0.5 rounded-full">
              Single Plant
            </Text>
          </View>

          <View className="space-y-2">
            <View className="p-2.5 bg-white rounded-xl border border-purple-200/70">
              <Text className="text-xs font-extrabold text-purple-900">📐 90° Camera Angle</Text>
              <Text className="text-[11px] text-gray-600 mt-0.5">
                Position the camera perpendicular (90° from ground) at eye level facing this plant base directly.
              </Text>
            </View>
            <View className="p-2.5 bg-white rounded-xl border border-purple-200/70">
              <Text className="text-xs font-extrabold text-purple-900">🔄 3-Sided Plant Coverage</Text>
              <Text className="text-[11px] text-gray-600 mt-0.5">
                Capture 1 frontal view plus 2 side profiles (~120° apart) around this same plant to assess all canes and bud nodes.
              </Text>
            </View>
            <View className="p-2.5 bg-white rounded-xl border border-purple-200/70">
              <Text className="text-xs font-extrabold text-purple-900">💡 Lighting & Focus</Text>
              <Text className="text-[11px] text-gray-600 mt-0.5">
                Ensure uniform diffused lighting without harsh backlighting. Keep canes, stems, and spike tips in sharp focus.
              </Text>
            </View>
          </View>
        </View>

        {/* 3 Dedicated Angle Upload Slots */}
        <View className="p-4 rounded-3xl bg-white border mb-4 shadow-xs space-y-3" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center pb-2 border-b" style={{ borderColor: colors.borderGray }}>
            <Text className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colors.darkGray }}>
              Multi-Angle Photo Slots
            </Text>
            <Text
              className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: isReadyToPredict ? colors.primaryLight : "#fffbeb",
                borderColor: isReadyToPredict ? colors.primary : "#fde68a",
                color: isReadyToPredict ? colors.primary : "#b45309",
              }}
            >
              {isReadyToPredict ? "3 of 3 Ready ✓" : `${uploadedCount} of 3 Uploaded`}
            </Text>
          </View>

          <View className="space-y-3">
            {ANGLE_SLOTS.map((slot) => {
              const file = angleFiles[slot.id];
              const isInvalid = invalidSlots[slot.id];

              return (
                <View
                  key={slot.id}
                  className="p-3.5 rounded-2xl border space-y-2.5"
                  style={{
                    backgroundColor: isInvalid ? colors.dangerLight : file ? "#faf5ff" : colors.lightGray,
                    borderColor: isInvalid ? colors.danger : file ? "#c084fc" : colors.borderGray,
                  }}
                >
                  <View className="flex-row justify-between items-center">
                    <Text className="text-xs font-black" style={{ color: colors.darkGray }}>
                      {slot.title}
                    </Text>
                    <Text
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: isInvalid ? colors.danger : "#f3e8ff",
                        color: isInvalid ? colors.white : "#7e22ce",
                      }}
                    >
                      {isInvalid ? "⚠️ Invalid (Not Orchid)" : slot.tag}
                    </Text>
                  </View>

                  {file ? (
                    <View className="space-y-2">
                      <View className="w-full h-44 rounded-xl overflow-hidden border bg-black/5 relative" style={{ borderColor: colors.borderGray }}>
                        <Image source={{ uri: file.uri }} className="w-full h-full" resizeMode="cover" />
                        <TouchableOpacity
                          onPress={() => handleRemoveSlotFile(slot.id)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full items-center justify-center shadow-xs"
                          style={{ backgroundColor: colors.danger }}
                        >
                          <X size={14} color={colors.white} />
                        </TouchableOpacity>
                      </View>

                      {isInvalid && (
                        <TouchableOpacity
                          onPress={() => pickImageForSlot(slot.id)}
                          className="py-2 rounded-xl items-center justify-center shadow-2xs"
                          style={{ backgroundColor: colors.danger }}
                        >
                          <Text className="text-xs font-bold text-white">Replace Flagged Photo</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => pickImageForSlot(slot.id)}
                      className="py-5 border-2 border-dashed rounded-xl items-center justify-center bg-white shadow-2xs"
                      style={{ borderColor: colors.borderGray }}
                    >
                      <Text className="text-xl mb-1">{slot.icon}</Text>
                      <Text className="text-xs font-extrabold text-purple-900">Upload Photo</Text>
                      <Text className="text-[10px] text-gray-400 text-center mt-0.5 px-3">
                        {slot.requirement}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {error ? (
          <View
            className="p-3.5 mb-4 rounded-2xl border"
            style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
          >
            <View className="flex-row items-center gap-1.5 mb-1">
              <AlertCircle size={16} color={colors.danger} />
              <Text className="text-xs font-black" style={{ color: colors.danger }}>
                {invalidAngleInfo.length > 0
                  ? "Non-Orchid Image Detected ('Invalid')"
                  : "Prediction Notice"}
              </Text>
            </View>
            <Text className="text-xs text-rose-900 leading-relaxed">{error}</Text>
            {invalidAngleInfo.length > 0 && (
              <Text className="text-[11px] font-bold text-rose-800 mt-1">
                Flagged Angle(s): {invalidAngleInfo.join(", ")}
              </Text>
            )}
          </View>
        ) : null}

        {/* Action Button */}
        <TouchableOpacity
          onPress={handleRunPrediction}
          disabled={analyzing || !isReadyToPredict}
          className="w-full py-4 rounded-2xl items-center justify-center shadow-md mb-4"
          style={{
            backgroundColor: analyzing || !isReadyToPredict ? colors.mediumGray : "#7e22ce",
          }}
        >
          {analyzing ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color={colors.white} size="small" />
              <Text className="text-xs font-bold text-white">
                Running 3-Angle Stage Detection & Forecast...
              </Text>
            </View>
          ) : (
            <Text className="text-sm font-bold text-white">
              🌸 {isReadyToPredict ? "Run AI Bloom Prediction" : `Upload 3 Angles (${uploadedCount}/3)`}
            </Text>
          )}
        </TouchableOpacity>

        {/* 30-Day Environmental Telemetry Table */}
        <View className="p-4 rounded-3xl bg-white border mb-4 shadow-xs space-y-3" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center pb-2 border-b" style={{ borderColor: colors.borderGray }}>
            <Text className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colors.darkGray }}>
              Plant Telemetry (Last 30 Days)
            </Text>
            <Text className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
              30-Day Window
            </Text>
          </View>

          {loadingTelemetry ? (
            <ActivityIndicator size="small" color="#7e22ce" className="py-4" />
          ) : telemetryReadings.length === 0 ? (
            <Text className="text-xs italic text-gray-400 text-center py-3">
              No telemetry logs in the last 30 days. Standard baseline climate will be applied.
            </Text>
          ) : (
            <View className="space-y-1.5 max-h-52">
              {telemetryReadings.slice(0, 5).map((r, i) => (
                <View
                  key={r.id || i}
                  className="p-2.5 rounded-2xl bg-gray-50 border flex-row justify-between items-center"
                  style={{ borderColor: colors.borderGray }}
                >
                  <Text className="text-[10px] text-gray-400 font-mono">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                  </Text>
                  <View className="flex-row gap-2">
                    <Text className="text-xs font-extrabold text-rose-600">{r.temperature}°C</Text>
                    <Text className="text-xs font-extrabold text-sky-600">{r.humidity}%</Text>
                    <Text className="text-xs font-extrabold text-amber-600">{r.lux}Lx</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* COMPREHENSIVE PREDICTION OUTPUT */}
        {predictionResult && (
          <View className="space-y-4 mb-8">
            <Text className="text-base font-black" style={{ color: colors.darkGray }}>
              🌿 AI Bloom Analysis & Timeline Forecast
            </Text>

            {/* Hero Forecast Banner */}
            <View className="p-5 rounded-3xl bg-purple-900 shadow-md space-y-2">
              <Text className="text-[10px] uppercase font-extrabold text-purple-300 tracking-wider">
                Estimated Flowering Schedule
              </Text>
              <Text className="text-2xl font-black text-white">
                {predictionResult.prediction_msg || `Estimated Bloom in ${predictionResult.weeks} Weeks`}
              </Text>
              <Text className="text-xs text-purple-200">
                Target Bloom Window:{" "}
                <Text className="font-bold text-white">
                  {predictionResult.flowering_date_range_display || predictionResult.estimated_flowering_date}
                </Text>
              </Text>
              <View className="mt-2 p-2.5 bg-white/10 rounded-2xl border border-white/20 flex-row justify-between items-center">
                <Text className="text-xs font-bold text-purple-200">Total Duration:</Text>
                <Text className="text-base font-black text-white">
                  {predictionResult.total_days_range
                    ? `${predictionResult.total_days_range} Days`
                    : `${predictionResult.display_total_days || 0} Days`}
                </Text>
              </View>
            </View>

            {/* Stage Identification Summary */}
            <View className="p-4 rounded-3xl bg-white border shadow-xs space-y-3" style={{ borderColor: colors.borderGray }}>
              <View className="flex-row justify-between items-center pb-2 border-b" style={{ borderColor: colors.borderGray }}>
                <Text className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                  Detected Blooming Stage
                </Text>
                <Text
                  className="text-xs font-black px-2.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: STAGE_CONFIG[predictionResult.current_stage]?.badge || "#7e22ce" }}
                >
                  {predictionResult.current_stage}
                </Text>
              </View>

              <View className="space-y-1">
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs font-bold text-gray-700">Confidence Level</Text>
                  <Text className="text-sm font-black text-purple-900">{predictionResult.confidence}%</Text>
                </View>
                <View className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <View
                    className="h-full rounded-full bg-purple-600"
                    style={{ width: `${predictionResult.confidence}%` }}
                  />
                </View>
              </View>

              <Text className="text-xs text-gray-600 leading-relaxed">
                {STAGE_CONFIG[predictionResult.current_stage]?.desc || "Stage identified through 3-angle computer vision inference."}
              </Text>

              {/* Exact 3-Angle Voting Breakdown */}
              {predictionResult.image_predictions && (
                <View className="pt-2 border-t space-y-1.5" style={{ borderColor: colors.borderGray }}>
                  <Text className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                    Multi-Angle Voting Breakdown ({predictionResult.image_predictions.length} Angles):
                  </Text>
                  {predictionResult.image_predictions.map((p, idx) => (
                    <View
                      key={idx}
                      className="p-2.5 bg-gray-50 rounded-xl border flex-row justify-between items-center"
                      style={{ borderColor: colors.borderGray }}
                    >
                      <View>
                        <Text className="text-xs font-bold text-gray-800">
                          {p.angle_label || `Angle ${p.image_index}`}
                        </Text>
                        <Text className="text-[9px] text-gray-400 font-mono">{p.filename}</Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-xs font-black text-purple-900">{p.stage}</Text>
                        <Text className="text-[10px] text-gray-500 font-bold">
                          {Math.round((p.confidence || 0) * 100)}%
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Target vs 30-Day Measured Environment */}
            <View className="p-4 rounded-3xl bg-white border shadow-xs space-y-3" style={{ borderColor: colors.borderGray }}>
              <Text className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                Target Environmental Conditions (Dendrobium)
              </Text>

              <View className="flex-row gap-2">
                <View className="flex-1 p-2.5 rounded-2xl bg-rose-50 border border-rose-200 items-center">
                  <Text className="text-[9px] font-bold text-rose-700 uppercase">Target Temp</Text>
                  <Text className="text-xs font-black text-rose-900 mt-0.5">25–30 °C</Text>
                </View>
                <View className="flex-1 p-2.5 rounded-2xl bg-sky-50 border border-sky-200 items-center">
                  <Text className="text-[9px] font-bold text-sky-700 uppercase">Target RH</Text>
                  <Text className="text-xs font-black text-sky-900 mt-0.5">70–75 %</Text>
                </View>
                <View className="flex-1 p-2.5 rounded-2xl bg-amber-50 border border-amber-200 items-center">
                  <Text className="text-[9px] font-bold text-amber-700 uppercase">Target Light</Text>
                  <Text className="text-xs font-black text-amber-900 mt-0.5">16k–32k Lx</Text>
                </View>
              </View>

              {predictionResult.sensor_summary && (
                <View className="pt-2 border-t space-y-1.5" style={{ borderColor: colors.borderGray }}>
                  <Text className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                    30-Day Measured Historical Mean
                  </Text>
                  <View className="flex-row gap-2">
                    <View className="flex-1 p-2 bg-gray-50 rounded-xl border items-center" style={{ borderColor: colors.borderGray }}>
                      <Text className="text-[9px] text-gray-400">30d Avg Temp</Text>
                      <Text className="text-xs font-black text-rose-600 mt-0.5">
                        {Number(predictionResult.sensor_summary.avg_temp_c).toFixed(1)} °C
                      </Text>
                    </View>
                    <View className="flex-1 p-2 bg-gray-50 rounded-xl border items-center" style={{ borderColor: colors.borderGray }}>
                      <Text className="text-[9px] text-gray-400">30d Avg RH</Text>
                      <Text className="text-xs font-black text-sky-600 mt-0.5">
                        {Number(predictionResult.sensor_summary.avg_humidity_rh).toFixed(1)} %
                      </Text>
                    </View>
                    <View className="flex-1 p-2 bg-gray-50 rounded-xl border items-center" style={{ borderColor: colors.borderGray }}>
                      <Text className="text-[9px] text-gray-400">30d Avg Light</Text>
                      <Text className="text-xs font-black text-amber-600 mt-0.5">
                        {Number(predictionResult.sensor_summary.avg_light_lux).toFixed(0)} Lx
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Microclimate Recommendation Strategy */}
            {predictionResult.environment_evaluation?.recommendation && (
              <View className="p-4 rounded-3xl bg-purple-950 text-white shadow-xs space-y-2 border border-purple-800">
                <Text className="text-xs font-black text-purple-200 uppercase tracking-wider">
                  🌿 Actionable Climate & Placement Strategy
                </Text>
                <View className="flex-row items-start gap-1.5">
                  <Text className="text-xs font-black text-emerald-400 mt-0.5">✓</Text>
                  <Text className="text-xs text-purple-100 flex-1 leading-relaxed">
                    {predictionResult.environment_evaluation.recommendation}
                  </Text>
                </View>
              </View>
            )}

            {/* Bloom Progression Stage Timeline */}
            {predictionResult.timeline && predictionResult.timeline.length > 0 && (
              <View className="p-4 rounded-3xl bg-white border shadow-xs space-y-3" style={{ borderColor: colors.borderGray }}>
                <Text className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                  ⏱️ Bloom Progression Stage Timeline
                </Text>
                <View className="space-y-2.5">
                  {predictionResult.timeline.map((step, idx) => (
                    <View
                      key={idx}
                      className="p-3 bg-purple-50/60 rounded-2xl border border-purple-200 flex-row justify-between items-center"
                    >
                      <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-gray-900">
                          {step.from_stage} → <Text className="font-extrabold text-purple-900">{step.to_stage}</Text>
                        </Text>
                        <Text className="text-[10px] text-gray-500 mt-0.5">
                          Window: {step.transition_window || step.estimated_date}
                        </Text>
                      </View>
                      <Text className="text-xs font-black text-purple-900 bg-purple-200/80 px-2 py-1 rounded-lg">
                        {step.transition_days_range || `+${step.transition_days} Days`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Re-scan CTA Button */}
            <TouchableOpacity
              onPress={handleResetScan}
              className="py-3.5 rounded-2xl items-center justify-center shadow-xs"
              style={{ backgroundColor: "#7e22ce" }}
            >
              <Text className="text-xs font-bold text-white">Re-scan This Plant (New Photos)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Prediction History List */}
        <View className="p-4 rounded-3xl bg-white border mb-8 shadow-xs space-y-3" style={{ borderColor: colors.borderGray }}>
          <Text className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colors.darkGray }}>
            Prediction History {plant_name ? `for ${plant_name}` : ""}
          </Text>

          {loadingHistory ? (
            <ActivityIndicator size="small" color="#7e22ce" className="py-2" />
          ) : historyList.length === 0 ? (
            <Text className="text-xs italic text-gray-400 text-center py-2">
              No previous bloom prediction logs recorded.
            </Text>
          ) : (
            <View className="space-y-1.5">
              {historyList.map((item, idx) => (
                <View
                  key={idx}
                  className="p-2.5 rounded-2xl bg-gray-50 border flex-row justify-between items-center"
                  style={{ borderColor: colors.borderGray }}
                >
                  <View>
                    <Text className="text-xs font-bold text-purple-950">{item.weeks} Weeks</Text>
                    <Text className="text-[9px] text-gray-400 font-mono">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                    </Text>
                  </View>
                  <Text className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                    Logged
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}