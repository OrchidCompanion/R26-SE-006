import React from "react";
import { View, Text, TouchableOpacity, Image, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import {
  LogOut,
  Cpu,
  Flower2,
  ShieldCheck,
  ChevronRight,
  Info,
  Mail,
  UserCheck,
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { clearAuthData } from "../src/services/storage";
import { logout } from "../src/store/slices/authSlice";

export default function ProfileScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const handleLogout = async () => {
    await clearAuthData();
    dispatch(logout());
    router.replace("/login");
  };

  const fullName = user?.first_name
    ? `${user.first_name} ${user.last_name || ""}`.trim()
    : "Orchid Grower";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F7FAF8" }}>
      <Header title="Account & Preferences" />

      <ScrollView
        className="flex-1 px-5 pt-3"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card */}
        <View className="bg-white rounded-3xl p-6 border border-emerald-900/10 shadow-xs items-center mb-5">
          <View className="relative mb-3.5">
            <View className="w-24 h-24 rounded-full p-1 border-2 border-emerald-500 bg-emerald-50 items-center justify-center">
              <Image
                source={require("../assets/user.png")}
                className="w-full h-full rounded-full"
                resizeMode="cover"
              />
            </View>
            <View className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-emerald-600 border-2 border-white items-center justify-center">
              <ShieldCheck size={14} color="#FFFFFF" />
            </View>
          </View>

          <Text className="text-xl font-black text-gray-900 text-center tracking-tight">
            {fullName}
          </Text>

          <View className="flex-row items-center gap-1.5 mt-1">
            <Mail size={13} color="#6B7280" />
            <Text className="text-xs font-medium text-gray-500">{user?.email || "grower@orchidcompanion.local"}</Text>
          </View>

          <View className="flex-row items-center gap-2 mt-4">
            <View className="flex-row items-center gap-1 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
              <UserCheck size={12} color="#059669" />
              <Text className="text-[11px] font-bold text-emerald-800">Verified Caretaker</Text>
            </View>
            {user?.user_id && (
              <View className="bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                <Text className="text-[11px] font-bold text-gray-600">ID: #{user.user_id}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick Settings & Navigation Group */}
        <View className="mb-5">
          <Text className="text-[11px] font-extrabold uppercase tracking-widest text-gray-400 mb-2.5 px-1">
            App Management
          </Text>

          <View className="bg-white rounded-3xl border border-gray-100 shadow-2xs overflow-hidden">
            <TouchableOpacity
              onPress={() => router.push("/sensors")}
              activeOpacity={0.7}
              className="flex-row items-center justify-between p-4 border-b border-gray-100"
            >
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 items-center justify-center">
                  <Cpu size={20} color="#059669" />
                </View>
                <View>
                  <Text className="text-sm font-bold text-gray-800">Hardware Sensor Nodes</Text>
                  <Text className="text-[11px] text-gray-400">ESP32, DHT11 & BH1750 telemetry</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/all-plants")}
              activeOpacity={0.7}
              className="flex-row items-center justify-between p-4 border-b border-gray-100"
            >
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 items-center justify-center">
                  <Flower2 size={20} color="#0D9488" />
                </View>
                <View>
                  <Text className="text-sm font-bold text-gray-800">All Orchid Plants</Text>
                  <Text className="text-[11px] text-gray-400">Browse and search your collection</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-200 items-center justify-center">
                  <Info size={20} color="#6B7280" />
                </View>
                <View>
                  <Text className="text-sm font-bold text-gray-800">System Version</Text>
                  <Text className="text-[11px] text-gray-400">R26-SE-006 • v1.0.0 Stable</Text>
                </View>
              </View>
              <View className="bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                <Text className="text-[10px] font-bold text-emerald-700">Online</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Log Out Button */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.8}
          className="flex-row items-center justify-center py-4 rounded-2xl border border-red-200 bg-red-50/80 shadow-2xs"
        >
          <LogOut size={18} color="#DC2626" />
          <Text className="text-sm font-extrabold ml-2 text-red-600">Sign Out of Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}