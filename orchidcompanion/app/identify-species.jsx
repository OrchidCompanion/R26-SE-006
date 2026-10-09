import React, { useState } from "react";
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
import * as ImagePicker from "expo-image-picker";
import { useSelector } from "react-redux";
import {
  Camera,
  CheckCircle2,
  HelpCircle,
  Layers,
  AlertCircle,
  FileQuestion,
  RotateCcw,
  Sparkles,
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";

const CONFIDENCE_THRESHOLD = 0.6;

const QUESTION_MAP = {
  Phalaenopsis: "q1",
  Dendrobium: "q2",
  Oncidium: "q3",
};

const QUESTIONS = [
  {
    id: "q1",
    species: "Phalaenopsis",
    title: "1. Leaf Rosette & Central Crown",
    description:
      "Does the plant grow upright from a single short central stem with broad, fleshy, leathery leaves (no swollen bulbs or canes)?",
    image: require("../assets/species-leaf-rosette.png"),
  },
  {
    id: "q2",
    species: "Dendrobium",
    title: "2. Tall Segmented Canes",
    description:
      "Does the plant have tall, jointed cane-like stems with leaves growing directly along the side nodes of the canes?",
    image: require("../assets/species-tall-segmented-canes.png"),
  },
  {
    id: "q3",
    species: "Oncidium",
    title: "3. Oval Pseudobulb",
    description:
      "Does the plant have distinct oval or flattened green bulbs at the base with slender strap-like leaves rising from the top of the bulb?",
    image: require("../assets/species-oval-pseudobulb.png"),
  },
];

export default function IdentifySpeciesScreen() {
  const { token } = useSelector((state) => state.auth);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({
    q1: "not_sure",
    q2: "not_sure",
    q3: "not_sure",
  });

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Allow photo library access to upload orchid images."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      if (result.assets.length > 5) {
        setError("Please select up to 5 images (1 or 2 images recommended).");
        return;
      }
      setError("");
      setSelectedFiles(result.assets);
      setAnalysisResult(null);
    }
  };

  const handleIdentify = async () => {
    if (selectedFiles.length === 0) return;

    setLoading(true);
    setError("");
    setAnalysisResult(null);

    const formData = new FormData();
    selectedFiles.forEach((file, index) => {
      formData.append("files", {
        uri: file.uri,
        name: `orchid_${index}.jpg`,
        type: "image/jpeg",
      });
    });

    try {
      const res = await fetch(`${API_BASE_URL}/species/identify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Identification failed.");
      }

      const data = await res.json();
      setAnalysisResult(data);
    } catch (err) {
      setError(err.message || "Could not connect to the identification server.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setAnalysisResult(null);
    setError("");
    setAnswers({
      q1: "not_sure",
      q2: "not_sure",
      q3: "not_sure",
    });
  };

  const parseConfidence = (conf) => {
    if (typeof conf === "number") {
      return conf <= 1 ? conf : conf / 100;
    }
    if (typeof conf === "string") {
      const clean = parseFloat(conf.replace("%", "").trim());
      return clean > 1 ? clean / 100 : clean;
    }
    return 0;
  };

  const formatSpeciesName = (str = "") => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getProcessedResults = () => {
    if (!analysisResult || !analysisResult.results) return null;

    let totalValidDetections = 0;
    const detectedSpeciesScores = { Dendrobium: 0, Phalaenopsis: 0, Oncidium: 0 };
    const detectedSpeciesCounts = { Dendrobium: 0, Phalaenopsis: 0, Oncidium: 0 };

    const processedPhotos = analysisResult.results.map((res, index) => {
      const validDetections = (res.detections || []).filter((det) => {
        const score = parseConfidence(det.confidence ?? det.confidence_percentage);
        return score >= CONFIDENCE_THRESHOLD;
      });

      totalValidDetections += validDetections.length;
      validDetections.forEach((det) => {
        const name = formatSpeciesName(det.species);
        if (detectedSpeciesScores[name] !== undefined) {
          const score = parseConfidence(det.confidence ?? det.confidence_percentage);
          detectedSpeciesScores[name] += score;
          detectedSpeciesCounts[name] += 1;
        }
      });

      return {
        ...res,
        validDetections,
        displayImage:
          validDetections.length > 0 && res.annotated_image
            ? res.annotated_image.startsWith("data:")
              ? res.annotated_image
              : `data:image/jpeg;base64,${res.annotated_image}`
            : selectedFiles[index]?.uri,
      };
    });

    const isImageDetected = totalValidDetections > 0;

    const aiConfidence = {
      Dendrobium:
        detectedSpeciesCounts.Dendrobium > 0
          ? detectedSpeciesScores.Dendrobium / detectedSpeciesCounts.Dendrobium
          : 0,
      Phalaenopsis:
        detectedSpeciesCounts.Phalaenopsis > 0
          ? detectedSpeciesScores.Phalaenopsis / detectedSpeciesCounts.Phalaenopsis
          : 0,
      Oncidium:
        detectedSpeciesCounts.Oncidium > 0
          ? detectedSpeciesScores.Oncidium / detectedSpeciesCounts.Oncidium
          : 0,
    };

    const sortedAiPredictions = Object.entries(aiConfidence)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]);

    if (!isImageDetected || sortedAiPredictions.length === 0) {
      return {
        isIdentified: false,
        statusType: "unidentified",
        verdictTitle: "No Dendrobium, Phalaenopsis or Oncidium species identified.",
        verdictSubtitle:
          "Morphological feature contradiction or low image confidence prevented reliable identification.",
        topSpecies: null,
        topScorePct: 0,
        isImageDetected: false,
        photos: processedPhotos,
      };
    }

    const topSpecies = sortedAiPredictions[0][0];
    const baseAiScore = sortedAiPredictions[0][1];
    const targetQuestionId = QUESTION_MAP[topSpecies];
    const userAnswer = answers[targetQuestionId];

    const yesCount = Object.values(answers).filter((val) => val === "yes").length;
    const hasContradictoryYes = yesCount > 1;

    let finalScore = baseAiScore;
    let verdictSubtitle = "";
    let statusType = "single";

    if (hasContradictoryYes) {
      finalScore = baseAiScore;
      verdictSubtitle = `Multiple conflicting answers selected, used only image identifier detection of ${topSpecies} as ${Math.round(
        baseAiScore * 100
      )}%`;
    } else if (userAnswer === "yes") {
      finalScore = Math.min(baseAiScore + 0.15, 0.98);
      verdictSubtitle = `Image identifier detected ${topSpecies} as ${Math.round(
        baseAiScore * 100
      )}% and selected answers match with identified species`;
    } else if (userAnswer === "no") {
      finalScore = Math.max(baseAiScore - 0.15, 0.0);
      verdictSubtitle = `Image identifier detected ${topSpecies} as ${Math.round(
        baseAiScore * 100
      )}%, but selected answers do not match with identified species.`;
    } else {
      finalScore = baseAiScore;
      verdictSubtitle = `Identified solely by image identifier ${topSpecies} as (${Math.round(
        baseAiScore * 100
      )}%).`;
    }

    const isIdentified = finalScore >= 0.6;
    const topScorePct = Math.round(finalScore * 100);

    let verdictTitle = "";
    if (!isIdentified) {
      statusType = "unidentified";
      verdictTitle = "No Orchid Species Identified";
      verdictSubtitle =
        "Morphological feature contradiction or low image confidence prevented reliable identification.";
    } else if (
      sortedAiPredictions.length > 1 &&
      sortedAiPredictions[0][1] - sortedAiPredictions[1][1] < 0.1 &&
      userAnswer === "not_sure"
    ) {
      statusType = "multiple";
      verdictTitle = `Multiple Possible Species (${sortedAiPredictions
        .map(([s]) => s)
        .join(", ")})`;
    } else {
      statusType = "single";
      verdictTitle = `Identified as ${topSpecies} orchid`;
    }

    return {
      isIdentified,
      statusType,
      verdictTitle,
      verdictSubtitle,
      topSpecies,
      topScorePct,
      isImageDetected,
      photos: processedPhotos,
    };
  };

  const processedData = getProcessedResults();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Identify Species" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Upload Zone */}
        {selectedFiles.length === 0 && !analysisResult && (
          <TouchableOpacity
            onPress={pickImages}
            activeOpacity={0.8}
            className="border-2 border-dashed rounded-3xl p-8 items-center justify-center bg-white mb-4 shadow-xs"
            style={{ borderColor: colors.primary }}
          >
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-3 shadow-xs"
              style={{ backgroundColor: colors.primaryLight }}
            >
              <Camera size={28} color={colors.primary} />
            </View>
            <Text className="text-base font-extrabold" style={{ color: colors.darkGray }}>
              Upload Orchid Photos
            </Text>
            <Text
              className="text-xs text-center mt-1 px-4 leading-relaxed"
              style={{ color: colors.mediumGray }}
            >
              Upload 1 or 2 clear photos of the same plant from different angles for higher accuracy
            </Text>
          </TouchableOpacity>
        )}

        {error ? (
          <View
            className="p-3.5 mb-4 rounded-xl flex-row items-center border"
            style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
          >
            <AlertCircle size={18} color={colors.danger} className="mr-2 shrink-0" />
            <Text className="text-xs font-bold flex-1" style={{ color: colors.danger }}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Selected Images & Morphological Questions */}
        {selectedFiles.length > 0 && !analysisResult && (
          <View className="space-y-4 mb-6">
            <View className="flex-row justify-between items-center">
              <Text className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colors.darkGray }}>
                Selected Images ({selectedFiles.length})
              </Text>
              <TouchableOpacity onPress={handleReset}>
                <Text className="text-xs font-bold" style={{ color: colors.danger }}>
                  Clear All
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2.5 pb-1">
              {selectedFiles.map((file, i) => (
                <View
                  key={i}
                  className="w-24 h-24 rounded-2xl overflow-hidden border bg-white shadow-xs relative"
                  style={{ borderColor: colors.borderGray }}
                >
                  <Image source={{ uri: file.uri }} className="w-full h-full" resizeMode="cover" />
                  <View className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded">
                    <Text className="text-[10px] font-bold text-white">#{i + 1}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Morphology Questionnaire with Icons */}
            <View
              className="p-4 rounded-3xl border bg-white shadow-xs space-y-3"
              style={{ borderColor: colors.borderGray }}
            >
              <View className="flex-row items-center pb-2 border-b gap-1.5" style={{ borderColor: colors.borderGray }}>
                <FileQuestion size={18} color={colors.primary} />
                <Text className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colors.darkGray }}>
                  Select Matching Characteristics
                </Text>
              </View>

              {QUESTIONS.map((q) => (
                <View
                  key={q.id}
                  className="p-3.5 rounded-2xl border bg-gray-50/70 mb-3"
                  style={{ borderColor: colors.borderGray }}
                >
                  <View className="flex-row gap-3 items-center mb-2.5">
                    <View
                      className="w-16 h-16 rounded-xl p-1 bg-white border items-center justify-center shadow-2xs shrink-0"
                      style={{ borderColor: colors.borderGray }}
                    >
                      <Image source={q.image} className="w-full h-full" resizeMode="contain" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-black" style={{ color: colors.darkGray }}>
                        {q.title}
                      </Text>
                      <Text className="text-[11px] text-gray-500 leading-relaxed mt-0.5">
                        {q.description}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-1.5">
                    {[
                      { label: "Yes", val: "yes" },
                      { label: "No", val: "no" },
                      { label: "Not Sure", val: "not_sure" },
                    ].map((btn) => {
                      const isSelected = answers[q.id] === btn.val;
                      let activeBg = colors.primary;
                      if (isSelected) {
                        if (btn.val === "yes") activeBg = colors.primary;
                        if (btn.val === "no") activeBg = colors.danger;
                        if (btn.val === "not_sure") activeBg = colors.darkGray;
                      }

                      return (
                        <TouchableOpacity
                          key={btn.val}
                          onPress={() => handleAnswerChange(q.id, btn.val)}
                          className="flex-1 py-2 rounded-xl border items-center shadow-2xs"
                          style={{
                            backgroundColor: isSelected ? activeBg : colors.white,
                            borderColor: isSelected ? activeBg : colors.borderGray,
                          }}
                        >
                          <Text
                            className="text-xs font-bold"
                            style={{ color: isSelected ? colors.white : colors.darkGray }}
                          >
                            {btn.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>

            {/* Run Action */}
            <View className="flex-row gap-2 pt-1">
              <TouchableOpacity
                onPress={handleIdentify}
                disabled={loading || selectedFiles.length === 0}
                className="flex-1 py-3.5 rounded-2xl items-center justify-center shadow-xs"
                style={{ backgroundColor: colors.primary }}
              >
                {loading ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator color={colors.white} size="small" />
                    <Text className="text-xs font-bold text-white">
                      Analyzing {selectedFiles.length} Image(s)...
                    </Text>
                  </View>
                ) : (
                  <Text className="text-xs font-bold text-white">
                    Run Detection on {selectedFiles.length} Image(s)
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReset}
                disabled={loading}
                className="px-5 py-3.5 rounded-2xl border bg-white"
                style={{ borderColor: colors.borderGray }}
              >
                <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>
                  Clear
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* COMPREHENSIVE RESULTS VIEW */}
        {processedData && (
          <View className="space-y-4 mb-8">
            {/* Main Verdict Card */}
            <View
              className="p-4 rounded-3xl border shadow-xs"
              style={{
                backgroundColor:
                  processedData.statusType === "single"
                    ? colors.primaryLight
                    : processedData.statusType === "multiple"
                    ? "#eef2ff"
                    : "#fffbeb",
                borderColor:
                  processedData.statusType === "single"
                    ? colors.primary
                    : processedData.statusType === "multiple"
                    ? "#6366f1"
                    : "#f59e0b",
              }}
            >
              <View className="flex-row items-start gap-2.5">
                {processedData.statusType === "single" && (
                  <CheckCircle2 size={24} color={colors.primary} className="shrink-0 mt-0.5" />
                )}
                {processedData.statusType === "multiple" && (
                  <Layers size={24} color="#6366f1" className="shrink-0 mt-0.5" />
                )}
                {processedData.statusType === "unidentified" && (
                  <HelpCircle size={24} color="#f59e0b" className="shrink-0 mt-0.5" />
                )}

                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                    <Text
                      className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md"
                      style={{
                        backgroundColor:
                          processedData.statusType === "single"
                            ? colors.primary
                            : processedData.statusType === "multiple"
                            ? "#6366f1"
                            : "#f59e0b",
                        color: colors.white,
                      }}
                    >
                      {processedData.statusType === "single" && "Species Match"}
                      {processedData.statusType === "multiple" && "Multi-Species Detected"}
                      {processedData.statusType === "unidentified" && "Not Identified"}
                    </Text>
                  </View>

                  <Text className="text-base font-black" style={{ color: colors.darkGray }}>
                    {processedData.verdictTitle}
                  </Text>
                  <Text className="text-xs text-gray-600 mt-1 leading-relaxed">
                    {processedData.verdictSubtitle}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleReset}
                className="mt-3 py-2.5 rounded-xl items-center shadow-2xs"
                style={{
                  backgroundColor:
                    processedData.statusType === "single"
                      ? colors.primary
                      : processedData.statusType === "multiple"
                      ? "#6366f1"
                      : "#f59e0b",
                }}
              >
                <Text className="text-xs font-bold text-white">Analyze Another Plant</Text>
              </TouchableOpacity>
            </View>

            {/* Unidentified Guidance Tip */}
            {!processedData.isIdentified && (
              <View
                className="p-4 rounded-2xl bg-white border space-y-1.5 shadow-2xs"
                style={{ borderColor: colors.borderGray }}
              >
                <View className="flex-row items-center gap-1.5">
                  <AlertCircle size={16} color="#f59e0b" />
                  <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>
                    Tips for better identification:
                  </Text>
                </View>
                <Text className="text-xs text-gray-500 pl-5">
                  • Capture a clear, well-lit shot of the orchid plant.{"\n"}
                  • Avoid blurry shots or extreme close-ups of single leaves.
                </Text>
              </View>
            )}

            {/* Individual Photo Result Cards */}
            <Text className="text-xs font-extrabold uppercase tracking-wider pt-1" style={{ color: colors.darkGray }}>
              Analyzed Images ({processedData.photos.length})
            </Text>

            {processedData.photos.map((res, idx) => (
              <View
                key={idx}
                className="p-3.5 rounded-3xl border bg-white shadow-xs space-y-3 mb-3"
                style={{ borderColor: colors.borderGray }}
              >
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>
                    Photo #{idx + 1}
                  </Text>
                  <Text
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{
                      backgroundColor:
                        res.validDetections.length > 0 ? colors.primaryLight : colors.lightGray,
                      borderColor:
                        res.validDetections.length > 0 ? colors.primary : colors.borderGray,
                      color:
                        res.validDetections.length > 0 ? colors.primary : colors.mediumGray,
                    }}
                  >
                    {res.validDetections.length > 0
                      ? `${res.validDetections.length} ${
                          res.validDetections.length === 1 ? "Plant" : "Plants"
                        } Found`
                      : "No Match"}
                  </Text>
                </View>

                <View
                  className="rounded-2xl overflow-hidden border aspect-video bg-gray-950 items-center justify-center"
                  style={{ borderColor: colors.borderGray }}
                >
                  <Image
                    source={{ uri: res.displayImage }}
                    className="w-full h-full"
                    resizeMode="contain"
                  />
                </View>

                <View className="space-y-1.5">
                  {res.validDetections.length > 0 ? (
                    res.validDetections.map((det, dIdx) => (
                      <View
                        key={dIdx}
                        className="flex-row justify-between items-center p-2.5 bg-gray-50 rounded-xl border"
                        style={{ borderColor: colors.borderGray }}
                      >
                        <Text className="text-xs font-black uppercase" style={{ color: colors.darkGray }}>
                          🌱 {det.species}
                        </Text>
                        <Text className="text-xs font-black" style={{ color: colors.primary }}>
                          {det.confidence_percentage ||
                            `${(parseConfidence(det.confidence) * 100).toFixed(1)}%`}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text
                      className="text-xs text-center py-2 font-semibold italic"
                      style={{ color: colors.mediumGray }}
                    >
                      Species could not be reliably identified in this frame.
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}