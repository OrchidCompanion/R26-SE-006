import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const samplePlants = [
  { id: 1, name: "Plant A", species: "dendrobium", location: "Greenhouse Section A" },
  { id: 2, name: "Plant B", species: "dendrobium", location: "Outdoor Terrace Shelf 1" },
  { id: 3, name: "Plant C", species: "oncidium", location: "Indoor Window Sill" },
  { id: 4, name: "Plant D", species: "oncidium", location: "Greenhouse Section B" },
];

const actionButtons = [
  { id: "add", title: "Add Plant", icon: require("../assets/home-icons/plant.png") },
  { id: "identify", title: "Identify Species", icon: require("../assets/home-icons/magnifying-glass.png") },
  { id: "location", title: "Analyze Location", icon: require("../assets/home-icons/climate.png") },
  { id: "fertilizer", title: "Fertilizer Analyze", icon: require("../assets/home-icons/fertilizer.png") },
  { id: "disease", title: "Identify Disease", icon: require("../assets/home-icons/syringe.png") },
  { id: "bloom", title: "Predict Bloom", icon: require("../assets/home-icons/orchid.png") },
];

export default function HomeScreen() {
  const router = useRouter();

  const handleAction = (title) => {
    console.log(`Action triggered: ${title}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="px-5 py-3">
          {/* Welcome */}
          <View className="mb-2 mx-1">
            <Text className="text-lg font-bold text-gray-800">
              Welcome
            </Text>
            <Text className="text-2xl font-bold text-gray-800">
              Dinuka Rathnayake
            </Text>
          </View>

          {/* Recently Added Plants Section */}
          <View className="mb-3 bg-gray-100/70 p-3 rounded-2xl border border-gray-200">
            <Text className="text-lg font-bold text-gray-800 mb-2 px-1">
              Recently Added Plants
            </Text>

            {/* Plant List */}
            {samplePlants.slice(0, 3).map((item) => (
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
          </View>

          {/* View All */}
          <TouchableOpacity
            onPress={() => router.push("/all-plants")}
            className="align-self-end items-end mb-6 mr-2"
          >
            <Text className="text-lg font-bold text-emerald-600">
              View All Plants
            </Text>
          </TouchableOpacity>

          {/* Action Buttons */}
          <View className="flex-row flex-wrap justify-between">
            {actionButtons.map((btn) => (
              <TouchableOpacity
                key={btn.id}
                onPress={() => handleAction(btn.title)}
                className="w-[48%] bg-white p-3.5 rounded-2xl mb-2 border border-gray-200 items-center justify-center shadow-xs active:bg-gray-50"
              >
                <Image source={btn.icon} className="w-14 h-14 mb-2" resizeMode="contain" />
                <Text className="text-base font-semibold text-gray-800 text-center">
                  {btn.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}