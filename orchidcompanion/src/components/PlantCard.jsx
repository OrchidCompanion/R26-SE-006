import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Flower2, MapPin, ChevronRight } from "lucide-react-native";
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
      router.push({
        pathname: "/plant-details",
        params: {
          id: plantId,
          plant_name: plantName,
          plant_species: species,
          location_id: plant.location_id || "",
          location_name: locationDisplay,
        },
      });
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      className="p-3.5 rounded-2xl mb-2.5 bg-white border border-gray-100 shadow-xs flex-row items-center justify-between"
    >
      <View className="flex-row items-center flex-1 pr-2">
        {/* Orchid Floral Avatar */}
        <View className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100/70 items-center justify-center mr-3">
          <Text className="text-xl">🌸</Text>
        </View>

        {/* Plant Details */}
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5 mb-0.5">
            <View className="bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100/50">
              <Text className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                {species}
              </Text>
            </View>
          </View>
          <Text className="text-sm font-extrabold text-gray-900 tracking-tight" numberOfLines={1}>
            {plantName}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Text className="text-[11px] mr-1">📍</Text>
            <Text className="text-[11px] font-medium text-gray-500" numberOfLines={1}>
              {locationDisplay}
            </Text>
          </View>
        </View>
      </View>

      {/* Modern Circular Arrow Action */}
      <View className="w-7 h-7 rounded-full bg-gray-50 border border-gray-100 items-center justify-center">
        <ChevronRight size={14} color={colors.mediumGray} />
      </View>
    </TouchableOpacity>
  );
}