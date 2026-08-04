import { View, Text, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MenuButton from "./components/MenuButton";

// Sample Data
const samplePlants = [
  { id: "1", location: "Balcony - North", plantType: "Dendrobium Orchid" },
  { id: "2", location: "Living Room Window", plantType: "Phalaenopsis Orchid" },
  { id: "3", location: "Garden Greenhouse", plantType: "Cattleya Orchid" },
  { id: "4", location: "Patio Shelf", plantType: "Vanda Orchid" },
  { id: "5", location: "Indoor Plant Stand", plantType: "Oncidium Orchid" },
  { id: "6", location: "Shaded Veranda", plantType: "Cymbidium Orchid" },
];

export default function HomeScreen() {
  const screenHeight = Dimensions.get("window").height;
  const listMaxHeight = screenHeight * 0.45;

  const handleAction = (actionName) => {
    console.log(`Action triggered: ${actionName}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="p-5">

          {/* Top Greeting */}
          <View className="mb-4">
            <Text className="text-2xl font-bold text-gray-800">
              Welcome, Dinuka!
            </Text>
          </View>

          {/* Plant List Section */}
          <View
            style={{ maxHeight: listMaxHeight }}
            className="mb-6"
          >
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
              {samplePlants.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  className="flex-row justify-between items-center bg-white p-3.5 rounded-xl mb-2.5 border border-gray-100"
                >
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-green-600 uppercase">
                      {item.plantType}
                    </Text>
                    <Text className="text-base font-semibold text-gray-800 mt-0.5  tracking-wider">
                      {item.location}
                    </Text>
                  </View>
                  <Text className="text-gray-400 font-bold text-xl px-2">›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Action Buttons */}
          <View className="flex-row flex-wrap justify-between">
            <MenuButton
              title="Add Plant"
              icon={require("../assets/icon.png")}
              onPress={() => handleAction("Add Plant")}
            />
            <MenuButton
              title="Identify Disease"
              icon={require("../assets/icon.png")}
              onPress={() => handleAction("Identify Disease")}
            />
            <MenuButton
              title="Sensor Data"
              icon={require("../assets/icon.png")}
              onPress={() => handleAction("Sensor Data")}
            />
            <MenuButton
              title="Watering Schedule"
              icon={require("../assets/icon.png")}
              onPress={() => handleAction("Watering Schedule")}
            />
            <MenuButton
              title="Care Guide"
              icon={require("../assets/icon.png")}
              onPress={() => handleAction("Care Guide")}
            />
            <MenuButton
              title="Settings"
              icon={require("../assets/icon.png")}
              onPress={() => handleAction("Settings")}
            />
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}