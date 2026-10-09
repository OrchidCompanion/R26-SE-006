import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import {
  Radio,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Thermometer,
  Droplets,
  Sun,
  Layers,
} from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";

const THRESHOLDS = {
  tempMin: 25,
  tempMax: 30,
  humMin: 70,
  humMax: 75,
  luxMin: 16000,
  luxMax: 32000,
};

const ORCHID_SPECIES = ["Dendrobium", "Phalaenopsis", "Oncidium"];

export default function AnalyseLocationScreen() {
  const { user, token } = useSelector((state) => state.auth);

  // Module List & Selection
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedOrchid, setSelectedOrchid] = useState("Dendrobium");

  // Module Registration Modal
  const [showAddModuleModal, setShowAddModuleModal] = useState(false);
  const [newMacAddress, setNewMacAddress] = useState("");
  const [newDeviceName, setNewDeviceName] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  // Hardware Status Check
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [sensorStatus, setSensorStatus] = useState(null);

  // 60-Second Sampling
  const [analyzing, setAnalyzing] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [readings, setReadings] = useState([]);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.user_id) fetchUserModules();
  }, [user]);

  const fetchUserModules = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/sensors/modules/user/${user.user_id}`, {
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setModules(data);
        if (data.length > 0 && !selectedModuleId) {
          setSelectedModuleId(data[0].module_id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegisterModule = async () => {
    if (!newMacAddress.trim()) {
      Alert.alert("Error", "ESP32 MAC address is required.");
      return;
    }

    setModalSaving(true);
    try {
      const cleanedMac = newMacAddress.trim().toLowerCase().replace(/[:-]/g, "");
      const res = await fetch(`${API_BASE_URL}/sensors/modules`, {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          module_id: cleanedMac,
          device_name: newDeviceName.trim() || "ESP32 S3 Node",
          user_id: user.user_id,
        }),
      });

      if (res.ok) {
        setShowAddModuleModal(false);
        setNewMacAddress("");
        setNewDeviceName("");
        await fetchUserModules();
        setSelectedModuleId(cleanedMac);
        Alert.alert("Success", "Sensor module paired successfully.");
      } else {
        const errData = await res.json();
        Alert.alert("Error", errData.detail || "Failed to register module.");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setModalSaving(false);
    }
  };

  const handleCheckSensorStatus = async () => {
    if (!selectedModuleId) {
      Alert.alert("Hardware Notice", "Please select a sensor module first.");
      return;
    }

    setCheckingStatus(true);
    setError("");
    setSensorStatus(null);
    setAnalysisCompleted(false);
    setReadings([]);

    try {
      const res = await fetch(`${API_BASE_URL}/sensors/modules/${selectedModuleId}/status`, {
        headers: getAuthHeaders(token),
      });

      if (res.ok) {
        setSensorStatus(await res.json());
      } else {
        setSensorStatus({
          online: false,
          dht11: false,
          bh1750: false,
          msg: "Device did not respond.",
        });
      }
    } catch {
      setSensorStatus({
        online: false,
        dht11: false,
        bh1750: false,
        msg: "Failed to connect to sensor module.",
      });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleStartAnalysis = () => {
    if (!selectedModuleId) {
      Alert.alert("Error", "Please select an online sensor module.");
      return;
    }

    setAnalyzing(true);
    setCountdown(60);
    setReadings([]);
    setAnalysisCompleted(false);
    setError("");

    let secondsLeft = 60;
    const collected = [];

    const fetchSingleReading = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-ambient`,
          { headers: getAuthHeaders(token) }
        );
        if (res.ok) {
          const data = await res.json();
          return {
            temp: Number(data.temperature),
            hum: Number(data.humidity),
            lux: Number(data.lux),
          };
        }
      } catch (err) {
        console.warn("Read failed:", err);
      }
      return null;
    };

    const timer = setInterval(async () => {
      secondsLeft -= 1;
      setCountdown(secondsLeft);

      if (secondsLeft === 40 || secondsLeft === 20 || secondsLeft === 0) {
        const sample = await fetchSingleReading();
        if (sample) {
          sample.sampleIndex = collected.length + 1;
          sample.time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          collected.push(sample);
          setReadings([...collected]);
        }
      }

      if (secondsLeft <= 0) {
        clearInterval(timer);
        setAnalyzing(false);
        setAnalysisCompleted(true);
      }
    }, 1000);
  };

  const averages = useMemo(() => {
    if (readings.length === 0) return { temp: 0, hum: 0, lux: 0 };
    const sum = readings.reduce(
      (acc, r) => ({
        temp: acc.temp + r.temp,
        hum: acc.hum + r.hum,
        lux: acc.lux + r.lux,
      }),
      { temp: 0, hum: 0, lux: 0 }
    );
    return {
      temp: (sum.temp / readings.length).toFixed(1),
      hum: (sum.hum / readings.length).toFixed(1),
      lux: (sum.lux / readings.length).toFixed(0),
    };
  }, [readings]);

  const tempStatus =
    averages.temp >= THRESHOLDS.tempMin && averages.temp <= THRESHOLDS.tempMax
      ? "Ideal"
      : averages.temp < THRESHOLDS.tempMin
      ? "Too Cold"
      : "Too Hot";

  const humStatus =
    averages.hum >= THRESHOLDS.humMin && averages.hum <= THRESHOLDS.humMax
      ? "Ideal"
      : averages.hum < THRESHOLDS.humMin
      ? "Too Dry"
      : "Too Humid";

  const luxStatus =
    averages.lux >= THRESHOLDS.luxMin && averages.lux <= THRESHOLDS.luxMax
      ? "Ideal"
      : averages.lux < THRESHOLDS.luxMin
      ? "Low Light"
      : "Direct Sun / Scorching";

  const isLocationIdeal =
    tempStatus === "Ideal" && humStatus === "Ideal" && luxStatus === "Ideal";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Analyze Location" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        {/* Step 1 & 2: Select Sensor Module */}
        <View className="p-4 rounded-3xl border bg-white shadow-xs mb-4" style={{ borderColor: colors.borderGray }}>
          <View className="flex-row justify-between items-center mb-2.5">
            <View className="flex-row items-center gap-1.5">
              <Radio size={16} color={colors.primary} />
              <Text className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colors.darkGray }}>
                1. Select Sensor Module
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setShowAddModuleModal(true)}
              className="flex-row items-center px-2.5 py-1 rounded-xl"
              style={{ backgroundColor: colors.primary }}
            >
              <Plus size={12} color={colors.white} />
              <Text className="text-[10px] font-bold text-white ml-1">Pair Node</Text>
            </TouchableOpacity>
          </View>

          {modules.length === 0 ? (
            <Text className="text-xs italic py-2 text-center" style={{ color: colors.mediumGray }}>
              No ESP32 nodes found. Tap "Pair Node" to register a module MAC address.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 py-1">
              {modules.map((m) => (
                <TouchableOpacity
                  key={m.module_id}
                  onPress={() => {
                    setSelectedModuleId(m.module_id);
                    setSensorStatus(null);
                    setAnalysisCompleted(false);
                    setReadings([]);
                  }}
                  className="px-3.5 py-2 rounded-2xl border"
                  style={{
                    backgroundColor: selectedModuleId === m.module_id ? colors.primaryLight : colors.lightGray,
                    borderColor: selectedModuleId === m.module_id ? colors.primary : colors.borderGray,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: selectedModuleId === m.module_id ? colors.primary : colors.darkGray }}
                  >
                    {m.device_name}
                  </Text>
                  <Text className="text-[10px] font-mono text-gray-400 mt-0.5">{m.module_id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Module Diagnostic Check Button */}
          {selectedModuleId ? (
            <TouchableOpacity
              onPress={handleCheckSensorStatus}
              disabled={checkingStatus}
              className="mt-3 py-2.5 rounded-xl border items-center justify-center"
              style={{ backgroundColor: colors.primaryLight, borderColor: colors.primary }}
            >
              {checkingStatus ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="text-xs font-bold" style={{ color: colors.primary }}>
                  Check Sensor Status
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Diagnostic Status Overview */}
        {sensorStatus && (
          <View className="p-4 rounded-3xl border bg-white mb-4 shadow-xs" style={{ borderColor: colors.borderGray }}>
            <Text className="text-xs font-extrabold uppercase tracking-wider mb-2" style={{ color: colors.mediumGray }}>
              Sensor Status Overview
            </Text>
            <View className="flex-row justify-around">
              <View className="items-center p-2 rounded-xl bg-gray-50 flex-1">
                <Text className="text-[10px] font-bold text-gray-400 uppercase">ESP32 S3</Text>
                <Text className="text-xs font-black mt-0.5" style={{ color: sensorStatus.online ? colors.primary : colors.danger }}>
                  {sensorStatus.online ? "🟢 Ready" : "🔴 Offline"}
                </Text>
              </View>
              <View className="items-center p-2 rounded-xl bg-gray-50 flex-1 mx-1.5">
                <Text className="text-[10px] font-bold text-gray-400 uppercase">DHT11 Temp/RH</Text>
                <Text className="text-xs font-black mt-0.5" style={{ color: sensorStatus.dht11 ? colors.primary : colors.danger }}>
                  {sensorStatus.dht11 ? "🟢 Ready" : "🔴 Offline"}
                </Text>
              </View>
              <View className="items-center p-2 rounded-xl bg-gray-50 flex-1">
                <Text className="text-[10px] font-bold text-gray-400 uppercase">BH1750 Lux</Text>
                <Text className="text-xs font-black mt-0.5" style={{ color: sensorStatus.bh1750 ? colors.primary : colors.danger }}>
                  {sensorStatus.bh1750 ? "🟢 Ready" : "🔴 Offline"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Step 3: Species Selection & Analyze Trigger */}
        {sensorStatus && sensorStatus.online && (
          <View className="p-4 rounded-3xl border bg-white mb-4 shadow-xs space-y-3" style={{ borderColor: colors.borderGray }}>
            <Text className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colors.darkGray }}>
              2. Orchid Species for Suitability
            </Text>

            <View className="flex-row gap-2">
              {ORCHID_SPECIES.map((spec) => (
                <TouchableOpacity
                  key={spec}
                  onPress={() => setSelectedOrchid(spec)}
                  className="flex-1 py-2 rounded-xl border items-center"
                  style={{
                    backgroundColor: selectedOrchid === spec ? colors.primaryLight : colors.lightGray,
                    borderColor: selectedOrchid === spec ? colors.primary : colors.borderGray,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: selectedOrchid === spec ? colors.primary : colors.darkGray }}
                  >
                    {spec}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleStartAnalysis}
              disabled={analyzing}
              className="py-3.5 rounded-2xl items-center justify-center shadow-xs mt-1"
              style={{ backgroundColor: colors.primary }}
            >
              {analyzing ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator color={colors.white} size="small" />
                  <Text className="text-xs font-bold text-white">
                    Sampling ({countdown}s remaining)...
                  </Text>
                </View>
              ) : (
                <Text className="text-xs font-bold text-white">Analyse Location (1-Min Read)</Text>
              )}
            </TouchableOpacity>

            {/* Progress Countdown Bar */}
            {analyzing && (
              <View className="pt-2">
                <View className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: colors.primary,
                      width: `${((60 - countdown) / 60) * 100}%`,
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Live Burst Readings Log */}
        {readings.length > 0 && (
          <View className="p-4 rounded-3xl border bg-white mb-4 shadow-xs" style={{ borderColor: colors.borderGray }}>
            <Text className="text-xs font-extrabold uppercase tracking-wider mb-2.5" style={{ color: colors.darkGray }}>
              Sensor Reading Records ({readings.length}/3 Collected)
            </Text>

            <View className="space-y-1.5">
              {readings.map((r, i) => (
                <View
                  key={i}
                  className="p-2.5 bg-gray-50 rounded-xl border flex-row justify-between items-center"
                  style={{ borderColor: colors.borderGray }}
                >
                  <Text className="text-xs font-black" style={{ color: colors.darkGray }}>
                    Sample #{r.sampleIndex}
                  </Text>
                  <Text className="text-xs font-bold text-rose-600">{r.temp} °C</Text>
                  <Text className="text-xs font-bold text-sky-600">{r.hum} %</Text>
                  <Text className="text-xs font-bold text-amber-600">{r.lux} Lux</Text>
                  <Text className="text-[10px] text-gray-400 font-mono">{r.time}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* COMPLETED ASSESSMENT RESULTS */}
        {analysisCompleted && (
          <View className="p-5 rounded-3xl border bg-white mb-8 shadow-xs space-y-4" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row items-center justify-between pb-3 border-b" style={{ borderColor: colors.borderGray }}>
              <View>
                <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.mediumGray }}>
                  Location Verdict
                </Text>
                <Text className="text-base font-black" style={{ color: colors.darkGray }}>
                  Suitability for {selectedOrchid}
                </Text>
              </View>

              <View
                className="px-3 py-1 rounded-full border"
                style={{
                  backgroundColor: isLocationIdeal ? colors.primaryLight : colors.dangerLight,
                  borderColor: isLocationIdeal ? colors.primary : colors.danger,
                }}
              >
                <Text
                  className="text-xs font-black"
                  style={{ color: isLocationIdeal ? colors.primary : colors.danger }}
                >
                  {isLocationIdeal ? "Optimal Location" : "Needs Adjustment"}
                </Text>
              </View>
            </View>

            {/* Assessment Parameter Breakdown Cards */}
            <View className="space-y-2">
              {/* Temperature */}
              <View className="p-3 bg-gray-50 rounded-2xl border flex-row items-center justify-between" style={{ borderColor: colors.borderGray }}>
                <View>
                  <Text className="text-xs font-extrabold" style={{ color: colors.darkGray }}>
                    Temperature
                  </Text>
                  <Text className="text-[10px] text-gray-400">Target: {THRESHOLDS.tempMin}°C – {THRESHOLDS.tempMax}°C</Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-black text-rose-600">{averages.temp} °C</Text>
                  <Text
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5"
                    style={{
                      backgroundColor: tempStatus === "Ideal" ? colors.primaryLight : colors.dangerLight,
                      color: tempStatus === "Ideal" ? colors.primary : colors.danger,
                    }}
                  >
                    {tempStatus}
                  </Text>
                </View>
              </View>

              {/* Relative Humidity */}
              <View className="p-3 bg-gray-50 rounded-2xl border flex-row items-center justify-between" style={{ borderColor: colors.borderGray }}>
                <View>
                  <Text className="text-xs font-extrabold" style={{ color: colors.darkGray }}>
                    Relative Humidity
                  </Text>
                  <Text className="text-[10px] text-gray-400">Target: {THRESHOLDS.humMin}% – {THRESHOLDS.humMax}%</Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-black text-sky-600">{averages.hum} %</Text>
                  <Text
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5"
                    style={{
                      backgroundColor: humStatus === "Ideal" ? colors.primaryLight : colors.dangerLight,
                      color: humStatus === "Ideal" ? colors.primary : colors.danger,
                    }}
                  >
                    {humStatus}
                  </Text>
                </View>
              </View>

              {/* Light Intensity */}
              <View className="p-3 bg-gray-50 rounded-2xl border flex-row items-center justify-between" style={{ borderColor: colors.borderGray }}>
                <View>
                  <Text className="text-xs font-extrabold" style={{ color: colors.darkGray }}>
                    Light (Lux)
                  </Text>
                  <Text className="text-[10px] text-gray-400">Target: {THRESHOLDS.luxMin} – {THRESHOLDS.luxMax} Lux</Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-black text-amber-600">{averages.lux} Lux</Text>
                  <Text
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5"
                    style={{
                      backgroundColor: luxStatus === "Ideal" ? colors.primaryLight : colors.dangerLight,
                      color: luxStatus === "Ideal" ? colors.primary : colors.danger,
                    }}
                  >
                    {luxStatus}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* REGISTER NEW SENSOR MODULE MODAL */}
      <Modal visible={showAddModuleModal} transparent animationType="fade">
        <View className="flex-1 justify-center items-center px-5" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View className="w-full bg-white rounded-3xl p-6 shadow-xl border" style={{ borderColor: colors.borderGray }}>
            <View className="flex-row justify-between items-center pb-3 mb-4 border-b" style={{ borderColor: colors.borderGray }}>
              <Text className="text-lg font-bold" style={{ color: colors.darkGray }}>
                Register Sensor Module
              </Text>
              <TouchableOpacity onPress={() => setShowAddModuleModal(false)}>
                <X size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            </View>

            <View className="mb-3">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>
                Device Name
              </Text>
              <TextInput
                className="rounded-xl px-3.5 py-2.5 text-sm border bg-gray-50"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
                placeholder="e.g., Garden Node 1"
                value={newDeviceName}
                onChangeText={setNewDeviceName}
              />
            </View>

            <View className="mb-4">
              <Text className="text-xs font-bold uppercase mb-1" style={{ color: colors.mediumGray }}>
                ESP32 MAC Address (Module ID)
              </Text>
              <TextInput
                className="rounded-xl px-3.5 py-2.5 text-sm border bg-gray-50 font-mono"
                style={{ borderColor: colors.borderGray, color: colors.darkGray }}
                placeholder="e.g., 348518abcdef"
                value={newMacAddress}
                onChangeText={setNewMacAddress}
              />
            </View>

            <View className="flex-row justify-end gap-2">
              <TouchableOpacity
                onPress={() => setShowAddModuleModal(false)}
                className="px-4 py-2.5 rounded-xl bg-gray-100"
              >
                <Text className="text-xs font-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRegisterModule}
                disabled={modalSaving}
                className="px-5 py-2.5 rounded-xl"
                style={{ backgroundColor: colors.primary }}
              >
                {modalSaving ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text className="text-xs font-bold text-white">Save Module</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}