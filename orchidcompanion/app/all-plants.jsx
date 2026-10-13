import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";
import Header from "../src/components/Header";
import PlantCard from "../src/components/PlantCard";

export default function AllPlantsScreen() {
  const { user, token } = useSelector((state) => state.auth);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="All Orchid Plants" />

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5 mt-4"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {plants.length === 0 ? (
            <View className="py-12 items-center">
              <Text className="text-sm font-semibold" style={{ color: colors.mediumGray }}>
                No orchid plants found in your catalog.
              </Text>
            </View>
          ) : (
            plants.map((item) => (
              <PlantCard key={item.plant_id || item.id} plant={item} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}