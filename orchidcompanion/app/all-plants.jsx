import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Search, X, Flower2, SlidersHorizontal, Sparkles } from "lucide-react-native";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";
import Header from "../src/components/Header";
import PlantCard from "../src/components/PlantCard";

const FILTER_SPECIES = ["All", "Phalaenopsis", "Dendrobium", "Oncidium"];

export default function AllPlantsScreen() {
  const { user, token } = useSelector((state) => state.auth);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All");

  const fetchPlants = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const headers = getAuthHeaders(token);
      const res = await fetch(`${API_BASE_URL}/plants/user/${user.user_id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPlants(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      console.error("Failed to load plants:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.user_id, token]);

  useEffect(() => {
    fetchPlants();
  }, [fetchPlants]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPlants();
  };

  const filteredPlants = useMemo(() => {
    return plants.filter((plant) => {
      const name = (plant.plant_name || plant.name || "").toLowerCase();
      const species = (plant.species || "").toLowerCase();
      const zone = (plant.location_name || plant.zone_name || "").toLowerCase();
      const query = searchQuery.trim().toLowerCase();

      const matchesQuery =
        !query ||
        name.includes(query) ||
        species.includes(query) ||
        zone.includes(query);

      const matchesFilter =
        selectedFilter === "All" ||
        species.toLowerCase().includes(selectedFilter.toLowerCase());

      return matchesQuery && matchesFilter;
    });
  }, [plants, searchQuery, selectedFilter]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F7FAF8" }}>
      <Header title="My Orchid Collection" />

      {/* Search and Filter Strip */}
      <View className="px-5 pt-2 pb-3 bg-white border-b border-gray-100 shadow-2xs">
        {/* Search Input Box */}
        <View className="flex-row items-center bg-[#F1F5F2] rounded-2xl px-3.5 py-2.5 border border-emerald-900/10">
          <Search size={18} color="#059669" className="mr-2" />
          <TextInput
            placeholder="Search by name, species or zone..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm font-medium text-gray-800 p-0"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} className="p-1">
              <X size={16} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Species Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row pt-3 space-x-2"
          contentContainerStyle={{ gap: 8 }}
        >
          {FILTER_SPECIES.map((species) => {
            const isSelected = selectedFilter === species;
            return (
              <TouchableOpacity
                key={species}
                onPress={() => setSelectedFilter(species)}
                activeOpacity={0.8}
                className={`px-3.5 py-1.5 rounded-full border ${
                  isSelected
                    ? "bg-emerald-600 border-emerald-600 shadow-2xs"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? "text-white" : "text-gray-600"
                  }`}
                >
                  {species}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Collection Stats Bar */}
      <View className="px-5 py-2.5 flex-row justify-between items-center bg-[#F7FAF8]">
        <View className="flex-row items-center gap-1.5">
          <Flower2 size={15} color="#059669" />
          <Text className="text-xs font-extrabold text-gray-700">
            {filteredPlants.length} of {plants.length} Orchids
          </Text>
        </View>
        {(searchQuery || selectedFilter !== "All") && (
          <TouchableOpacity
            onPress={() => {
              setSearchQuery("");
              setSelectedFilter("All");
            }}
          >
            <Text className="text-xs font-bold text-emerald-600">Reset Filters</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#059669" />
          <Text className="text-xs font-semibold text-gray-400 mt-2">Loading orchids...</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#059669"]} />
          }
        >
          {filteredPlants.length === 0 ? (
            <View className="py-16 items-center justify-center px-6">
              <View className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 items-center justify-center mb-3">
                <Flower2 size={28} color="#059669" />
              </View>
              <Text className="text-base font-extrabold text-gray-800 text-center">
                {plants.length === 0
                  ? "No Orchids Registered"
                  : "No Orchids Match Your Filter"}
              </Text>
              <Text className="text-xs text-gray-400 font-medium text-center mt-1 leading-relaxed max-w-xs">
                {plants.length === 0
                  ? "Register orchids under your zones from the home dashboard to monitor their health, soil, and microclimate."
                  : "Try clearing your search query or selecting a different species tag."}
              </Text>
            </View>
          ) : (
            filteredPlants.map((item) => (
              <PlantCard key={item.plant_id || item.id} plant={item} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}