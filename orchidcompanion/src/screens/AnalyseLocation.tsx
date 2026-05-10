import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import GetLocation from 'react-native-get-location';
import { WEATHER_API_KEY } from '@env';

const AnalyseLocation = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  
  const [status, setStatus] = useState<string>('Ready to start');
  const [location, setLocation] = useState<string>('Not initiated');
  const [weather, setWeather] = useState<string>('Not initiated');
  
  // States for suitability calculation
  const [temp, setTemp] = useState<number | null>(null);
  const [humidity, setHumidity] = useState<number | null>(null);
  
  const [lightData, setLightData] = useState<{ [key: string]: string }>({
    morning: '---',
    afternoon: '---',
    evening: '---',
  });

  useEffect(() => {
    if (route.params?.period && route.params?.averageLux !== undefined) {
      const { period, averageLux } = route.params;
      console.log(`[UI Update] Received ${averageLux}lx for ${period}`);
      setLightData((prev) => ({
        ...prev,
        [period]: averageLux.toString(),
      }));
    }
  }, [route.params]);

  const handleInitiate = async () => {
    setStatus('Accessing device location...');
    try {
      setStatus('GPS location fetch in progress...');
      const loc = await GetLocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });

      const locString = `Lat: ${loc.latitude.toFixed(4)}, Long: ${loc.longitude.toFixed(4)}`;
      setLocation(locString);
      setStatus('Location Captured.');
      fetchWeather(loc.latitude, loc.longitude);
    } catch (error: any) {
      setStatus('Location access failed.');
      Alert.alert('Location Error', 'Please enable GPS.');
    }
  };

  const fetchWeather = async (lat: number, lon: number) => {
    setStatus('Connecting to OpenWeatherMap...');
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
      );
      const data = await response.json();
      
      if (data.weather && data.main) {
        setWeather(`${data.weather[0].main}, ${data.main.temp.toFixed(1)}°C`);
        setTemp(data.main.temp);
        setHumidity(data.main.humidity);
        setStatus('Weather Data Synchronized.');
      }
    } catch (error) {
      setStatus('Weather request failed.');
      setWeather('Error fetching weather');
    }
  };

  // Suitability Scoring Logic
  const calculateSuitability = () => {
    if (temp === null || humidity === null) return null;

    // 1. Temperature Score (Target: 19-30°C)
    const tOpt = 24.5;
    const tTol = 5.5;
    const tScore = Math.max(0, 1 - Math.abs(temp - tOpt) / tTol);

    // 2. Humidity Score (Target: 60-80% [cite: 63])
    const hOpt = 70;
    const hTol = 10;
    const hScore = Math.max(0, 1 - Math.abs(humidity - hOpt) / hTol);

    // 3. Light Score (Target: 5000-8000 lx [cite: 61])
    const lOpt = 6500;
    const lTol = 1500;
    
    // Average all captured light readings
    const activeReadings = Object.values(lightData)
      .filter(v => v !== '---')
      .map(v => parseInt(v));
    
    if (activeReadings.length === 0) return { total: null, tScore, hScore, lScore: 0 };

    const avgLux = activeReadings.reduce((a, b) => a + b, 0) / activeReadings.length;
    const lScore = Math.max(0, 1 - Math.abs(avgLux - lOpt) / lTol);

    // Weighted Average: 50% Light, 30% Temp, 20% Humidity
    const totalScore = (lScore * 0.5 + tScore * 0.3 + hScore * 0.2) * 100;
    return { total: Math.round(totalScore), tScore, hScore, lScore };
  };

  const scores = calculateSuitability();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Analyse Plant Placement Location</Text>

        <TouchableOpacity style={styles.initiateBtn} onPress={handleInitiate}>
          <Text style={styles.btnText}>Initiate Analysis</Text>
        </TouchableOpacity>

        {/* Display Final Suitability Score */}
        {scores && scores.total !== null && (
          <View style={[styles.scoreCard, { borderColor: scores.total > 70 ? '#2E7D32' : '#C62828' }]}>
            <Text style={styles.scoreLabel}>Suitability Score</Text>
            <Text style={styles.scoreValue}>{scores.total}%</Text>
            <Text style={styles.scoreStatus}>
              {scores.total > 80 ? 'Excellent Location' : scores.total > 50 ? 'Fair Location' : 'Poor Location'}
            </Text>
          </View>
        )}

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>System Status: {status}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Location Details</Text>
          <Text style={styles.value}>{location}</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Climate (Weather API)</Text>
          <Text style={styles.value}>{weather}</Text>
          {humidity !== null && <Text style={styles.subValue}>Humidity: {humidity}%</Text>}
          <View style={styles.divider} />
        </View>

        <Text style={[styles.label, styles.lightTitle]}>Light Intensity (Lux Sensor)</Text>

        {(['morning', 'afternoon', 'evening'] as const).map((period) => (
          <View key={period} style={styles.lightRow}>
            <Text style={styles.periodText}>{period.charAt(0).toUpperCase() + period.slice(1)}</Text>
            <Text style={styles.luxText}>{lightData[period]} lx</Text>
            <TouchableOpacity
              style={styles.checkBtn}
              onPress={() => navigation.navigate('CheckLightIntensity', { period })}
            >
              <Text style={styles.checkBtnText}>check</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 20, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '600', color: '#000', marginBottom: 20, textAlign: 'center' },
  scoreCard: { width: '100%', padding: 20, borderRadius: 15, borderWidth: 2, alignItems: 'center', marginBottom: 20, backgroundColor: '#F1F8E9' },
  scoreLabel: { fontSize: 16, color: '#555' },
  scoreValue: { fontSize: 48, fontWeight: 'bold', color: '#000' },
  scoreStatus: { fontSize: 18, fontWeight: '500' },
  statusBox: { width: '100%', backgroundColor: '#f5f5f5', padding: 10, borderRadius: 5, marginBottom: 20 },
  statusText: { fontSize: 12, color: '#777', fontStyle: 'italic' },
  initiateBtn: { backgroundColor: '#37474F', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 8, marginBottom: 20 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  section: { width: '100%', marginBottom: 15 },
  label: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 5 },
  value: { fontSize: 16, color: '#444' },
  subValue: { fontSize: 14, color: '#666', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#EEE', width: '100%', marginTop: 10 },
  lightTitle: { alignSelf: 'flex-start', textDecorationLine: 'underline', marginTop: 10, marginBottom: 15 },
  lightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 },
  periodText: { fontSize: 16, flex: 1, color: '#333' },
  luxText: { fontSize: 16, flex: 1, color: '#666', textAlign: 'center' },
  checkBtn: { borderWidth: 1, borderColor: '#333', borderRadius: 5, paddingVertical: 6, paddingHorizontal: 12, minWidth: 70, alignItems: 'center' },
  checkBtnText: { fontSize: 13, fontWeight: '500' },
});

export default AnalyseLocation;