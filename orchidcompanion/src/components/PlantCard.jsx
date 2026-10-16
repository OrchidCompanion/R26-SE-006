import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../constants/colors";

export default function PlantCard({ plant, onPress }) {
  const router = useRouter();

  const plantId = plant.plant_id || plant.id;
  const plantName = plant.plant_name || plant.name || "Unnamed Orchid";
  const species = plant.plant_species || plant.species || "Orchid";
  const locationDisplay =
    plant.locations?.location_name ||
    plant.plant_location ||
    plant.location ||
    "Assigned Zone";

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push({ pathname: "/plant-details", params: { id: plantId } });
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
          className="text-xs font-bold uppercase mb-0.5"
          style={{ color: colors.primary }}
        >
          {species}
        </Text>
        <Text className="text-base font-extrabold mb-0.5" style={{ color: colors.darkGray }}>
          {plantName}
        </Text>
        <Text className="text-xs font-semibold" style={{ color: colors.mediumGray }}>
          {locationDisplay}
        </Text>
      </View>
      {/* Arrow Navigation */}
      <Text className="font-bold text-xl px-1" style={{ color: colors.mediumGray }}>
        ›
      </Text>
    </TouchableOpacity>
  );
}