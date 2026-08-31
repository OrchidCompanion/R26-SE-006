import { useState } from "react";
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
import { Camera, CheckCircle2, HelpCircle, Layers, X } from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL } from "../src/config/api";

const QUESTIONS = [
  {
    id: "q1",
    species: "Phalaenopsis",
    title: "1. Leaf Rosette & Central Crown",
    description: "Single short central stem with broad, fleshy, leathery leaves (no swollen canes)?",
  },
  {
    id: "q2",
    species: "Dendrobium",
    title: "2. Tall Segmented Canes",
    description: "Tall, jointed cane-like stems with leaves growing along side nodes?",
  },
  {
    id: "q3",
    species: "Oncidium",
    title: "3. Oval Pseudobulb",
    description: "Distinct oval green bulbs at base with slender strap-like leaves rising from top?",
  },
];

const QUESTION_MAP = { Phalaenopsis: "q1", Dendrobium: "q2", Oncidium: "q3" };

export default function IdentifySpeciesScreen() {
  const { token } = useSelector((state) => state.auth);

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [answers, setAnswers] = useState({ q1: "not_sure", q2: "not_sure", q3: "not_sure" });

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow photo library access to upload orchid images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      setImages(result.assets);
      setAnalysisResult(null);
    }
  };

  const handleIdentify = async () => {
    if (images.length === 0) return;
    setLoading(true);

    const formData = new FormData();
    images.forEach((img, idx) => {
      formData.append("files", {
        uri: img.uri,
        name: `photo_${idx}.jpg`,
        type: "image/jpeg",
      });
    });

    try {
      const res = await fetch(`${API_BASE_URL}/species/identify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Identification failed.");
      setAnalysisResult(data);
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Identify Species" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {images.length === 0 && !analysisResult && (
          <TouchableOpacity
            onPress={pickImages}
            activeOpacity={0.7}
            className="border-2 border-dashed rounded-2xl p-8 items-center justify-center bg-white mb-4"
            style={{ borderColor: colors.primary }}
          >
            <View className="w-14 h-14 rounded-full items-center justify-center mb-2" style={{ backgroundColor: colors.primaryLight }}>
              <Camera size={26} color={colors.primary} />
            </View>
            <Text className="text-base font-bold" style={{ color: colors.darkGray }}>
              Upload Orchid Photos
            </Text>
            <Text className="text-xs text-center mt-1" style={{ color: colors.mediumGray }}>
              Upload 1–5 clear photos of the same plant from different angles
            </Text>
          </TouchableOpacity>
        )}

        {/* Selected Image Previews */}
        {images.length > 0 && !analysisResult && (
          <View className="mb-5">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-xs font-bold uppercase" style={{ color: colors.darkGray }}>
                Selected Images ({images.length})
              </Text>
              <TouchableOpacity onPress={() => setImages([])}>
                <Text className="text-xs font-bold" style={{ color: colors.danger }}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 mb-4">
              {images.map((img, i) => (
                <View key={i} className="w-24 h-24 rounded-xl overflow-hidden border relative" style={{ borderColor: colors.borderGray }}>
                  <Image source={{ uri: img.uri }} className="w-full h-full" />
                </View>
              ))}
            </ScrollView>

            {/* Questionnaire */}
            <Text className="text-xs font-bold uppercase mb-2" style={{ color: colors.darkGray }}>
              Match Characteristics
            </Text>
            {QUESTIONS.map((q) => (
              <View key={q.id} className="p-3 bg-white rounded-xl border mb-2.5" style={{ borderColor: colors.borderGray }}>
                <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>{q.title}</Text>
                <Text className="text-xs text-gray-500 mt-0.5 mb-2">{q.description}</Text>
                <View className="flex-row gap-1.5">
                  {["yes", "no", "not_sure"].map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setAnswers({ ...answers, [q.id]: opt })}
                      className="flex-1 py-1.5 rounded-lg border items-center"
                      style={{
                        backgroundColor: answers[q.id] === opt ? colors.primary : colors.lightGray,
                        borderColor: answers[q.id] === opt ? colors.primary : colors.borderGray,
                      }}
                    >
                      <Text
                        className="text-xs font-bold capitalize"
                        style={{ color: answers[q.id] === opt ? colors.white : colors.mediumGray }}
                      >
                        {opt.replace("_", " ")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={handleIdentify}
              disabled={loading}
              className="py-3.5 rounded-xl items-center justify-center mt-2 shadow-xs"
              style={{ backgroundColor: colors.primary }}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text className="text-sm font-bold" style={{ color: colors.white }}>Run Identification</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Results */}
        {analysisResult && (
          <View className="space-y-4">
            <View className="p-4 rounded-2xl border bg-white" style={{ borderColor: colors.borderGray }}>
              <Text className="text-sm font-bold uppercase mb-1" style={{ color: colors.primary }}>
                Identification Verdict
              </Text>
              <Text className="text-xl font-extrabold" style={{ color: colors.darkGray }}>
                {analysisResult.results?.[0]?.detections?.[0]?.species
                  ? `${analysisResult.results[0].detections[0].species} Orchid`
                  : "Species Identified"}
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                Visual inference combined with morphological verification.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                setImages([]);
                setAnalysisResult(null);
              }}
              className="py-3.5 rounded-xl items-center justify-center"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-sm font-bold" style={{ color: colors.white }}>Analyze Another Orchid</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}