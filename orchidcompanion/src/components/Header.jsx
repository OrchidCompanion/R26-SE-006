import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { colors } from "../constants/colors";

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
    <View className="flex-row items-center justify-between px-5 pt-4 pb-3 bg-white border-b border-borderGray">
      <TouchableOpacity
        onPress={handleBack}
        className="flex-row items-center"
        activeOpacity={0.7}
      >
        <ArrowLeft size={22} color={colors.primary} />
        <Text className="text-primary font-bold text-base ml-1">Back</Text>
      </TouchableOpacity>

      <Text className="text-xl font-bold text-darkGray">{title}</Text>

      <View className="w-16" />
    </View>
  );
}