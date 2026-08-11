import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import Header from "./components/Header";

const allSamplePlants = [
  { id: 1, name: "Plant A", species: "dendrobium", location: "Greenhouse Section A" },
  { id: 2, name: "Plant B", species: "dendrobium", location: "Outdoor Terrace Shelf 1" },
  { id: 3, name: "Plant C", species: "oncidium", location: "Indoor Window Sill" },
  { id: 4, name: "Plant D", species: "oncidium", location: "Greenhouse Section B" },
  { id: 5, name: "Plant E", species: "phalaenopsis", location: "Living Room Table" },
];

export default function AllPlantsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Navigation Bar */}
      <Header title="All Orchid Plants" />

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {allSamplePlants.map((item) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/plant-details", params: { id: item.id } })}
            className="bg-white px-3.5 py-2.5 rounded-xl mb-2 border border-gray-200 flex-row items-center justify-between shadow-xs"
          >
            <View className="flex-1">
              <Text className="text-sm font-semibold text-emerald-600 uppercase mb-0.5">
                {item.species}
              </Text>
              <Text className="text-xl font-bold text-gray-800 mb-0.5">
                {item.name}
              </Text>

              <Text className="text-sm font-semibold text-gray-500">
                {item.location}
              </Text>
            </View>

            {/* Arrow Navigation */}
            <Text className="text-gray-400 font-bold text-xl px-1">›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}