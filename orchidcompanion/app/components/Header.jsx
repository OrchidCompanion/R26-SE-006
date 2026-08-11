import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

export default function Header({ title, onBack }) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View className="flex-row items-center justify-between px-5 pt-4 pb-3 bg-white border-b border-gray-200">
      <TouchableOpacity
        onPress={handleBack}
        className="flex-row items-center"
        activeOpacity={0.7}
      >
        <ArrowLeft size={22} color="#059669" />
        <Text className="text-emerald-600 font-bold text-base ml-1">Back</Text>
      </TouchableOpacity>

      <Text className="text-xl font-bold text-gray-800">{title}</Text>

      <View className="w-16" />
    </View>
  );
}