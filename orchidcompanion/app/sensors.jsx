import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import {
  Cpu,
  Plus,
  RefreshCw,
  Trash2,
  Wifi,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MapPin,
  X,
  Radio,
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";

export default function SensorsScreen() {
  const { user, token } = useSelector((state) => state.auth);

  const [modules, setModules] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Status check states: { [moduleId]: { checking: bool, data: obj, error: str } }
  const [statuses, setStatuses] = useState({});

  // Add Sensor Module Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [modalError, setModalError] = useState("");
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newMacAddress, setNewMacAddress] = useState("");
  const [newLocationId, setNewLocationId] = useState("");

  const loadData = useCallback(async () => {
    if (!user?.user_id) return;
    setError("");

    try {
      const headers = getAuthHeaders(token);
      const [modRes, locRes] = await Promise.all([
        fetch(`${API_BASE_URL}/sensors/modules/user/${user.user_id}`, { headers }),
        fetch(`${API_BASE_URL}/locations/user/${user.user_id}`, { headers }),
      ]);

      if (modRes.ok) {
        const modData = await modRes.json();
        setModules(Array.isArray(modData) ? modData : []);
      } else {
        setError("Failed to fetch sensor modules.");
      }

      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(Array.isArray(locData) ? locData : []);
      }
    } catch (err) {
      console.error(err);
      setError("Error connecting to placement & sensor service.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.user_id, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCheckStatus = async (moduleId) => {
    setStatuses((prev) => ({
      ...prev,
      [moduleId]: { checking: true, data: null, error: "" },
    }));

    try {
      const headers = getAuthHeaders(token);
      const res = await fetch(`${API_BASE_URL}/sensors/modules/${moduleId}/status`, {
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        setStatuses((prev) => ({
          ...prev,
          [moduleId]: { checking: false, data, error: "" },
        }));
      } else {
        setStatuses((prev) => ({
          ...prev,
          [moduleId]: {
            checking: false,
            data: { online: false, dht11: false, bh1750: false },
            error: "Module did not respond.",
          },
        }));
      }
    } catch (err) {
      setStatuses((prev) => ({
        ...prev,
        [moduleId]: {
          checking: false,
          data: { online: false, dht11: false, bh1750: false },
          error: "Connection failed.",
        },
      }));
    }
  };

  const handleAddModule = async () => {
    if (!newMacAddress.trim()) {
      setModalError("Please enter the ESP32 MAC address / Module ID.");
      return;
    }

    setSavingModule(true);
    setModalError("");

    const cleanMac = newMacAddress.trim().toLowerCase().replace(/[:-]/g, "");

    try {
      const headers = getAuthHeaders(token);
      const res = await fetch(`${API_BASE_URL}/sensors/modules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          module_id: cleanMac,
          device_name: newDeviceName.trim() || "ESP32 Sensor Node",
          location_id: newLocationId || null,
          user_id: user.user_id,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewDeviceName("");
        setNewMacAddress("");
        setNewLocationId("");
        await loadData();
        Alert.alert("Success", `Sensor node "${cleanMac}" paired successfully.`);
      } else {
        const errData = await res.json().catch(() => ({}));
        setModalError(errData.detail || "Failed to register sensor module.");
      }
    } catch (err) {
      setModalError(err.message || "Error saving module to backend.");
    } finally {
      setSavingModule(false);
    }
  };

  const handleDeleteModule = (moduleId, deviceName) => {
    Alert.alert(
      "Unpair Sensor Node",
      `Are you sure you want to unpair "${deviceName || moduleId}"? Live telemetry for this node will stop.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpair",
          style: "destructive",
          onPress: async () => {
            try {
              const headers = getAuthHeaders(token);
              const res = await fetch(`${API_BASE_URL}/sensors/modules/${moduleId}`, {
                method: "DELETE",
                headers,
              });

              if (res.ok) {
                await loadData();
                Alert.alert("Unpaired", `Sensor module ${moduleId} has been removed.`);
              } else {
                Alert.alert("Error", "Failed to unpair sensor module.");
              }
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Error deleting sensor module.");
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Hardware Sensors" />

      <ScrollView
        className="flex-1 p-5"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Banner Header */}
        <View className="mb-4 flex-row justify-between items-start">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center gap-2">
              <Cpu size={22} color={colors.primary} />
              <Text className="text-xl font-black" style={{ color: colors.darkGray }}>
                Sensor Nodes
              </Text>
            </View>
            <Text className="text-xs text-gray-500 mt-1">
              Active ESP32 IoT micro-controllers monitoring orchid climate and soil.
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              setModalError("");
              setShowAddModal(true);
            }}
            activeOpacity={0.8}
            className="flex-row items-center px-3.5 py-2.5 rounded-2xl shadow-xs"
            style={{ backgroundColor: colors.primary }}
          >
            <Plus size={16} color={colors.white} />
            <Text className="text-xs font-bold text-white ml-1">Pair Node</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <View
            className="p-3.5 mb-4 rounded-2xl flex-row items-center border"
            style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
          >
            <AlertCircle size={18} color={colors.danger} className="mr-2 shrink-0" />
            <Text className="text-xs font-bold flex-1" style={{ color: colors.danger }}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Loading State */}
        {loading ? (
          <View className="py-16 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-xs text-gray-400 mt-3 font-medium">
              Loading paired hardware nodes...
            </Text>
          </View>
        ) : modules.length === 0 ? (
          /* Zero State */
          <View
            className="p-8 border-2 border-dashed rounded-3xl items-center text-center bg-white shadow-xs"
            style={{ borderColor: colors.borderGray }}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: colors.primaryLight }}
            >
              <Wifi size={28} color={colors.primary} />
            </View>
            <Text className="font-extrabold text-base" style={{ color: colors.darkGray }}>
              No Sensor Nodes Paired Yet
            </Text>
            <Text className="text-xs text-gray-400 text-center mt-1 mb-4 leading-relaxed max-w-xs">
              Pair an ESP32 microcontroller node with its MAC address to stream real-time DHT11, BH1750, and NPK telemetry.
            </Text>
            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              className="px-5 py-3 rounded-2xl shadow-xs"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-xs font-bold text-white">Pair Your First Sensor Node</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Modules Grid */
          <View className="space-y-3.5 mb-8">
            {modules.map((m) => {
              const statusInfo = statuses[m.module_id];
              const isOnline = statusInfo?.data?.online;

              return (
                <View
                  key={m.module_id}
                  className="p-4 rounded-3xl bg-white border shadow-xs space-y-3"
                  style={{ borderColor: colors.borderGray }}
                >
                  {/* Top Row: Device Name, MAC, Unpair */}
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center gap-2">
                        <Radio size={16} color={colors.primary} />
                        <Text className="text-sm font-extrabold" style={{ color: colors.darkGray }}>
                          {m.device_name || "ESP32 Sensor Node"}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2 mt-1">
                        <Text className="text-[11px] font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          {m.module_id}
                        </Text>
                        <View className="flex-row items-center gap-1">
                          <MapPin size={11} color={colors.primary} />
                          <Text className="text-[11px] font-semibold text-emerald-800">
                            {m.location_name || "Unassigned"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleDeleteModule(m.module_id, m.device_name)}
                      className="p-2 rounded-xl"
                      style={{ backgroundColor: colors.dangerLight }}
                    >
                      <Trash2 size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>

                  {/* Hardware Diagnostics Status Card */}
                  <View
                    className="p-3 rounded-2xl border space-y-2"
                    style={{ backgroundColor: colors.lightGray, borderColor: colors.borderGray }}
                  >
                    <View className="flex-row justify-between items-center">
                      <Text className="text-[11px] font-bold text-gray-500">Hardware Status:</Text>
                      {statusInfo?.checking ? (
                        <View className="flex-row items-center gap-1.5">
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text className="text-[11px] font-bold text-gray-400">Pinging...</Text>
                        </View>
                      ) : statusInfo?.data ? (
                        <View className="flex-row items-center gap-1">
                          {isOnline ? (
                            <>
                              <CheckCircle2 size={13} color={colors.primary} />
                              <Text className="text-xs font-black text-emerald-700">Online</Text>
                            </>
                          ) : (
                            <>
                              <XCircle size={13} color={colors.danger} />
                              <Text className="text-xs font-black text-rose-600">Offline</Text>
                            </>
                          )}
                        </View>
                      ) : (
                        <Text className="text-[11px] text-gray-400 italic">Not pinged yet</Text>
                      )}
                    </View>

                    {statusInfo?.data && (
                      <View
                        className="pt-2 border-t flex-row justify-between text-[11px]"
                        style={{ borderColor: colors.borderGray }}
                      >
                        {m.device_name?.toLowerCase().includes("npk") || statusInfo.data.sensor_type === "npk" ? (
                          <View className="flex-row items-center justify-between w-full">
                            <Text className="text-[10px] text-gray-500">RS485 NPK Probe:</Text>
                            <Text
                              className="text-[10px] font-bold"
                              style={{ color: statusInfo.data.npk_probe ? colors.primary : colors.danger }}
                            >
                              {statusInfo.data.npk_probe ? "Operational" : "No Signal"}
                            </Text>
                          </View>
                        ) : (
                          <>
                            <View className="flex-row items-center gap-1">
                              <Text className="text-[10px] text-gray-500">DHT11 Temp/RH:</Text>
                              <Text
                                className="text-[10px] font-bold"
                                style={{ color: statusInfo.data.dht11 ? colors.primary : colors.danger }}
                              >
                                {statusInfo.data.dht11 ? "Operational" : "No Signal"}
                              </Text>
                            </View>

                            <View className="flex-row items-center gap-1">
                              <Text className="text-[10px] text-gray-500">BH1750 Lux:</Text>
                              <Text
                                className="text-[10px] font-bold"
                                style={{ color: statusInfo.data.bh1750 ? colors.primary : colors.danger }}
                              >
                                {statusInfo.data.bh1750 ? "Operational" : "No Signal"}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>
                    )}

                    {statusInfo?.error && (
                      <Text className="text-[10px] font-bold text-rose-600">
                        {statusInfo.error}
                      </Text>
                    )}
                  </View>

                  {/* Bottom Action: Ping Button */}
                  <View className="flex-row justify-between items-center pt-1">
                    <Text className="text-[10px] text-gray-400">
                      Paired: {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                    </Text>

                    <TouchableOpacity
                      onPress={() => handleCheckStatus(m.module_id)}
                      disabled={statusInfo?.checking}
                      className="flex-row items-center px-3 py-1.5 rounded-xl border"
                      style={{
                        backgroundColor: colors.primaryLight,
                        borderColor: colors.primary,
                        opacity: statusInfo?.checking ? 0.6 : 1,
                      }}
                    >
                      <RefreshCw size={12} color={colors.primary} className={statusInfo?.checking ? "animate-spin" : ""} />
                      <Text className="text-xs font-bold ml-1.5" style={{ color: colors.primary }}>
                        Ping Connection
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Sensor Node Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="w-full bg-white rounded-3xl p-5 shadow-2xl space-y-3.5 max-w-sm">
            <View className="flex-row justify-between items-center border-b pb-2" style={{ borderColor: colors.borderGray }}>
              <Text className="text-base font-extrabold" style={{ color: colors.darkGray }}>
                Pair Sensor Module
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-gray-500">
              Enter the hardware MAC address of the ESP32 node to connect live telemetry.
            </Text>

            {modalError ? (
              <View
                className="p-2.5 rounded-xl border flex-row items-center"
                style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
              >
                <AlertCircle size={14} color={colors.danger} className="mr-1.5 shrink-0" />
                <Text className="text-xs font-bold text-rose-700 flex-1">{modalError}</Text>
              </View>
            ) : null}

            {/* Device Name Input */}
            <View className="space-y-1">
              <Text className="text-xs font-bold text-gray-700">Device Name</Text>
              <TextInput
                placeholder="e.g. Greenhouse Ambient Node"
                value={newDeviceName}
                onChangeText={setNewDeviceName}
                className="px-3 py-2.5 border rounded-xl bg-gray-50 text-xs font-semibold"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
              />
            </View>

            {/* MAC Address Input */}
            <View className="space-y-1">
              <Text className="text-xs font-bold text-gray-700">
                ESP32 MAC Address (Module ID) *
              </Text>
              <TextInput
                placeholder="e.g. 2884858a2b4c or 441bf68cbc78"
                value={newMacAddress}
                onChangeText={setNewMacAddress}
                autoCapitalize="none"
                className="px-3 py-2.5 border rounded-xl bg-gray-50 text-xs font-mono font-bold"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
              />
            </View>

            {/* Location Zone Assignment */}
            {locations.length > 0 && (
              <View className="space-y-1">
                <Text className="text-xs font-bold text-gray-700">Assign to Zone (Optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-1.5 py-1">
                  <TouchableOpacity
                    onPress={() => setNewLocationId("")}
                    className="px-3 py-1.5 rounded-xl border"
                    style={{
                      backgroundColor: newLocationId === "" ? colors.primaryLight : colors.lightGray,
                      borderColor: newLocationId === "" ? colors.primary : colors.borderGray,
                    }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: newLocationId === "" ? colors.primary : colors.darkGray }}
                    >
                      Global / None
                    </Text>
                  </TouchableOpacity>
                  {locations.map((loc) => (
                    <TouchableOpacity
                      key={loc.location_id}
                      onPress={() => setNewLocationId(loc.location_id)}
                      className="px-3 py-1.5 rounded-xl border"
                      style={{
                        backgroundColor: newLocationId === loc.location_id ? colors.primaryLight : colors.lightGray,
                        borderColor: newLocationId === loc.location_id ? colors.primary : colors.borderGray,
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: newLocationId === loc.location_id ? colors.primary : colors.darkGray }}
                      >
                        {loc.location_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Modal Actions */}
            <View className="flex-row gap-2 pt-2">
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                className="flex-1 py-3 rounded-2xl border items-center justify-center bg-white"
                style={{ borderColor: colors.borderGray }}
              >
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAddModule}
                disabled={savingModule}
                className="flex-1 py-3 rounded-2xl items-center justify-center shadow-xs"
                style={{ backgroundColor: colors.primary }}
              >
                {savingModule ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text className="text-xs font-bold text-white">Pair Node</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
