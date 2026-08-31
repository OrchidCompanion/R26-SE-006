import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useSelector } from "react-redux";
import { Camera } from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL } from "../src/config/api";

export default function AnalyseDiseaseScreen() {
  const { token } = useSelector((state) => state.auth);

  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      setImage(res.assets[0]);
      setResult(null);
    }
  };

  const handleRunAnalysis = async () => {
    if (!image) {
      Alert.alert("Error", "Please select a leaf photo first.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("image", { uri: image.uri, name: "leaf.jpg", type: "image/jpeg" });

    try {
      const res = await fetch(`${API_BASE_URL}/disease/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Disease diagnostics failed.");
      setResult(data);
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Disease Diagnostics" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          onPress={pickImage}
          className="border-2 border-dashed rounded-2xl p-6 items-center justify-center bg-white mb-4"
          style={{ borderColor: colors.borderGray }}
        >
          {image ? (
            <Image source={{ uri: image.uri }} className="w-full h-48 rounded-xl" resizeMode="cover" />
          ) : (
            <>
              <Camera size={26} color={colors.mediumGray} className="mb-2" />
              <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>Select Symptomatic Leaf Photo</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleRunAnalysis}
          disabled={loading || !image}
          className="py-3.5 rounded-xl items-center justify-center shadow-xs mb-6"
          style={{ backgroundColor: colors.primary }}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text className="text-sm font-bold text-white">Run Diagnostics</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View className="p-4 rounded-2xl bg-white border space-y-3" style={{ borderColor: colors.borderGray }}>
            <View
              className="p-3 rounded-xl items-center"
              style={{ backgroundColor: result.verdict === "HEALTHY" ? colors.primaryLight : colors.dangerLight }}
            >
              <Text
                className="text-base font-extrabold"
                style={{ color: result.verdict === "HEALTHY" ? colors.primary : colors.danger }}
              >
                {result.verdict_msg || result.disease_name}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">Confidence: {result.confidence}%</Text>
            </View>

            {result.treatment && (
              <View className="pt-2">
                <Text className="text-xs font-bold uppercase mb-1.5" style={{ color: colors.darkGray }}>
                  Recommended Treatment:
                </Text>
                {result.treatment.map((t, idx) => (
                  <Text key={idx} className="text-xs text-gray-600 mb-1">• {t}</Text>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}