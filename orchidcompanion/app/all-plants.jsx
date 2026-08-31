import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../src/constants/colors";

import Header from "../src/components/Header";
import PlantCard from "../src/components/PlantCard";

const allSamplePlants = [
  { id: 1, name: "Plant A", species: "dendrobium", location: "Greenhouse Section A" },
  { id: 2, name: "Plant B", species: "dendrobium", location: "Outdoor Terrace Shelf 1" },
  { id: 3, name: "Plant C", species: "oncidium", location: "Indoor Window Sill" },
  { id: 4, name: "Plant D", species: "oncidium", location: "Greenhouse Section B" },
  { id: 5, name: "Plant E", species: "phalaenopsis", location: "Living Room Table" },
];
export default function AllPlantsScreen() {

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      {/* Navigation Bar */}
      <Header title="All Orchid Plants" />

      <ScrollView className="flex-1 px-5 mt-4" showsVerticalScrollIndicator={false}>
        {allSamplePlants.map((item) => (
          <PlantCard key={item.id} plant={item} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}