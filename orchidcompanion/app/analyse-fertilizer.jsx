import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSelector } from "react-redux";
import {
  Camera,
  AlertCircle,
  Info,
  RotateCcw,
  Plus,
  Minus,
  Sparkles,
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Leaf,
  Droplets,
  Calendar,
  Lightbulb,
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL } from "../src/config/api";

const PHOTO_STEPS = [
  {
    step: "1",
    badge: "Leaf Selection",
    title: "1 Mature Leaf on White Paper",
    desc: "Pick one mature, healthy leaf flat on clean white A4 paper. Avoid damaged or very young leaves.",
    icon: "🍃",
  },
  {
    step: "2",
    badge: "Scale Coin",
    title: "Rs. 5 Coin (Leave Small Gap)",
    desc: "Place a standard Sri Lankan Rs. 5 coin next to the leaf. Do not let the coin overlap or touch.",
    icon: "🪙",
  },
  {
    step: "3",
    badge: "Camera Angle",
    title: "Top-Down (Bird's Eye View)",
    desc: "Hold your phone flat directly above the leaf. Make sure both the leaf and coin are clearly visible.",
    icon: "📸",
  },
];

const DETAILED_INSTRUCTIONS = [
  {
    icon: "🍃",
    title: "Leaf Selection",
    desc: "Place one well-grown, mature leaf flat on a level surface. Avoid very young, small, or damaged leaves.",
  },
  {
    icon: "📄",
    title: "Clean Background",
    desc: "Lay the leaf on a clean white A4 sheet of paper to clearly separate it from the background.",
  },
  {
    icon: "📐",
    title: "Top-Down View",
    desc: "Take the photo directly from above (top-down). Do not take the photo at an angle.",
  },
  {
    icon: "🔍",
    title: "Full Visibility",
    desc: "Make sure the entire leaf is visible and not cut off by the image edges.",
  },
  {
    icon: "🪙",
    title: "Rs. 5 Coin Reference",
    desc: "Place a Sri Lankan Rs. 5 coin next to the leaf on the same surface & height.",
  },
  {
    icon: "↔️",
    title: "No Touch / Overlap",
    desc: "Ensure the coin does not overlap or touch the leaf. Leave a small visible gap.",
  },
];

const getGrowthStageDescription = (stage) => {
  if (!stage) return "Current development phase analyzed from your orchid leaf imagery.";
  const s = String(stage).toLowerCase();
  if (s.includes("veg")) {
    return "Your orchid is actively growing new leaves, stems, and healthy roots. Balanced foliage nutrition is essential.";
  }
  if (s.includes("flower") || s.includes("bloom")) {
    return "Your orchid is preparing or supporting flower spikes. Higher phosphorus energy helps sustain vivid blooms.";
  }
  if (s.includes("mature")) {
    return "Your orchid has established strong structure and maintains steady, resilient nutrient uptake.";
  }
  if (s.includes("seedling") || s.includes("juvenile")) {
    return "Young orchid focusing on root establishment and gentle acclimatization.";
  }
  return `Your orchid is currently in the ${stage} stage. Care requirements are customized below.`;
};

