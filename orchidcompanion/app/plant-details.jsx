import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshCw, Edit, Trash2, ChevronDown, X, Check } from "lucide-react-native";
import Header from "./components/Header";
import { colors } from "./constants/colors";

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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      {/* Navigation Bar */}
      <Header title="Plant Details" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Top Info Card */}
        <View
          className="p-5 rounded-2xl border mb-4 shadow-xs"
          style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
        >
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-2xl font-extrabold" style={{ color: colors.darkGray }}>
              {plant.name}
            </Text>
            <Text
              className="text-xs font-bold px-2.5 py-1 rounded-full uppercase border"
              style={{
                color: colors.primary,
                backgroundColor: colors.primaryLight,
                borderColor: colors.primaryLight,
              }}
            >
              {plant.species}
            </Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-sm font-medium" style={{ color: colors.mediumGray }}>
              <Text className="font-semibold" style={{ color: colors.darkGray }}>{plant.location}</Text>
            </Text>
            <Text className="text-sm font-bold" style={{ color: colors.mediumGray }}>ID: {plant.id}</Text>
          </View>
        </View>

        {/* Location Sensors */}
        <View
          className="p-4 rounded-2xl border mb-4 shadow-xs"
          style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
        >
          <View
            className="flex-row justify-between items-center pb-2 mb-3 border-b"
            style={{ borderColor: colors.borderGray }}
          >
            <Text className="text-base font-bold" style={{ color: colors.darkGray }}>
              Location Sensors
            </Text>
            <TouchableOpacity onPress={handleRefreshLocation} className="p-2 rounded-full" style={{ backgroundColor: colors.primary }}>
              <RefreshCw size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
          <View className="space-y-1.5 mb-3">
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm" style={{ color: colors.mediumGray }}>Temperature :</Text>
              <Text className="text-sm font-bold" style={{ color: colors.darkGray }}>31.2 °C</Text>
            </View>
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm" style={{ color: colors.mediumGray }}>Humidity :</Text>
              <Text className="text-sm font-bold" style={{ color: colors.darkGray }}>60 %</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm" style={{ color: colors.mediumGray }}>Light :</Text>
              <Text className="text-sm font-bold" style={{ color: colors.darkGray }}>100 Lux</Text>
            </View>
          </View>
          <Text
            className="text-xs text-right pt-2 border-t"
            style={{ color: colors.mediumGray, borderColor: colors.borderGray }}
          >
            Last Update : 2026-08-09 10:20 AM
          </Text>
        </View>

        {/* Fertilizer Reading */}
        <View
          className="p-4 rounded-2xl border mb-4 shadow-xs"
          style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
        >
          <View
            className="flex-row justify-between items-center pb-2 mb-3 border-b"
            style={{ borderColor: colors.borderGray }}
          >
            <Text className="text-base font-bold" style={{ color: colors.darkGray }}>
              Last Fertilizer Reading
            </Text>
          </View>
          <View className="flex-row justify-around mb-2">
            <View className="items-center rounded-xl my-2 py-2 flex-1" style={{ backgroundColor: colors.primaryLight }}>
              <Text className="text-base font-bold" style={{ color: colors.mediumGray }}>N</Text>
              <Text className="text-lg font-bold" style={{ color: colors.primary }}>10</Text>
            </View>
            <View className="items-center rounded-xl my-2 py-2 flex-1 mx-4" style={{ backgroundColor: colors.primaryLight }}>
              <Text className="text-base font-bold" style={{ color: colors.mediumGray }}>P</Text>
              <Text className="text-lg font-bold" style={{ color: colors.primary }}>20</Text>
            </View>
            <View className="items-center rounded-xl my-2 py-2 flex-1" style={{ backgroundColor: colors.primaryLight }}>
              <Text className="text-base font-bold" style={{ color: colors.mediumGray }}>K</Text>
              <Text className="text-lg font-bold" style={{ color: colors.primary }}>18</Text>
            </View>
          </View>
          <Text
            className="text-xs text-right pt-2 border-t"
            style={{ color: colors.mediumGray, borderColor: colors.borderGray }}
          >
            Last Update : 2026-08-08 01:20 PM
          </Text>
        </View>

        {/* Predicted Blooming */}
        <View
          className="p-4 rounded-2xl border mb-4 shadow-xs"
          style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
        >
          <View
            className="flex-row justify-between items-center pb-2 mb-2 border-b"
            style={{ borderColor: colors.borderGray }}
          >
            <Text className="text-base font-bold" style={{ color: colors.darkGray }}>
              Predicted Blooming
            </Text>
            <TouchableOpacity onPress={handleRefreshBloom} className="p-2 rounded-full" style={{ backgroundColor: colors.primary }}>
              <RefreshCw size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
          <View className="py-2 items-center">
            <Text className="text-base font-semibold mb-2" style={{ color: colors.primary }}>
              within <Text className="text-xl font-extrabold" style={{ color: colors.primary }}>20 weeks</Text>
            </Text>
          </View>
          <Text
            className="text-xs text-right pt-2 border-t"
            style={{ color: colors.mediumGray, borderColor: colors.borderGray }}
          >
            Last Update : 2026-08-09 10:20 AM
          </Text>
        </View>

        {/* Disease History */}
        <View
          className="p-4 rounded-2xl border mb-4 shadow-xs"
          style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
        >
          <Text
            className="text-base font-bold mb-2 pb-2 border-b"
            style={{ color: colors.darkGray, borderColor: colors.borderGray }}
          >
            Disease History
          </Text>
          <Text className="text-sm font-medium italic text-center py-2" style={{ color: colors.mediumGray }}>
            Not Data Available
          </Text>
        </View>

        {/* Fertilizer Requirement */}
        <View
          className="p-4 rounded-2xl border mb-6 shadow-xs"
          style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
        >
          <Text
            className="text-base font-bold mb-2 pb-2 border-b"
            style={{ color: colors.darkGray, borderColor: colors.borderGray }}
          >
            Fertilizer Requirement
          </Text>
          <Text className="text-sm font-medium italic text-center py-2" style={{ color: colors.mediumGray }}>
            No Data Available
          </Text>
        </View>

        {/* Action Buttons */}
        <View className="flex-row justify-between mb-8">
          <TouchableOpacity
            onPress={openUpdateModal}
            className="w-[48%] py-3.5 rounded-xl flex-row items-center justify-center shadow-xs"
            style={{ backgroundColor: colors.primary }}
          >
            <Edit size={18} color={colors.white} />
            <Text className="font-bold ml-2" style={{ color: colors.white }}>Update</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRemovePlant}
            className="w-[48%] py-3.5 rounded-xl border flex-row items-center justify-center shadow-xs"
            style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
          >
            <Trash2 size={18} color={colors.danger} />
            <Text className="font-bold ml-2" style={{ color: colors.danger }}>Remove</Text>
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
        <View className="flex-1 justify-center items-center px-5" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            className="w-full rounded-3xl p-6 shadow-xl border"
            style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
          >
            <View
              className="flex-row justify-between items-center mb-4 pb-2 border-b"
              style={{ borderColor: colors.borderGray }}
            >
              <Text className="text-xl font-bold" style={{ color: colors.darkGray }}>Update Plant</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <X size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            {/* Plant Name Input */}
            <View className="mb-4">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>
                Plant Name
              </Text>
              <TextInput
                className="rounded-xl px-4 py-3 text-base border"
                style={{ backgroundColor: colors.lightGray, borderColor: colors.borderGray, color: colors.darkGray }}
                value={formName}
                onChangeText={setFormName}
                placeholder="Enter plant name"
              />
            </View>

            {/* Location Input */}
            <View className="mb-4">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>
                Location
              </Text>
              <TextInput
                className="rounded-xl px-4 py-3 text-base border"
                style={{ backgroundColor: colors.lightGray, borderColor: colors.borderGray, color: colors.darkGray }}
                value={formLocation}
                onChangeText={setFormLocation}
                placeholder="e.g. Near Gate"
              />
            </View>

            {/* Species Dropdown Selector */}
            <View className="mb-6">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>
                Species
              </Text>
              <TouchableOpacity
                onPress={() => setShowSpeciesDropdown(!showSpeciesDropdown)}
                className="rounded-xl px-4 py-3 flex-row justify-between items-center border"
                style={{ backgroundColor: colors.lightGray, borderColor: colors.borderGray }}
              >
                <Text className="text-base capitalize font-medium" style={{ color: colors.darkGray }}>
                  {formSpecies}
                </Text>
                <ChevronDown size={18} color={colors.mediumGray} />
              </TouchableOpacity>
              {showSpeciesDropdown && (
                <View
                  className="rounded-xl mt-1 overflow-hidden shadow-sm border"
                  style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
                >
                  {SPECIES_OPTIONS.map((spec) => (
                    <TouchableOpacity
                      key={spec}
                      onPress={() => {
                        setFormSpecies(spec);
                        setShowSpeciesDropdown(false);
                      }}
                      className="px-4 py-3 border-b flex-row justify-between items-center"
                      style={{ borderColor: colors.borderGray }}
                    >
                      <Text className="capitalize font-medium" style={{ color: colors.darkGray }}>
                        {spec}
                      </Text>
                      {formSpecies === spec && <Check size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}              
            </View>

            {/* Modal Actions */}
            <View className="flex-row justify-end space-x-3 gap-3">
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
                className="px-5 py-3 rounded-xl"
                style={{ backgroundColor: colors.lightGray }}
              >
                <Text className="font-bold" style={{ color: colors.mediumGray }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveUpdate}
                className="px-6 py-3 rounded-xl"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="font-bold" style={{ color: colors.white }}>Save</Text>
              </TouchableOpacity>
            </View>
            
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}