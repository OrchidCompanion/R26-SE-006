import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, TextInput, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useSelector } from "react-redux";
import { Camera } from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL } from "../src/config/api";

export default function AnalyseFertilizerScreen() {
  const { token } = useSelector((state) => state.auth);

  const [image, setImage] = useState(null);
  const [leafCount, setLeafCount] = useState("1");
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
      Alert.alert("Error", "Please select an orchid leaf photo with a Rs. 5 coin reference.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("image", { uri: image.uri, name: "leaf.jpg", type: "image/jpeg" });
    formData.append("leaf_count", leafCount);

    try {
      const res = await fetch(`${API_BASE_URL}/fertilizer/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Analysis failed.");
      setResult(data);
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Fertilizer Analysis" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Photo Instructions */}
        <View className="p-3.5 rounded-2xl bg-amber-50 border mb-4" style={{ borderColor: colors.accent }}>
          <Text className="text-xs font-bold text-amber-900 mb-1">Photo Instructions</Text>
          <Text className="text-xs text-amber-800">
            • Place 1 leaf flat on clean white A4 paper{"\n"}
            • Place a Sri Lankan Rs. 5 coin beside the leaf without touching{"\n"}
            • Take a direct top-down photo
          </Text>
        </View>

        {/* Upload Slot */}
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
              <Text className="text-xs font-bold" style={{ color: colors.darkGray }}>Select Leaf Image</Text>
            </>
          )}
        </TouchableOpacity>

        <View className="flex-row items-center justify-between p-3.5 bg-white rounded-xl border mb-4" style={{ borderColor: colors.borderGray }}>
          <Text className="text-xs font-bold uppercase" style={{ color: colors.darkGray }}>Total Plant Leaf Count</Text>
          <TextInput
            keyboardType="numeric"
            value={leafCount}
            onChangeText={setLeafCount}
            className="w-16 px-2 py-1 text-center font-bold border rounded-lg bg-gray-50"
            style={{ borderColor: colors.borderGray }}
          />
        </View>

        <TouchableOpacity
          onPress={handleRunAnalysis}
          disabled={loading || !image}
          className="py-3.5 rounded-xl items-center justify-center shadow-xs mb-6"
          style={{ backgroundColor: colors.primary }}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text className="text-sm font-bold text-white">Run Fertilizer Analysis</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View className="p-4 rounded-2xl bg-white border space-y-3" style={{ borderColor: colors.borderGray }}>
            <Text className="text-sm font-bold uppercase" style={{ color: colors.primary }}>
              Growth Stage: {result.growth_stage}
            </Text>
            <View className="flex-row justify-around py-2">
              <View className="items-center"><Text className="text-xs text-gray-500">N</Text><Text className="text-base font-bold text-emerald-600">{result.npk_reading?.nitrogen ?? 0}</Text></View>
              <View className="items-center"><Text className="text-xs text-gray-500">P</Text><Text className="text-base font-bold text-amber-600">{result.npk_reading?.phosphorous ?? 0}</Text></View>
              <View className="items-center"><Text className="text-xs text-gray-500">K</Text><Text className="text-base font-bold text-rose-600">{result.npk_reading?.potassium ?? 0}</Text></View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}