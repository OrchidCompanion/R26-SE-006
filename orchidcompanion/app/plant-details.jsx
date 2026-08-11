import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, RefreshCw, Edit, Trash2, ChevronDown, X, Check } from "lucide-react-native";

import Header from "./components/Header";

// Sample Database
const plantsDatabase = [
  { id: "1", name: "Plant A", species: "dendrobium", location: "Greenhouse Section A" },
  { id: "2", name: "Plant B", species: "dendrobium", location: "Outdoor Terrace Shelf 1" },
  { id: "3", name: "Plant C", species: "oncidium", location: "Indoor Window Sill" },
  { id: "4", name: "Plant D", species: "oncidium", location: "Greenhouse Section B" },
  { id: "5", name: "Plant E", species: "phalaenopsis", location: "Living Room Table" },
];

const SPECIES_OPTIONS = ["oncidium", "phalaenopsis", "dendrobium"];

export default function PlantDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const existingPlant = plantsDatabase.find((item) => String(item.id) === String(id));

  const [plant, setPlant] = useState({
    id: id || "1",
    name: existingPlant ? existingPlant.name : "Plant A",
    species: existingPlant ? existingPlant.species : "dendrobium",
    location: existingPlant ? existingPlant.location : "Greenhouse Section A",
  });

  // Modal States
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [formName, setFormName] = useState(plant.name);
  const [formLocation, setFormLocation] = useState(plant.location);
  const [formSpecies, setFormSpecies] = useState(plant.species);
  const [showSpeciesDropdown, setShowSpeciesDropdown] = useState(false);

  // Refresh Actions
  const handleRefreshLocation = () => {
    router.push("/analyze-location");
  };

  const handleRefreshBloom = () => {
    Alert.alert("Predict Bloom", "Refreshing bloom predictions...");
  };

  // Update Modal
  const openUpdateModal = () => {
    setFormName(plant.name);
    setFormLocation(plant.location);
    setFormSpecies(plant.species);
    setIsModalVisible(true);
  };

  // Save Modal
  const handleSaveUpdate = () => {
    Alert.alert(
      "Confirm Update",
      "Are you sure you want to update this plant's details?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: () => {
            setPlant({
              ...plant,
              name: formName,
              location: formLocation,
              species: formSpecies,
            });
            setIsModalVisible(false);
          },
        },
      ]
    );
  };

  // Remove Plant
  const handleRemovePlant = () => {
    Alert.alert(
      "Remove Plant",
      `Are you sure you want to remove "${plant.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            router.back();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Navigation Bar */}
      <Header title="Plant Details" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Top Info Card */}
        <View className="bg-white p-5 rounded-2xl border border-gray-200 mb-4 shadow-xs">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-2xl font-extrabold text-gray-800">
              {plant.name}
            </Text>
            <Text className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase border border-emerald-100">
              {plant.species}
            </Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-sm font-medium text-gray-500">
              <Text className="text-gray-800 font-semibold">{plant.location}</Text>
            </Text>
            <Text className="text-sm font-bold text-gray-400">ID: {plant.id}</Text>
          </View>

        </View>

        {/* Location Sensors */}
        <View className="bg-white p-4 rounded-2xl border border-gray-200 mb-4 shadow-xs">
          <View className="flex-row justify-between items-center pb-2 mb-3 border-b border-gray-100">
            <Text className="text-base font-bold text-gray-800">
              Location Sensors
            </Text>
            <TouchableOpacity onPress={handleRefreshLocation} className="p-2 bg-emerald-600 rounded-full">
              <RefreshCw size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View className="space-y-1.5 mb-3">
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm text-gray-500">Temperature :</Text>
              <Text className="text-sm font-bold text-gray-800">31.2 °C</Text>
            </View>
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm text-gray-500">Humidity :</Text>
              <Text className="text-sm font-bold text-gray-800">60 %</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-500">Light :</Text>
              <Text className="text-sm font-bold text-gray-800">100 Lux</Text>
            </View>
          </View>

          <Text className="text-xs text-gray-500 text-right pt-2 border-t border-gray-100">
            Last Update : 2026-08-09 10:20 AM
          </Text>
        </View>

        {/* Fertilizer Reading */}
        <View className="bg-white p-4 rounded-2xl border border-gray-200 mb-4 shadow-xs">
          <View className="flex-row justify-between items-center pb-2 mb-3 border-b border-gray-100">
            <Text className="text-base font-bold text-gray-800">
              Last Fertilizer Reading
            </Text>
          </View>

          <View className="flex-row justify-around mb-2">
            <View className="items-center bg-emerald-50/50 rounded-xl my-2 py-2 flex-1">
              <Text className="text-base font-bold text-gray-500">N</Text>
              <Text className="text-lg font-bold text-emerald-700">10</Text>
            </View>
            <View className="items-center bg-emerald-50/50 rounded-xl my-2 py-2 flex-1 mx-4">
              <Text className="text-base font-bold text-gray-500">P</Text>
              <Text className="text-lg font-bold text-emerald-700">20</Text>
            </View>
            <View className="items-center bg-emerald-50/50 rounded-xl my-2 py-2 flex-1">
              <Text className="text-base font-bold text-gray-500">K</Text>
              <Text className="text-lg font-bold text-emerald-700">18</Text>
            </View>
          </View>

          <Text className="text-xs text-gray-500 text-right pt-2 border-t border-gray-100">
            Last Update : 2026-08-08 01:20 PM
          </Text>
        </View>

        {/* Predicted Blooming */}
        <View className="bg-white p-4 rounded-2xl border border-gray-200 mb-4 shadow-xs">
          <View className="flex-row justify-between items-center pb-2 mb-2 border-b border-gray-100">
            <Text className="text-base font-bold text-gray-800">
              Predicted Blooming
            </Text>
            <TouchableOpacity onPress={handleRefreshBloom} className="p-2 bg-emerald-600 rounded-full">
              <RefreshCw size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View className="py-2 items-center">
            <Text className="text-base font-semibold text-emerald-800 mb-2">
              within <Text className="text-xl font-extrabold text-emerald-600">20 weeks</Text>
            </Text>
          </View>

          <Text className="text-xs text-gray-500 text-right pt-2 border-t border-gray-100">
            Last Update : 2026-08-09 10:20 AM
          </Text>
        </View>

        {/* Disease History */}
        <View className="bg-white p-4 rounded-2xl border border-gray-200 mb-4 shadow-xs">
          <Text className="text-base font-bold text-gray-800 mb-2 pb-2 border-b border-gray-100">
            Disease History
          </Text>
          <Text className="text-sm font-medium text-gray-400 italic text-center py-2">
            Not Data Available
          </Text>
        </View>

        {/* Fertilizer Requirement */}
        <View className="bg-white p-4 rounded-2xl border border-gray-200 mb-6 shadow-xs">
          <Text className="text-base font-bold text-gray-800 mb-2 pb-2 border-b border-gray-100">
            Fertilizer Requirement
          </Text>
          <Text className="text-sm font-medium text-gray-400 italic text-center py-2">
            No Data Available
          </Text>
        </View>

        {/* Action Buttons */}
        <View className="flex-row justify-between mb-8">
          <TouchableOpacity
            onPress={openUpdateModal}
            className="w-[48%] bg-emerald-600 py-3.5 rounded-xl flex-row items-center justify-center shadow-xs active:bg-emerald-700"
          >
            <Edit size={18} color="#ffffff" />
            <Text className="text-white font-bold ml-2">Update</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRemovePlant}
            className="w-[48%] bg-red-50 border border-red-200 py-3.5 rounded-xl flex-row items-center justify-center shadow-xs active:bg-red-100"
          >
            <Trash2 size={18} color="#dc2626" />
            <Text className="text-red-600 font-bold ml-2">Remove</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* UPDATE MODAL */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-5">
          <View className="bg-white w-full rounded-3xl p-6 shadow-xl border border-gray-100">
            <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-gray-100">
              <Text className="text-xl font-bold text-gray-800">Update Plant</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Plant Name Input */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-gray-600 uppercase mb-1">
                Plant Name
              </Text>
              <TextInput
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-base"
                value={formName}
                onChangeText={setFormName}
                placeholder="Enter plant name"
              />
            </View>

            {/* Location Input */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-gray-600 uppercase mb-1">
                Location
              </Text>
              <TextInput
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-base"
                value={formLocation}
                onChangeText={setFormLocation}
                placeholder="e.g. Near Gate"
              />
            </View>

            {/* Species Dropdown Selector */}
            <View className="mb-6">
              <Text className="text-xs font-bold text-gray-600 uppercase mb-1">
                Species
              </Text>
              <TouchableOpacity
                onPress={() => setShowSpeciesDropdown(!showSpeciesDropdown)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex-row justify-between items-center"
              >
                <Text className="text-gray-800 text-base capitalize font-medium">
                  {formSpecies}
                </Text>
                <ChevronDown size={18} color="#6b7280" />
              </TouchableOpacity>

              {showSpeciesDropdown && (
                <View className="bg-white border border-gray-200 rounded-xl mt-1 overflow-hidden shadow-sm">
                  {SPECIES_OPTIONS.map((spec) => (
                    <TouchableOpacity
                      key={spec}
                      onPress={() => {
                        setFormSpecies(spec);
                        setShowSpeciesDropdown(false);
                      }}
                      className="px-4 py-3 border-b border-gray-100 flex-row justify-between items-center active:bg-gray-50"
                    >
                      <Text className="text-gray-800 capitalize font-medium">
                        {spec}
                      </Text>
                      {formSpecies === spec && <Check size={16} color="#059669" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Modal Actions */}
            <View className="flex-row justify-end space-x-3 gap-3">
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
                className="px-5 py-3 rounded-xl bg-gray-100"
              >
                <Text className="text-gray-600 font-bold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveUpdate}
                className="px-6 py-3 rounded-xl bg-emerald-600"
              >
                <Text className="text-white font-bold">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}