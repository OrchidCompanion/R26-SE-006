import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { colors } from "../constants/colors";

export default function Header({ title, onBack, rightElement }) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View className="flex-row items-center justify-between px-5 pt-3 pb-3 bg-white border-b border-gray-100 shadow-xs">
      <TouchableOpacity
        onPress={handleBack}
        className="flex-row items-center justify-center w-10 h-10 rounded-full bg-emerald-50/80 border border-emerald-100/80"
        activeOpacity={0.7}
      >
        <ArrowLeft size={18} color={colors.primary} />
      </TouchableOpacity>

      <View className="flex-1 px-3 items-center">
        <Text className="text-lg font-extrabold text-gray-900 tracking-tight" numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View className="w-10 items-end justify-center">
        {rightElement || null}
      </View>
    </View>
  );
}