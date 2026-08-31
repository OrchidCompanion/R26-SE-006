import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../constants/colors";

export default function PlantCard({ plant, onPress }) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push({ pathname: "/plant-details", params: { id: plant.id } });
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      className="px-3.5 py-2.5 rounded-xl mb-2 border flex-row items-center justify-between shadow-xs"
      style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
    >
      <View className="flex-1">
        <Text
          className="text-sm font-semibold uppercase mb-0.5"
          style={{ color: colors.primary }}
        >
          {plant.species}
        </Text>
        <Text className="text-xl font-bold mb-0.5" style={{ color: colors.darkGray }}>
          {plant.name}
        </Text>
        <Text className="text-sm font-semibold" style={{ color: colors.mediumGray }}>
          {plant.location}
        </Text>
      </View>
      {/* Arrow Navigation */}
      <Text className="font-bold text-xl px-1" style={{ color: colors.mediumGray }}>
        ›
      </Text>
    </TouchableOpacity>
  );
}