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
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL } from "../src/config/api";

const INSTRUCTIONS = [
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

export default function AnalyseFertilizerScreen() {
  const router = useRouter();
  const { plant_id, plant_name } = useLocalSearchParams();
  const { token } = useSelector((state) => state.auth);

  const [selectedFile, setSelectedFile] = useState(null);
  const [leafCount, setLeafCount] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Allow photo library access to upload leaf photos.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (!res.canceled && res.assets[0]) {
      setSelectedFile(res.assets[0]);
      setAnalysisResult(null);
      setError("");
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedFile) {
      setError("Please select or drag a plant/leaf image first.");
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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Fertilizer Analysis" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="mb-4">
          <Text className="text-xl font-extrabold" style={{ color: colors.darkGray }}>
            Fertilizer Analysis {plant_name ? `— ${plant_name}` : ""}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            Upload orchid imagery and specify leaf count to evaluate nutrient requirements.
          </Text>
        </View>

        {/* Photo-Taking Instructions & Warning Banner */}
        <View className="p-4 rounded-2xl bg-amber-50 border border-amber-200 mb-4 shadow-xs space-y-3">
          {/* Warning Banner */}
          <View className="p-3 rounded-xl bg-amber-500/10 border-l-4 border-amber-600 flex-row items-start gap-2.5">
            <Info size={18} color="#b45309" className="shrink-0 mt-0.5" />
            <Text className="text-xs font-bold text-amber-900 flex-1 leading-relaxed">
              “For accurate leaf measurement and growth-stage prediction, please follow these instructions carefully. Select a well-grown leaf and position it correctly with the Rs. 5 coin.”
            </Text>
          </View>

          {/* Structured Instructions List */}
          <Text className="text-xs font-extrabold text-amber-900 tracking-wider uppercase pt-1">
            Photo-Taking Instructions for Best Accuracy:
          </Text>

          <View className="space-y-2">
            {INSTRUCTIONS.map((item, idx) => (
              <View
                key={idx}
                className="p-2.5 bg-white rounded-xl border border-amber-200/80 flex-row gap-2.5 items-start shadow-2xs"
              >
                <Text className="text-base leading-tight">{item.icon}</Text>
                <View className="flex-1">
                  <Text className="text-xs font-extrabold text-gray-800">{item.title}:</Text>
                  <Text className="text-[11px] text-gray-700 leading-relaxed mt-0.5">
                    {item.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View className="p-2 bg-amber-100/50 rounded-lg items-center">
            <Text className="text-[11px] font-semibold text-amber-800">
              Note: Only one leaf should be included in the photo.
            </Text>
          </View>
        </View>

        {/* Image Upload Area */}
        <View className="mb-4">
          <TouchableOpacity
            onPress={pickImage}
            activeOpacity={0.8}
            className="border-2 border-dashed border-amber-300 bg-amber-50/40 py-8 px-6 rounded-2xl items-center justify-center text-center shadow-xs overflow-hidden"
          >
            {selectedFile ? (
              <View className="w-full items-center space-y-2">
                <Image
                  source={{ uri: selectedFile.uri }}
                  className="w-full h-56 rounded-xl"
                  resizeMode="contain"
                />
                <View className="flex-row items-center gap-1.5 pt-1">
                  <Camera size={14} color="#b45309" />
                  <Text className="text-xs font-bold text-amber-800">
                    Click to replace plant image
                  </Text>
                </View>
              </View>
            ) : (
              <View className="items-center py-2 space-y-1">
                <Camera size={28} color="#b45309" className="mb-1" />
                <Text className="text-sm font-bold text-amber-800 text-center">
                  Click or drag plant image to upload
                </Text>
                <Text className="text-xs text-gray-500">Supports JPG, PNG</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Leaf Count Input */}
        <View
          className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 mb-4 flex-row justify-between items-center shadow-xs"
        >
          <Text className="text-sm font-bold text-gray-700">Leaf Count:</Text>
          <TextInput
            keyboardType="numeric"
            value={String(leafCount)}
            onChangeText={(v) => setLeafCount(Math.max(1, parseInt(v, 10) || 1))}
            className="w-24 px-3 py-2 border rounded-lg text-center font-bold text-gray-800 bg-white"
            style={{ borderColor: colors.borderGray }}
          />
        </View>

        {error ? (
          <View
            className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 flex-row items-center justify-center"
          >
            <AlertCircle size={16} color={colors.danger} className="mr-1.5 shrink-0" />
            <Text className="text-xs font-medium text-rose-700">{error}</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
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
                <Text className="text-xs font-bold text-white">Analyzing Fertilizer Requirements...</Text>
              </View>
            ) : (
              <Text className="text-sm font-bold text-white">Run Fertilizer Analysis</Text>
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
          <View className="border-t pt-6 space-y-4 mb-8" style={{ borderColor: colors.borderGray }}>
            <Text className="text-lg font-bold text-gray-800">
              Growth Stage & NPK Analysis Results
            </Text>

            {/* Growth Stage Banner */}
            <View className="p-4 rounded-xl items-center justify-center bg-amber-600 shadow-sm">
              <Text className="text-lg font-extrabold text-white text-center">
                Growth Stage: {analysisResult.growth_stage || "Analyzed"}
              </Text>
            </View>

            {/* Leaf Count Card */}
            <View
              className="p-3 bg-gray-50 border rounded-xl items-center justify-center shadow-xs"
              style={{ borderColor: colors.borderGray }}
            >
              <Text className="text-xs text-gray-500 font-medium">Leaf Count</Text>
              <Text className="text-sm font-bold text-gray-800 mt-0.5">
                {analysisResult.leaf_count || leafCount}
              </Text>
            </View>

            {/* Live NPK Readings & Target Ratio */}
            <View className="p-4 border rounded-xl bg-amber-50/30 space-y-3" style={{ borderColor: "#fde68a" }}>
              <View className="flex-row justify-between items-center border-b pb-2" style={{ borderColor: "#fde68a" }}>
                <Text className="font-bold text-sm text-amber-900">Live NPK Sensor Readings</Text>
                <Text className="text-xs font-semibold text-amber-700">
                  Target Ratio: {analysisResult.npk_recommendation?.target_ratio || "20-20-20"}
                </Text>
              </View>

              <View className="flex-row gap-2">
                {/* Nitrogen */}
                <View className="flex-1 p-2 bg-white rounded-lg border border-amber-200 items-center">
                  <Text className="text-xs text-gray-500">Nitrogen (N)</Text>
                  <Text className="text-sm font-extrabold text-emerald-700 mt-0.5">
                    {analysisResult.npk_reading?.nitrogen ?? 0} mg/kg
                  </Text>
                  <Text
                    className="text-[10px] font-bold uppercase mt-1"
                    style={{
                      color:
                        analysisResult.npk_recommendation?.status?.nitrogen === "deficient"
                          ? colors.danger
                          : analysisResult.npk_recommendation?.status?.nitrogen === "excess"
                          ? "#d97706"
                          : colors.primary,
                    }}
                  >
                    [{analysisResult.npk_recommendation?.status?.nitrogen || "optimal"}]
                  </Text>
                </View>

                {/* Phosphorus */}
                <View className="flex-1 p-2 bg-white rounded-lg border border-amber-200 items-center">
                  <Text className="text-xs text-gray-500">Phosphorus (P)</Text>
                  <Text className="text-sm font-extrabold text-amber-700 mt-0.5">
                    {analysisResult.npk_reading?.phosphorous ?? 0} mg/kg
                  </Text>
                  <Text
                    className="text-[10px] font-bold uppercase mt-1"
                    style={{
                      color:
                        analysisResult.npk_recommendation?.status?.phosphorous === "deficient"
                          ? colors.danger
                          : analysisResult.npk_recommendation?.status?.phosphorous === "excess"
                          ? "#d97706"
                          : colors.primary,
                    }}
                  >
                    [{analysisResult.npk_recommendation?.status?.phosphorous || "optimal"}]
                  </Text>
                </View>

                {/* Potassium */}
                <View className="flex-1 p-2 bg-white rounded-lg border border-amber-200 items-center">
                  <Text className="text-xs text-gray-500">Potassium (K)</Text>
                  <Text className="text-sm font-extrabold text-rose-700 mt-0.5">
                    {analysisResult.npk_reading?.potassium ?? 0} mg/kg
                  </Text>
                  <Text
                    className="text-[10px] font-bold uppercase mt-1"
                    style={{
                      color:
                        analysisResult.npk_recommendation?.status?.potassium === "deficient"
                          ? colors.danger
                          : analysisResult.npk_recommendation?.status?.potassium === "excess"
                          ? "#d97706"
                          : colors.primary,
                    }}
                  >
                    [{analysisResult.npk_recommendation?.status?.potassium || "optimal"}]
                  </Text>
                </View>
              </View>
            </View>

            {/* Detailed NPK Recommendations List */}
            {analysisResult.npk_recommendation?.recommendation && (
              <View
                className="p-4 border rounded-xl bg-gray-50 space-y-3"
                style={{ borderColor: colors.borderGray }}
              >
                <Text className="font-bold text-sm text-gray-800">
                  Actionable Fertilizer Instructions
                </Text>
                <View className="space-y-2">
                  {(Array.isArray(analysisResult.npk_recommendation.recommendation)
                    ? analysisResult.npk_recommendation.recommendation
                    : [analysisResult.npk_recommendation.recommendation]
                  ).map((step, idx) => (
                    <View
                      key={idx}
                      className="p-2.5 bg-white rounded-lg border flex-row items-start gap-2"
                      style={{ borderColor: colors.borderGray }}
                    >
                      <Text className="font-bold text-amber-600">•</Text>
                      <Text className="text-xs text-gray-700 flex-1 leading-snug">{step}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}