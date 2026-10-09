import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSelector } from "react-redux";
import {
  Camera,
  AlertCircle,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Layers,
  X,
  RotateCcw,
  Sparkles,
  Info,
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";

export default function AnalyseDiseaseScreen() {
  const { plant_id, plant_name } = useLocalSearchParams();
  const { user, token } = useSelector((state) => state.auth);

  const [selectedFile, setSelectedFile] = useState(null);
  const [npkReadings, setNpkReadings] = useState([]);
  const [loadingNpk, setLoadingNpk] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");
  const [selectedPreviewImage, setSelectedPreviewImage] = useState(null);

  const uniqueReadingDays = (rows) => {
    const days = new Set();
    for (const row of rows || []) {
      if (!row?.created_at) continue;
      const d = new Date(row.created_at);
      if (Number.isNaN(d.getTime())) continue;
      days.add(d.toISOString().slice(0, 10));
    }
    return days.size;
  };

  const fetchLast7DaysNpkReadings = useCallback(async () => {
    if (!plant_id) {
      setNpkReadings([]);
      setLoadingNpk(false);
      return;
    }

    setLoadingNpk(true);
    try {
      const headers = getAuthHeaders(token);
      const query = user?.user_id ? `?user_id=${user.user_id}` : "";

      const urls = [
        `${API_BASE_URL}/disease/plant/${plant_id}?include_npk=true&limit=10${query ? `&${query.slice(1)}` : ""}`,
        `${API_BASE_URL}/disease/plant/${plant_id}/npk-history${query}`,
        `${API_BASE_URL}/sensors/npk/plant/${plant_id}?page=1&limit=25`,
      ];

      let list = [];
      for (const url of urls) {
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const responseData = await res.json();
        const next = Array.isArray(responseData)
          ? responseData
          : responseData.npk_data || responseData.data || responseData.rows || [];
        if (
          Array.isArray(next) &&
          next.length &&
          next[0] &&
          ("nitrogen_n" in next[0] || "nitrogen" in next[0] || "N" in next[0])
        ) {
          list = next;
          break;
        }
      }

      setNpkReadings(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
      setNpkReadings([]);
    } finally {
      setLoadingNpk(false);
    }
  }, [plant_id, token, user?.user_id]);

  useEffect(() => {
    fetchLast7DaysNpkReadings();
  }, [fetchLast7DaysNpkReadings]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow photo library access to upload leaf photos.");
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
      setError("Please select a symptomatic orchid leaf photo first.");
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

      const res = await fetch(`${API_BASE_URL}/disease/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Disease diagnostics failed.");
      }

      setAnalysisResult(data);
    } catch (err) {
      setError(err.message || "Failed to analyze leaf image.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setAnalysisResult(null);
    setError("");
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Disease Diagnostics" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Banner Header */}
        <View className="mb-4">
          <Text className="text-xl font-black" style={{ color: colors.darkGray }}>
            Diagnostic Ensemble {plant_name ? `— ${plant_name}` : ""}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            Integrates YOLOv11 leaf localization, MobileNetV2 classification, and 7-day NPK telemetry correlation.
          </Text>
        </View>

        {/* Upload Container */}
        <View className="mb-4">
          <TouchableOpacity
            onPress={pickImage}
            activeOpacity={0.8}
            className="border-2 border-dashed rounded-3xl p-6 items-center justify-center bg-white shadow-xs overflow-hidden"
            style={{ borderColor: selectedFile ? colors.primary : colors.borderGray }}
          >
            {selectedFile ? (
              <View className="w-full items-center space-y-2">
                <Image
                  source={{ uri: selectedFile.uri }}
                  className="w-full h-56 rounded-2xl"
                  resizeMode="cover"
                />
                <View className="flex-row items-center gap-1.5 pt-1">
                  <Camera size={14} color={colors.primary} />
                  <Text className="text-xs font-bold" style={{ color: colors.primary }}>
                    Tap to replace leaf image
                  </Text>
                </View>
              </View>
            ) : (
              <View className="items-center py-4">
                <View
                  className="w-14 h-14 rounded-full items-center justify-center mb-2 shadow-2xs"
                  style={{ backgroundColor: colors.primaryLight }}
                >
                  <Camera size={26} color={colors.primary} />
                </View>
                <Text className="text-sm font-extrabold" style={{ color: colors.darkGray }}>
                  Upload Symptomatic Leaf Photo
                </Text>
                <Text className="text-xs text-gray-400 mt-1">Supports JPG, PNG</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {error ? (
          <View
            className="p-3.5 mb-4 rounded-2xl flex-row items-center border"
            style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
          >
            <AlertCircle size={18} color={colors.danger} className="mr-2 shrink-0" />
            <Text className="text-xs font-bold flex-1" style={{ color: colors.danger }}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View className="flex-row gap-2 mb-4">
          <TouchableOpacity
            onPress={handleRunAnalysis}
            disabled={analyzing || !selectedFile}
            className="flex-1 py-3.5 rounded-2xl items-center justify-center shadow-xs"
            style={{
              backgroundColor: analyzing || !selectedFile ? colors.mediumGray : colors.primary,
            }}
          >
            {analyzing ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color={colors.white} size="small" />
                <Text className="text-xs font-bold text-white">Running AI Ensemble...</Text>
              </View>
            ) : (
              <Text className="text-xs font-bold text-white">Run Disease Analysis</Text>
            )}
          </TouchableOpacity>

          {selectedFile && (
            <TouchableOpacity
              onPress={handleReset}
              disabled={analyzing}
              className="px-4 py-3.5 rounded-2xl border bg-white items-center justify-center"
              style={{ borderColor: colors.borderGray }}
            >
              <RotateCcw size={16} color={colors.darkGray} />
            </TouchableOpacity>
          )}
        </View>

        {/* 7-Day NPK History Telemetry Card */}
        <View
          className="p-4 rounded-3xl bg-white border mb-4 shadow-xs space-y-3"
          style={{ borderColor: colors.borderGray }}
        >
          <View className="flex-row justify-between items-center pb-2 border-b" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row items-center gap-1.5">
              <Activity size={16} color={colors.primary} />
              <Text className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colors.darkGray }}>
                Cocopeat NPK History (Last 7 Days)
              </Text>
            </View>
            <Text className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              {loadingNpk ? "..." : `${npkReadings.length} readings`}
            </Text>
          </View>

          {!loadingNpk && uniqueReadingDays(npkReadings) < 7 && (
            <View className="p-2.5 rounded-xl border border-amber-200 bg-amber-50">
              <Text className="text-[11px] font-bold text-amber-900">
                {npkReadings.length === 0
                  ? "No NPK readings recorded for this plant yet."
                  : `Active window: ${uniqueReadingDays(npkReadings)} of 7 days recorded.`}
              </Text>
            </View>
          )}

          {loadingNpk ? (
            <ActivityIndicator size="small" color={colors.primary} className="py-4" />
          ) : npkReadings.length === 0 ? (
            <Text className="text-xs italic text-gray-400 text-center py-3">
              No NPK readings recorded for this plant yet. Baseline nutrient parameters will be applied.
            </Text>
          ) : (
            <View className="space-y-1.5 max-h-56">
              {npkReadings.slice(0, 5).map((r, i) => (
                <View
                  key={r.reading_id || i}
                  className="p-2.5 rounded-2xl bg-gray-50 border flex-row justify-between items-center"
                  style={{ borderColor: colors.borderGray }}
                >
                  <View>
                    <Text className="text-[11px] font-bold" style={{ color: colors.darkGray }}>
                      {r.time_slot ? r.time_slot.toUpperCase() : "AUTO"}
                    </Text>
                    <Text className="text-[9px] text-gray-400 font-mono">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                    </Text>
                  </View>

                  <View className="flex-row gap-2">
                    <Text className="text-[11px] font-extrabold text-emerald-700">
                      N: {r.nitrogen_n ?? r.nitrogen ?? r.N ?? 0}
                    </Text>
                    <Text className="text-[11px] font-extrabold text-amber-700">
                      P: {r.phosphorus_p ?? r.phosphorus ?? r.phosphorous ?? r.P ?? 0}
                    </Text>
                    <Text className="text-[11px] font-extrabold text-rose-700">
                      K: {r.potassium_k ?? r.potassium ?? r.K ?? 0}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ANALYSIS RESULTS VIEW */}
        {analysisResult && (
          <View className="space-y-4 mb-8">
            <Text className="text-base font-black" style={{ color: colors.darkGray }}>
              Diagnostic Verdict & Results
            </Text>

            {/* Verdict Banner */}
            <View
              className="p-4 rounded-3xl shadow-xs items-center justify-center"
              style={{
                backgroundColor:
                  analysisResult.verdict === "HEALTHY" ? colors.primary : colors.danger,
              }}
            >
              <Text className="text-xs uppercase font-extrabold text-white/80 tracking-wider">
                Overall Diagnostic Verdict
              </Text>
              <Text className="text-xl font-black text-white mt-0.5 text-center">
                {analysisResult.verdict_msg ||
                  (analysisResult.verdict === "HEALTHY"
                    ? "Plant Leaf is Healthy"
                    : `Disease Detected: ${analysisResult.disease_name}`)}
              </Text>
            </View>

            {/* Confidence & Detection Card */}
            <View
              className="p-4 rounded-3xl bg-white border shadow-xs space-y-3"
              style={{ borderColor: colors.borderGray }}
            >
              <View className="flex-row justify-between items-center pb-2 border-b" style={{ borderColor: colors.borderGray }}>
                <Text className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                  Detection Confidence
                </Text>
                <Text className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                  {analysisResult.disease_info || analysisResult.disease_name || "Diagnostic Complete"}
                </Text>
              </View>

              <View className="space-y-1">
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs font-bold text-gray-700">Confidence Rating</Text>
                  <Text className="text-sm font-black" style={{ color: colors.primary }}>
                    {analysisResult.confidence}%
                  </Text>
                </View>

                <View className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: colors.primary,
                      width: `${analysisResult.confidence}%`,
                    }}
                  />
                </View>
              </View>

              {/* Recommended Protocol */}
              {analysisResult.treatment && (
                <View className="pt-2 border-t space-y-1.5" style={{ borderColor: colors.borderGray }}>
                  <Text className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                    Recommended Treatment Protocol:
                  </Text>
                  {(Array.isArray(analysisResult.treatment)
                    ? analysisResult.treatment
                    : [analysisResult.treatment]
                  ).map((t, idx) => (
                    <View
                      key={idx}
                      className="p-2.5 rounded-xl border flex-row items-start gap-1.5"
                      style={{
                        backgroundColor:
                          analysisResult.verdict === "HEALTHY"
                            ? colors.primaryLight
                            : "#fffbeb",
                        borderColor:
                          analysisResult.verdict === "HEALTHY"
                            ? "#a7f3d0"
                            : "#fde68a",
                      }}
                    >
                      <Text className="text-xs font-black text-emerald-600 mt-0.5">•</Text>
                      <Text className="text-xs flex-1 font-medium leading-relaxed" style={{ color: colors.darkGray }}>
                        {t}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* NPK Context & 7-Day Mean Card */}
            <View
              className="p-4 rounded-3xl bg-white border shadow-xs space-y-3"
              style={{ borderColor: colors.borderGray }}
            >
              <Text className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                NPK Cocopeat Context
              </Text>

              {/* Latest Reading Grid */}
              <View className="flex-row gap-2">
                <View className="flex-1 p-2.5 rounded-2xl bg-gray-50 border items-center" style={{ borderColor: colors.borderGray }}>
                  <Text className="text-[10px] font-bold text-gray-400 uppercase">Nitrogen</Text>
                  <Text className="text-sm font-black text-emerald-700 mt-0.5">
                    {analysisResult.npk_reading?.nitrogen ?? analysisResult.npk?.N ?? "—"}
                  </Text>
                  <Text className="text-[9px] text-gray-400">mg/kg</Text>
                </View>

                <View className="flex-1 p-2.5 rounded-2xl bg-gray-50 border items-center" style={{ borderColor: colors.borderGray }}>
                  <Text className="text-[10px] font-bold text-gray-400 uppercase">Phosphorus</Text>
                  <Text className="text-sm font-black text-amber-700 mt-0.5">
                    {analysisResult.npk_reading?.phosphorous ?? analysisResult.npk?.P ?? "—"}
                  </Text>
                  <Text className="text-[9px] text-gray-400">mg/kg</Text>
                </View>

                <View className="flex-1 p-2.5 rounded-2xl bg-gray-50 border items-center" style={{ borderColor: colors.borderGray }}>
                  <Text className="text-[10px] font-bold text-gray-400 uppercase">Potassium</Text>
                  <Text className="text-sm font-black text-rose-700 mt-0.5">
                    {analysisResult.npk_reading?.potassium ?? analysisResult.npk?.K ?? "—"}
                  </Text>
                  <Text className="text-[9px] text-gray-400">mg/kg</Text>
                </View>
              </View>

              {/* 7-Day Nutrient Evaluation Details */}
              {analysisResult.npk_window && (
                <View className="pt-2 border-t space-y-2" style={{ borderColor: colors.borderGray }}>
                  <Text className="text-[11px] font-bold text-gray-700">
                    7-Day Rolling Average ({analysisResult.npk_window.sample_size} readings)
                  </Text>

                  {analysisResult.npk_window.deficiency_msg && (
                    <View
                      className="p-2.5 rounded-xl border"
                      style={{
                        backgroundColor: analysisResult.npk_window.has_deficiency
                          ? colors.dangerLight
                          : colors.primaryLight,
                        borderColor: analysisResult.npk_window.has_deficiency
                          ? colors.danger
                          : colors.primary,
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{
                          color: analysisResult.npk_window.has_deficiency
                            ? colors.danger
                            : colors.primary,
                        }}
                      >
                        {analysisResult.npk_window.deficiency_msg}
                      </Text>
                    </View>
                  )}

                  <View className="flex-row gap-2">
                    <View className="flex-1 p-2 bg-gray-50 rounded-xl border items-center" style={{ borderColor: colors.borderGray }}>
                      <Text className="text-[9px] text-gray-400 uppercase font-bold">Avg N</Text>
                      <Text className="text-xs font-black text-emerald-700 mt-0.5">
                        {analysisResult.npk_window.mean?.N ?? "—"}
                      </Text>
                      <Text className="text-[9px] text-gray-500 mt-0.5">
                        {analysisResult.npk_window.mean_status?.N}
                      </Text>
                    </View>
                    <View className="flex-1 p-2 bg-gray-50 rounded-xl border items-center" style={{ borderColor: colors.borderGray }}>
                      <Text className="text-[9px] text-gray-400 uppercase font-bold">Avg P</Text>
                      <Text className="text-xs font-black text-amber-700 mt-0.5">
                        {analysisResult.npk_window.mean?.P ?? "—"}
                      </Text>
                      <Text className="text-[9px] text-gray-500 mt-0.5">
                        {analysisResult.npk_window.mean_status?.P}
                      </Text>
                    </View>
                    <View className="flex-1 p-2 bg-gray-50 rounded-xl border items-center" style={{ borderColor: colors.borderGray }}>
                      <Text className="text-[9px] text-gray-400 uppercase font-bold">Avg K</Text>
                      <Text className="text-xs font-black text-rose-700 mt-0.5">
                        {analysisResult.npk_window.mean?.K ?? "—"}
                      </Text>
                      <Text className="text-[9px] text-gray-500 mt-0.5">
                        {analysisResult.npk_window.mean_status?.K}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Multi-Model Ensemble Breakdown */}
            {analysisResult.ensemble && (
              <View
                className="p-4 rounded-3xl bg-white border shadow-xs space-y-2.5"
                style={{ borderColor: colors.borderGray }}
              >
                <View className="flex-row items-center gap-1.5">
                  <Layers size={16} color={colors.primary} />
                  <Text className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                    Ensemble Class Voting
                  </Text>
                </View>

                <View className="space-y-1.5">
                  <View className="p-2.5 bg-gray-50 rounded-xl border flex-row justify-between items-center" style={{ borderColor: colors.borderGray }}>
                    <Text className="text-xs font-bold text-gray-600">YOLO Localization</Text>
                    <Text className="text-xs font-extrabold" style={{ color: colors.darkGray }}>
                      {analysisResult.ensemble.yolo?.class_name || "No Bounding Box"}{" "}
                      {analysisResult.ensemble.yolo?.confidence
                        ? `(${Math.round(analysisResult.ensemble.yolo.confidence * 100)}%)`
                        : ""}
                    </Text>
                  </View>

                  <View className="p-2.5 bg-gray-50 rounded-xl border flex-row justify-between items-center" style={{ borderColor: colors.borderGray }}>
                    <Text className="text-xs font-bold text-gray-600">MobileNetV2 Classifier</Text>
                    <Text className="text-xs font-extrabold" style={{ color: colors.darkGray }}>
                      {analysisResult.ensemble.mobilenet?.class_name}{" "}
                      ({Math.round((analysisResult.ensemble.mobilenet?.confidence || 0) * 100)}%)
                    </Text>
                  </View>

                  <View className="p-2.5 bg-gray-50 rounded-xl border flex-row justify-between items-center" style={{ borderColor: colors.borderGray }}>
                    <Text className="text-xs font-bold text-gray-600">CNN Ensemble Node</Text>
                    <Text className="text-xs font-extrabold" style={{ color: colors.darkGray }}>
                      {analysisResult.ensemble.cnn?.class_name}{" "}
                      ({Math.round((analysisResult.ensemble.cnn?.confidence || 0) * 100)}%)
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Annotated Bounding Box Result Image */}
            {analysisResult.result_image && (
              <View
                className="p-4 rounded-3xl bg-white border shadow-xs space-y-2.5"
                style={{ borderColor: colors.borderGray }}
              >
                <Text className="text-xs font-extrabold uppercase tracking-wider text-gray-700">
                  AI Detection Output (Bounding Box Localization)
                </Text>

                <TouchableOpacity
                  onPress={() =>
                    setSelectedPreviewImage(`data:image/jpeg;base64,${analysisResult.result_image}`)
                  }
                  className="rounded-2xl overflow-hidden border aspect-video bg-gray-950 items-center justify-center"
                  style={{ borderColor: colors.borderGray }}
                >
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${analysisResult.result_image}` }}
                    className="w-full h-full"
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              </View>
            )}

            {/* Analyze Another Button */}
            <TouchableOpacity
              onPress={handleReset}
              className="py-3.5 rounded-2xl items-center justify-center shadow-xs"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-xs font-bold text-white">Analyze Another Plant Leaf</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* FULL-IMAGE PREVIEW MODAL */}
      <Modal visible={Boolean(selectedPreviewImage)} transparent animationType="fade">
        <View className="flex-1 bg-black/80 justify-center items-center p-4">
          <View className="w-full bg-white rounded-3xl p-4 shadow-xl space-y-3">
            <View className="flex-row justify-between items-center border-b pb-2" style={{ borderColor: colors.borderGray }}>
              <Text className="text-sm font-bold" style={{ color: colors.darkGray }}>
                YOLO Detection Annotation
              </Text>
              <TouchableOpacity onPress={() => setSelectedPreviewImage(null)}>
                <X size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            {selectedPreviewImage && (
              <Image
                source={{ uri: selectedPreviewImage }}
                className="w-full h-80 rounded-2xl"
                resizeMode="contain"
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}