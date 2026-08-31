import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useSelector } from "react-redux";
import { Camera } from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL } from "../src/config/api";

const SLOTS = [
  { id: "slot1", label: "Angle 1: Frontal (90°)" },
  { id: "slot2", label: "Angle 2: Side Profile 1" },
  { id: "slot3", label: "Angle 3: Side Profile 2" },
];

export default function PredictBloomingScreen() {
  const { token } = useSelector((state) => state.auth);

  const [images, setImages] = useState({ slot1: null, slot2: null, slot3: null });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const pickImageForSlot = async (slotId) => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      setImages({ ...images, [slotId]: res.assets[0] });
      setResult(null);
    }
  };

  const handlePredict = async () => {
    if (!images.slot1 || !images.slot2 || !images.slot3) {
      Alert.alert("Missing Photos", "Please capture all 3 required angles.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("image1", { uri: images.slot1.uri, name: "img1.jpg", type: "image/jpeg" });
    formData.append("image2", { uri: images.slot2.uri, name: "img2.jpg", type: "image/jpeg" });
    formData.append("image3", { uri: images.slot3.uri, name: "img3.jpg", type: "image/jpeg" });

    try {
      const res = await fetch(`${API_BASE_URL}/bloom/predict`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Prediction failed.");
      setResult(data);
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Predict Bloom" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        <Text className="text-xs font-bold uppercase mb-3" style={{ color: colors.mediumGray }}>
          3 Required Plant Angles
        </Text>

        <View className="flex-row gap-2 mb-4">
          {SLOTS.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => pickImageForSlot(s.id)}
              className="flex-1 aspect-square rounded-xl border border-dashed items-center justify-center bg-white overflow-hidden"
              style={{ borderColor: colors.borderGray }}
            >
              {images[s.id] ? (
                <Image source={{ uri: images[s.id].uri }} className="w-full h-full" />
              ) : (
                <View className="items-center p-1">
                  <Camera size={18} color={colors.mediumGray} />
                  <Text className="text-[10px] font-semibold text-center mt-1" style={{ color: colors.darkGray }}>
                    {s.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={handlePredict}
          disabled={loading || !images.slot1 || !images.slot2 || !images.slot3}
          className="py-3.5 rounded-xl items-center justify-center shadow-xs mb-6"
          style={{ backgroundColor: colors.primary }}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text className="text-sm font-bold text-white">Forecast Bloom Timeline</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View className="p-4 rounded-2xl bg-white border space-y-3" style={{ borderColor: colors.borderGray }}>
            <Text className="text-xs font-bold uppercase" style={{ color: colors.primary }}>
              Forecast: {result.prediction_msg || `${result.weeks} Weeks`}
            </Text>
            <Text className="text-lg font-extrabold" style={{ color: colors.darkGray }}>
              Stage: {result.current_stage} ({result.confidence}%)
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}