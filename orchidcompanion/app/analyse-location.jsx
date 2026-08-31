import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { API_BASE_URL, getAuthHeaders } from "../src/config/api";

const THRESHOLDS = { tempMin: 25, tempMax: 30, humMin: 70, humMax: 75, luxMin: 16000, luxMax: 32000 };

export default function AnalyseLocationScreen() {
  const { user, token } = useSelector((state) => state.auth);

  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [readings, setReadings] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (user?.user_id) fetchModules();
  }, [user]);

  const fetchModules = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/sensors/modules/user/${user.user_id}`, {
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setModules(data);
        if (data.length > 0) setSelectedModuleId(data[0].module_id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartAnalysis = () => {
    if (!selectedModuleId) {
      Alert.alert("Error", "Please select a sensor module.");
      return;
    }

    setAnalyzing(true);
    setCountdown(60);
    setReadings([]);
    setResult(null);

    let secondsLeft = 60;
    const collected = [];

    const timer = setInterval(async () => {
      secondsLeft -= 1;
      setCountdown(secondsLeft);

      if (secondsLeft === 40 || secondsLeft === 20 || secondsLeft === 0) {
        try {
          const res = await fetch(`${API_BASE_URL}/sensors/modules/${selectedModuleId}/read-ambient`, {
            headers: getAuthHeaders(token),
          });
          if (res.ok) {
            const data = await res.json();
            collected.push({
              temp: Number(data.temperature),
              hum: Number(data.humidity),
              lux: Number(data.lux),
            });
            setReadings([...collected]);
          }
        } catch (e) {
          console.warn(e);
        }
      }

      if (secondsLeft <= 0) {
        clearInterval(timer);
        setAnalyzing(false);
        if (collected.length > 0) {
          const avgTemp = (collected.reduce((a, b) => a + b.temp, 0) / collected.length).toFixed(1);
          const avgHum = (collected.reduce((a, b) => a + b.hum, 0) / collected.length).toFixed(1);
          const avgLux = (collected.reduce((a, b) => a + b.lux, 0) / collected.length).toFixed(0);
          setResult({ avgTemp, avgHum, avgLux });
        }
      }
    }, 1000);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="Analyze Location" />

      <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
        <View className="p-4 rounded-2xl bg-white border mb-4" style={{ borderColor: colors.borderGray }}>
          <Text className="text-xs font-bold uppercase mb-2" style={{ color: colors.mediumGray }}>
            Select Sensor Module
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
            {modules.map((m) => (
              <TouchableOpacity
                key={m.module_id}
                onPress={() => setSelectedModuleId(m.module_id)}
                className="px-3.5 py-2 rounded-xl border"
                style={{
                  backgroundColor: selectedModuleId === m.module_id ? colors.primaryLight : colors.white,
                  borderColor: selectedModuleId === m.module_id ? colors.primary : colors.borderGray,
                }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: selectedModuleId === m.module_id ? colors.primary : colors.darkGray }}
                >
                  {m.device_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <TouchableOpacity
          onPress={handleStartAnalysis}
          disabled={analyzing}
          className="py-3.5 rounded-xl items-center justify-center shadow-xs mb-4"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-sm font-bold text-white">
            {analyzing ? `Sampling (${countdown}s remaining)...` : "Start Environmental Sampling"}
          </Text>
        </TouchableOpacity>

        {result && (
          <View className="p-4 rounded-2xl bg-white border space-y-3" style={{ borderColor: colors.borderGray }}>
            <Text className="text-base font-bold" style={{ color: colors.darkGray }}>
              Environmental Suitability: Dendrobium
            </Text>
            <View className="flex-row justify-between p-2.5 bg-gray-50 rounded-xl">
              <Text className="text-xs font-semibold text-gray-500">Temperature</Text>
              <Text className="text-xs font-bold text-rose-600">{result.avgTemp} °C (Target: 25–30°C)</Text>
            </View>
            <View className="flex-row justify-between p-2.5 bg-gray-50 rounded-xl">
              <Text className="text-xs font-semibold text-gray-500">Humidity</Text>
              <Text className="text-xs font-bold text-sky-600">{result.avgHum} % (Target: 70–75%)</Text>
            </View>
            <View className="flex-row justify-between p-2.5 bg-gray-50 rounded-xl">
              <Text className="text-xs font-semibold text-gray-500">Light</Text>
              <Text className="text-xs font-bold text-amber-600">{result.avgLux} Lux (Target: 16k–32k)</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}