export default function AnalyseFertilizerScreen() {
  const router = useRouter();
  const { plant_id, plant_name } = useLocalSearchParams();
  const { token } = useSelector((state) => state.auth);

  const [selectedFile, setSelectedFile] = useState(null);
  const [leafCount, setLeafCount] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");
  const [showDetailedTips, setShowDetailedTips] = useState(false);

  const pickImage = () => {
    Alert.alert(
      "Upload Leaf Photo",
      "Select photo source for orchid fertilizer diagnosis",
      [
        {
          text: "Take Photo",
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
              Alert.alert("Permission Required", "Camera access is needed to capture orchid leaf photos.");
              return;
            }
            const res = await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 0.85,
            });
            if (!res.canceled && res.assets?.[0]) {
              setSelectedFile(res.assets[0]);
              setAnalysisResult(null);
              setError("");
            }
          },
        },
        {
          text: "Choose from Library",
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
              Alert.alert("Permission Required", "Photo library access is needed to select photos.");
              return;
            }
            const res = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.85,
            });
            if (!res.canceled && res.assets?.[0]) {
              setSelectedFile(res.assets[0]);
              setAnalysisResult(null);
              setError("");
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleRunAnalysis = async () => {
    if (!selectedFile) {
      setError("Please snap or select a leaf photo first.");
      return;
    }

    setAnalyzing(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", {
        uri: selectedFile.uri,
        name: "leaf_sample.jpg",
        type: "image/jpeg",
      });
      formData.append("plant_id", plant_id || "default");
      formData.append("leaf_count", Math.max(1, parseInt(leafCount, 10) || 1));

      const res = await fetch(`${API_BASE_URL}/fertilizer/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Fertilizer analysis failed.");
      }

      setAnalysisResult(data);
    } catch (err) {
      setError(err.message || "Fertilizer analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setAnalysisResult(null);
    setError("");
    setLeafCount(1);
  };

  const rawConfidence = analysisResult?.confidence;
  const confidencePercent =
    rawConfidence != null
      ? Number(rawConfidence) > 1
        ? Number(rawConfidence)
        : Number(rawConfidence) * 100
      : null;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Fertilizer Care Guide" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Header Title & Description */}
        <View className="mb-4">
          <Text className="text-xl font-extrabold" style={{ color: colors.darkGray }}>
            Fertilizer Care {plant_name ? `— ${plant_name}` : ""}
          </Text>
          <Text className="text-xs text-gray-500 mt-1 leading-relaxed">
            Snap a photo of one orchid leaf with a Rs. 5 coin to get personalized feeding recommendations and soil nutrient feedback.
          </Text>
        </View>

        {/* Creative Visual Photo-Taking Guide */}
        <View className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 mb-4 shadow-xs">
          {/* Section Header */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-1.5">
              <Camera size={16} color="#b45309" />
              <Text className="text-xs font-extrabold uppercase tracking-wider text-amber-900">
                How to Snap the Perfect Photo
              </Text>
            </View>
            <View className="bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
              <Text className="text-[10px] font-bold text-amber-800">3 Easy Steps</Text>
            </View>
          </View>

          {/* 3 Step Visual Cards */}
          <View className="space-y-2 mt-1">
            {PHOTO_STEPS.map((item) => (
              <View
                key={item.step}
                className="p-3 bg-white rounded-xl border border-amber-200/80 flex-row items-start gap-3 shadow-2xs"
              >
                <View className="w-8 h-8 rounded-full bg-amber-100 items-center justify-center shrink-0 mt-0.5">
                  <Text className="text-base">{item.icon}</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                      Step {item.step}
                    </Text>
                    <Text className="text-xs font-extrabold text-gray-800">{item.title}</Text>
                  </View>
                  <Text className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                    {item.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Quick Rules Checklist Pills */}
          <View className="flex-row flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-amber-200/60">
            <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex-row items-center gap-1">
              <CheckCircle2 size={11} color="#059669" />
              <Text className="text-[10px] font-bold text-emerald-800">Clean White Paper</Text>
            </View>
            <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex-row items-center gap-1">
              <CheckCircle2 size={11} color="#059669" />
              <Text className="text-[10px] font-bold text-emerald-800">Rs. 5 Coin Beside</Text>
            </View>
            <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex-row items-center gap-1">
              <CheckCircle2 size={11} color="#059669" />
              <Text className="text-[10px] font-bold text-emerald-800">Direct Bird's-Eye View</Text>
            </View>
            <View className="bg-amber-100/70 border border-amber-300 px-2.5 py-1 rounded-full flex-row items-center gap-1">
              <AlertCircle size={11} color="#b45309" />
              <Text className="text-[10px] font-bold text-amber-900">Only 1 Leaf (No Overlap)</Text>
            </View>
          </View>

          {/* Expandable Full Checklist */}
          <TouchableOpacity
            onPress={() => setShowDetailedTips(!showDetailedTips)}
            activeOpacity={0.7}
            className="flex-row items-center justify-between pt-2.5 mt-2.5 border-t border-amber-200/60"
          >
            <Text className="text-[11px] font-extrabold text-amber-800">
              {showDetailedTips ? "Hide detailed photography checklist" : "View full 6-point checklist"}
            </Text>
            {showDetailedTips ? (
              <ChevronUp size={15} color="#b45309" />
            ) : (
              <ChevronDown size={15} color="#b45309" />
            )}
          </TouchableOpacity>

          {showDetailedTips && (
            <View className="space-y-2 mt-2 pt-2 border-t border-amber-200/50">
              {DETAILED_INSTRUCTIONS.map((item, idx) => (
                <View
                  key={idx}
                  className="p-2.5 bg-white/90 rounded-xl border border-amber-200 flex-row gap-2.5 items-start shadow-2xs"
                >
                  <Text className="text-sm">{item.icon}</Text>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-800">{item.title}</Text>
                    <Text className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                      {item.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Clean Leaf Image Upload Box */}
        <View className="mb-4">
          <TouchableOpacity
            onPress={pickImage}
            activeOpacity={0.8}
            className="border-2 border-dashed border-amber-300 bg-white py-6 px-4 rounded-2xl items-center justify-center text-center shadow-xs overflow-hidden"
          >
            {selectedFile ? (
              <View className="w-full items-center space-y-2">
                <Image
                  source={{ uri: selectedFile.uri }}
                  className="w-full h-56 rounded-xl"
                  resizeMode="contain"
                />
                <View className="flex-row items-center gap-1.5 pt-2">
                  <Camera size={14} color="#b45309" />
                  <Text className="text-xs font-bold text-amber-800">
                    Tap to retake or choose another photo
                  </Text>
                </View>
              </View>
            ) : (
              <View className="items-center py-4 space-y-1.5">
                <View className="w-14 h-14 rounded-full bg-amber-100 items-center justify-center mb-1">
                  <Camera size={26} color="#b45309" />
                </View>
                <Text className="text-sm font-extrabold text-amber-900 text-center">
                  Snap or Upload Leaf Photo
                </Text>
                <Text className="text-xs text-gray-500 text-center px-4">
                  Take a top-down photo of 1 leaf on white paper with a Rs. 5 coin
                </Text>
                <View className="mt-1 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                  <Text className="text-[10px] font-bold text-amber-800">Supports JPG, PNG</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Leaf Count Selector */}
        <View className="p-4 bg-white rounded-2xl border border-gray-200 mb-4 flex-row justify-between items-center shadow-xs">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center gap-1.5">
              <Leaf size={16} color="#059669" />
              <Text className="text-sm font-bold text-gray-800">Total Leaves on Orchid</Text>
            </View>
            <Text className="text-[11px] text-gray-500 mt-0.5">
              Helps calibrate the exact nutrient dosage for your plant
            </Text>
          </View>
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => setLeafCount((prev) => Math.max(1, (parseInt(prev, 10) || 1) - 1))}
              disabled={Number(leafCount) <= 1}
              className={`w-9 h-9 rounded-lg border border-amber-300 items-center justify-center ${
                Number(leafCount) <= 1 ? "bg-gray-100 opacity-40" : "bg-white"
              }`}
            >
              <Minus size={16} color={colors.textPrimary} />
            </TouchableOpacity>
            <TextInput
              keyboardType="numeric"
              value={String(leafCount)}
              onChangeText={(v) => {
                if (v === "") {
                  setLeafCount("");
                } else {
                  const num = parseInt(v, 10);
                  setLeafCount(isNaN(num) ? 1 : Math.max(1, num));
                }
              }}
              onBlur={() => {
                if (!leafCount || Number(leafCount) < 1) {
                  setLeafCount(1);
                }
              }}
              className="w-14 px-2 py-1.5 border border-amber-300 rounded-lg text-center font-bold text-base text-gray-800 bg-white mx-2"
              style={{ borderColor: colors.borderGray }}
            />
            <TouchableOpacity
              onPress={() => setLeafCount((prev) => Math.min(100, (parseInt(prev, 10) || 1) + 1))}
              className="w-9 h-9 rounded-lg border border-amber-300 bg-white items-center justify-center"
            >
              <Plus size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <View className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 flex-row items-center justify-center">
            <AlertCircle size={16} color={colors.danger} className="mr-1.5 shrink-0" />
            <Text className="text-xs font-medium text-rose-700">{error}</Text>
          </View>
        ) : null}

        {/* Action Button */}
        <View className="flex-row gap-2 mb-6">
          <TouchableOpacity
            onPress={handleRunAnalysis}
            disabled={analyzing || !selectedFile}
            className="flex-1 py-3.5 rounded-xl items-center justify-center shadow-md"
            style={{
              backgroundColor: analyzing || !selectedFile ? colors.mediumGray : "#d97706",
            }}
          >
            {analyzing ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color={colors.white} size="small" />
                <Text className="text-xs font-bold text-white">
                  Diagnosing Nutrient Requirements...
                </Text>
              </View>
            ) : (
              <Text className="text-sm font-bold text-white">Run Fertilizer Diagnosis</Text>
            )}
          </TouchableOpacity>

          {selectedFile && (
            <TouchableOpacity
              onPress={handleReset}
              disabled={analyzing}
              className="px-4 py-3.5 rounded-xl border bg-white items-center justify-center"
              style={{ borderColor: colors.borderGray }}
            >
              <RotateCcw size={16} color={colors.darkGray} />
            </TouchableOpacity>
          )}
        </View>

        {/* Analysis Output Section */}
        {analysisResult && (
          <View className="border-t pt-5 mb-8" style={{ borderColor: colors.borderGray }}>
            <Text className="text-lg font-extrabold text-gray-800 mb-1">
              Your Orchid Care Diagnosis
            </Text>
            <Text className="text-xs text-gray-500 mb-4">
              Personalized feeding routine and live soil nutrient balance.
            </Text>

            {/* Growth Stage Card */}
            <View className="p-5 rounded-2xl bg-amber-600 shadow-sm mb-3">
              <View className="flex-row justify-between items-center mb-1">
                <View className="flex-row items-center gap-1.5">
                  <Leaf size={15} color="#fef3c7" />
                  <Text className="text-xs font-bold uppercase tracking-wider text-amber-100">
                    Identified Growth Stage
                  </Text>
                </View>
                <View className="bg-amber-700/80 px-2.5 py-0.5 rounded-full">
                  <Text className="text-[10px] font-bold text-amber-100">
                    {analysisResult.leaf_count || leafCount} Leaves
                  </Text>
                </View>
              </View>
              <Text className="text-2xl font-black text-white mt-1">
                {analysisResult.growth_stage || "Analyzed"}
              </Text>
              <Text className="text-xs text-amber-100 mt-1.5 leading-relaxed">
                {getGrowthStageDescription(analysisResult.growth_stage)}
              </Text>
            </View>

            {/* Prediction Certainty / Confidence Card */}
            {confidencePercent != null && (
              <View
                className="p-4 rounded-2xl bg-white border mb-3 shadow-xs"
                style={{ borderColor: colors.borderGray }}
              >
                <View className="flex-row justify-between items-center mb-2">
                  <View className="flex-row items-center gap-2">
                    <View className="w-7 h-7 rounded-lg bg-amber-100 items-center justify-center">
                      <Sparkles size={15} color="#b45309" />
                    </View>
                    <View>
                      <Text className="text-xs font-extrabold text-gray-800">
                        Diagnosis Confidence
                      </Text>
                      <Text className="text-[10px] text-gray-400">
                        AI stage classification certainty
                      </Text>
                    </View>
                  </View>
                  <View className="bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                    <Text className="text-xs font-black text-amber-900">
                      {confidencePercent.toFixed(1)}% Match
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden my-1">
                  <View
                    className="h-full rounded-full bg-amber-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, confidencePercent))}%`,
                    }}
                  />
                </View>

                <View className="flex-row justify-between items-center mt-1">
                  <Text className="text-[10px] text-gray-500">
                    {confidencePercent >= 80
                      ? "High reliability diagnosis"
                      : confidencePercent >= 50
                      ? "Moderate reliability"
                      : "Standard estimate"}
                  </Text>
                  <Text className="text-[10px] font-bold text-amber-800">
                    🪙 Coin Calibrated
                  </Text>
                </View>
              </View>
            )}

            {/* Live Soil & Potting Nutrient Health (NPK Readings) */}
            <View
              className="p-4 border rounded-2xl bg-amber-50/40 mb-3 shadow-xs"
              style={{ borderColor: "#fde68a" }}
            >
              <View
                className="flex-row justify-between items-center border-b pb-2.5 mb-3"
                style={{ borderColor: "#fde68a" }}
              >
                <View className="flex-row items-center gap-1.5 flex-1 mr-2">
                  <Activity size={16} color="#b45309" />
                  <View>
                    <Text className="font-extrabold text-sm text-amber-900" numberOfLines={1}>
                      Live Soil Nutrient Status
                    </Text>
                    <Text className="text-[10px] text-amber-700">
                      Telemetry from connected potting sensors
                    </Text>
                  </View>
                </View>
                <View className="bg-amber-100/90 px-2.5 py-1 rounded-md border border-amber-300 shrink-0">
                  <Text className="text-[11px] font-bold text-amber-900">
                    Target: {analysisResult.npk_recommendation?.target_ratio || "20-20-20"}
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-2">
                {/* Nitrogen */}
                <View className="flex-1 p-2.5 bg-white rounded-xl border border-amber-200/80 items-center shadow-2xs">
                  <Text className="text-[11px] font-bold text-gray-700">Nitrogen</Text>
                  <Text className="text-[9px] text-gray-400 font-medium">(Leaf & Foliage)</Text>
                  <Text className="text-base font-black text-emerald-700 mt-1">
                    {analysisResult.npk_reading?.nitrogen ?? 0}
                  </Text>
                  <Text className="text-[9px] text-gray-400 font-medium">mg/kg</Text>
                  <View
                    className="mt-1.5 px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor:
                        analysisResult.npk_recommendation?.status?.nitrogen === "deficient"
                          ? colors.dangerLight
                          : analysisResult.npk_recommendation?.status?.nitrogen === "excess"
                          ? "#fef3c7"
                          : colors.primaryLight,
                    }}
                  >
                    <Text
                      className="text-[9px] font-black uppercase"
                      style={{
                        color:
                          analysisResult.npk_recommendation?.status?.nitrogen === "deficient"
                            ? colors.danger
                            : analysisResult.npk_recommendation?.status?.nitrogen === "excess"
                            ? "#d97706"
                            : colors.primary,
                      }}
                    >
                      {analysisResult.npk_recommendation?.status?.nitrogen || "optimal"}
                    </Text>
                  </View>
                </View>

                {/* Phosphorus */}
                <View className="flex-1 p-2.5 bg-white rounded-xl border border-amber-200/80 items-center shadow-2xs">
                  <Text className="text-[11px] font-bold text-gray-700">Phosphorus</Text>
                  <Text className="text-[9px] text-gray-400 font-medium">(Roots & Blooms)</Text>
                  <Text className="text-base font-black text-amber-700 mt-1">
                    {analysisResult.npk_reading?.phosphorous ?? analysisResult.npk_reading?.phosphorus ?? 0}
                  </Text>
                  <Text className="text-[9px] text-gray-400 font-medium">mg/kg</Text>
                  <View
                    className="mt-1.5 px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor:
                        analysisResult.npk_recommendation?.status?.phosphorous === "deficient"
                          ? colors.dangerLight
                          : analysisResult.npk_recommendation?.status?.phosphorous === "excess"
                          ? "#fef3c7"
                          : colors.primaryLight,
                    }}
                  >
                    <Text
                      className="text-[9px] font-black uppercase"
                      style={{
                        color:
                          analysisResult.npk_recommendation?.status?.phosphorous === "deficient"
                            ? colors.danger
                            : analysisResult.npk_recommendation?.status?.phosphorous === "excess"
                            ? "#d97706"
                            : colors.primary,
                      }}
                    >
                      {analysisResult.npk_recommendation?.status?.phosphorous || "optimal"}
                    </Text>
                  </View>
                </View>

                {/* Potassium */}
                <View className="flex-1 p-2.5 bg-white rounded-xl border border-amber-200/80 items-center shadow-2xs">
                  <Text className="text-[11px] font-bold text-gray-700">Potassium</Text>
                  <Text className="text-[9px] text-gray-400 font-medium">(Health & Immunity)</Text>
                  <Text className="text-base font-black text-rose-700 mt-1">
                    {analysisResult.npk_reading?.potassium ?? 0}
                  </Text>
                  <Text className="text-[9px] text-gray-400 font-medium">mg/kg</Text>
                  <View
                    className="mt-1.5 px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor:
                        analysisResult.npk_recommendation?.status?.potassium === "deficient"
                          ? colors.dangerLight
                          : analysisResult.npk_recommendation?.status?.potassium === "excess"
                          ? "#fef3c7"
                          : colors.primaryLight,
                    }}
                  >
                    <Text
                      className="text-[9px] font-black uppercase"
                      style={{
                        color:
                          analysisResult.npk_recommendation?.status?.potassium === "deficient"
                            ? colors.danger
                            : analysisResult.npk_recommendation?.status?.potassium === "excess"
                            ? "#d97706"
                            : colors.primary,
                      }}
                    >
                      {analysisResult.npk_recommendation?.status?.potassium || "optimal"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Custom Fertilizer Care Routine */}
            {analysisResult.npk_recommendation?.recommendation && (
              <View
                className="p-4 border rounded-2xl bg-white mb-6 shadow-xs"
                style={{ borderColor: colors.borderGray }}
              >
                <View className="flex-row items-center justify-between mb-3 pb-2.5 border-b" style={{ borderColor: colors.borderGray }}>
                  <View className="flex-row items-center gap-2">
                    <Droplets size={16} color="#059669" />
                    <Text className="font-extrabold text-sm text-gray-800">
                      Your Fertilizer Care Routine
                    </Text>
                  </View>
                  <View className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <Text className="text-[10px] font-bold text-emerald-800">
                      Personalized
                    </Text>
                  </View>
                </View>

                <View className="space-y-2.5">
                  {(Array.isArray(analysisResult.npk_recommendation.recommendation)
                    ? analysisResult.npk_recommendation.recommendation
                    : [analysisResult.npk_recommendation.recommendation]
                  ).map((step, idx) => (
                    <View
                      key={idx}
                      className="p-3 bg-amber-50/30 rounded-xl border border-amber-200/60 flex-row items-start gap-2.5"
                    >
                      <View className="w-5 h-5 rounded-full bg-amber-200/90 items-center justify-center shrink-0 mt-0.5">
                        <Text className="text-[11px] font-black text-amber-900">{idx + 1}</Text>
                      </View>
                      <Text className="text-xs text-gray-700 flex-1 leading-relaxed">{step}</Text>
                    </View>
                  ))}

                  {analysisResult.npk_recommendation?.frequency && (
                    <View
                      className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/70 flex-row items-start gap-2.5"
                    >
                      <Calendar size={16} color="#059669" className="shrink-0 mt-0.5" />
                      <Text className="text-xs text-gray-700 flex-1 leading-relaxed">
                        <Text className="font-bold text-emerald-900">Application Schedule: </Text>
                        {analysisResult.npk_recommendation.frequency}
                      </Text>
                    </View>
                  )}

                  {analysisResult.npk_recommendation?.notes && (
                    <View
                      className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 flex-row items-start gap-2.5"
                    >
                      <Lightbulb size={16} color="#b45309" className="shrink-0 mt-0.5" />
                      <Text className="text-xs text-gray-700 flex-1 leading-relaxed">
                        <Text className="font-bold text-amber-900">Grower Tip: </Text>
                        {analysisResult.npk_recommendation.notes}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}