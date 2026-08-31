import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSelector } from "react-redux";
import { User, X, Plus } from "lucide-react-native";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";
import PlantCard from "../src/components/PlantCard";

const actionButtons = [
  { id: "add", title: "Add Plant", icon: require("../assets/home-icons/plant.png") },
  { id: "identify", title: "Identify Species", route: "/identify-species", icon: require("../assets/home-icons/magnifying-glass.png") },
  { id: "location", title: "Analyze Location", route: "/analyse-location", icon: require("../assets/home-icons/climate.png") },
  { id: "fertilizer", title: "Fertilizer Analyze", route: "/analyse-fertilizer", icon: require("../assets/home-icons/fertilizer.png") },
  { id: "disease", title: "Identify Disease", route: "/analyse-disease", icon: require("../assets/home-icons/syringe.png") },
  { id: "bloom", title: "Predict Bloom", route: "/predict-blooming", icon: require("../assets/home-icons/orchid.png") },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user, token } = useSelector((state) => state.auth);

  const [plants, setPlants] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Plant Modal State
  const [showAddPlantModal, setShowAddPlantModal] = useState(false);
  const [plantName, setPlantName] = useState("");
  const [plantSpecies, setPlantSpecies] = useState("Dendrobium");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [savingPlant, setSavingPlant] = useState(false);

  useEffect(() => {
    if (user?.user_id) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [plantsRes, locsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/plants/user/${user.user_id}`, {
          headers: getAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/locations/user/${user.user_id}`, {
          headers: getAuthHeaders(token),
        }),
      ]);

      if (plantsRes.ok) setPlants(await plantsRes.json());
      if (locsRes.ok) setLocations(await locsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlant = async () => {
    if (!plantName.trim()) {
      Alert.alert("Error", "Please enter a plant name.");
      return;
    }

    setSavingPlant(true);
    try {
      const res = await fetch(`${API_BASE_URL}/plants`, {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          plant_name: plantName.trim(),
          plant_species: plantSpecies,
          location_id: targetLocationId || null,
          user_id: user.user_id,
        }),
      });

      if (res.ok) {
        setShowAddPlantModal(false);
        setPlantName("");
        setPlantSpecies("Dendrobium");
        setTargetLocationId("");
        loadDashboardData();
      } else {
        const data = await res.json();
        Alert.alert("Error", data.detail || "Failed to create plant.");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSavingPlant(false);
    }
  };

  const handleAction = (btn) => {
    if (btn.id === "add") {
      setShowAddPlantModal(true);
    } else if (btn.route) {
      router.push(btn.route);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="px-5 py-3">
          {/* Header */}
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-sm font-semibold uppercase tracking-wider" style={{ color: colors.mediumGray }}>
                Welcome
              </Text>
              <Text className="text-2xl font-extrabold" style={{ color: colors.darkGray }}>
                {user ? `${user.first_name} ${user.last_name}` : "Gardener"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/profile")}
              className="w-11 h-11 rounded-full border items-center justify-center bg-white shadow-xs"
              style={{ borderColor: colors.borderGray }}
            >
              <User size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Recently Added Plants */}
          <View
            className="mb-3 p-4 rounded-2xl border bg-white shadow-xs"
            style={{ borderColor: colors.borderGray }}
          >
            <Text className="text-base font-bold mb-3" style={{ color: colors.darkGray }}>
              Recently Added Plants
            </Text>

            {loading ? (
              <ActivityIndicator color={colors.primary} className="py-4" />
            ) : plants.length === 0 ? (
              <Text className="text-xs text-center py-3 italic" style={{ color: colors.mediumGray }}>
                No plants added yet. Tap "Add Plant" below to register one.
              </Text>
            ) : (
              plants.slice(0, 3).map((item) => (
                <PlantCard key={item.plant_id || item.id} plant={item} />
              ))
            )}
          </View>

          {/* View All */}
          <TouchableOpacity
            onPress={() => router.push("/all-plants")}
            className="align-self-end items-end mb-5 mr-1"
          >
            <Text className="text-sm font-bold" style={{ color: colors.primary }}>
              View All Plants →
            </Text>
          </TouchableOpacity>

          {/* Action Buttons Grid */}
          <View className="flex-row flex-wrap justify-between">
            {actionButtons.map((btn) => (
              <TouchableOpacity
                key={btn.id}
                onPress={() => handleAction(btn)}
                activeOpacity={0.8}
                className="w-[48%] p-3.5 rounded-2xl mb-3 border items-center justify-center bg-white shadow-xs"
                style={{ borderColor: colors.borderGray }}
              >
                <Image source={btn.icon} className="w-12 h-12 mb-2" resizeMode="contain" />
                <Text className="text-sm font-semibold text-center" style={{ color: colors.darkGray }}>
                  {btn.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ADD PLANT MODAL */}
      <Modal visible={showAddPlantModal} transparent animationType="fade">
        <View className="flex-1 justify-center items-center px-5" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View className="w-full bg-white rounded-3xl p-6 shadow-xl border" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row justify-between items-center pb-3 mb-4 border-b" style={{ borderColor: colors.borderGray }}>
              <Text className="text-lg font-bold" style={{ color: colors.darkGray }}>Add Orchid Plant</Text>
              <TouchableOpacity onPress={() => setShowAddPlantModal(false)}>
                <X size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>
                Plant Name / ID
              </Text>
              <TextInput
                className="rounded-xl px-3.5 py-2.5 text-sm border bg-gray-50"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
                placeholder="e.g., Dendrobium Nobile #1"
                value={plantName}
                onChangeText={setPlantName}
              />
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>
                Species
              </Text>
              <View className="flex-row gap-2">
                {["Dendrobium", "Phalaenopsis", "Oncidium"].map((spec) => (
                  <TouchableOpacity
                    key={spec}
                    onPress={() => setPlantSpecies(spec)}
                    className="flex-1 py-2 rounded-lg border items-center"
                    style={{
                      backgroundColor: plantSpecies === spec ? colors.primaryLight : colors.white,
                      borderColor: plantSpecies === spec ? colors.primary : colors.borderGray,
                    }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: plantSpecies === spec ? colors.primary : colors.mediumGray }}
                    >
                      {spec}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="mb-5">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>
                Assign Location
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 pt-1">
                <TouchableOpacity
                  onPress={() => setTargetLocationId("")}
                  className="px-3 py-1.5 rounded-lg border"
                  style={{
                    backgroundColor: !targetLocationId ? colors.primaryLight : colors.white,
                    borderColor: !targetLocationId ? colors.primary : colors.borderGray,
                  }}
                >
                  <Text className="text-xs font-semibold" style={{ color: !targetLocationId ? colors.primary : colors.mediumGray }}>
                    None
                  </Text>
                </TouchableOpacity>
                {locations.map((l) => (
                  <TouchableOpacity
                    key={l.location_id}
                    onPress={() => setTargetLocationId(l.location_id)}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{
                      backgroundColor: targetLocationId === l.location_id ? colors.primaryLight : colors.white,
                      borderColor: targetLocationId === l.location_id ? colors.primary : colors.borderGray,
                    }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: targetLocationId === l.location_id ? colors.primary : colors.mediumGray }}
                    >
                      {l.location_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View className="flex-row justify-end gap-2">
              <TouchableOpacity
                onPress={() => setShowAddPlantModal(false)}
                className="px-4 py-2.5 rounded-xl bg-gray-100"
              >
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreatePlant}
                disabled={savingPlant}
                className="px-5 py-2.5 rounded-xl"
                style={{ backgroundColor: colors.primary }}
              >
                {savingPlant ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text className="text-xs font-bold text-white">Save Plant</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}