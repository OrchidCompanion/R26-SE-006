import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import GetLocation from 'react-native-get-location';
import { WEATHER_API_KEY } from '@env';

const AnalyseLocation = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [status, setStatus] = useState<string>('Capture light readings to begin.');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [readableLocation, setReadableLocation] = useState<string | null>(null);
  const [weather, setWeather] = useState<string | null>(null);
  const [isValidated, setIsValidated] = useState<boolean>(false);

  const [temp, setTemp] = useState<number | null>(null);
  const [humidity, setHumidity] = useState<number | null>(null);

  const [lightData, setLightData] = useState<{ morning: string; afternoon: string; evening: string }>({
    morning: '---',
    afternoon: '---',
    evening: '---',
  });

  useEffect(() => {
    if (route.params?.period && route.params?.averageLux !== undefined) {
      const { period, averageLux } = route.params;
      setLightData((prev) => ({ ...prev, [period]: averageLux.toString() }));
    }
  }, [route.params]);

  const handleValidateLocation = async () => {
    const hasData = Object.values(lightData).some(v => v !== '---');
    if (!hasData) {
      Alert.alert('Incomplete Data', 'Please check at least one light intensity slot.');
      return;
    }

    setStatus('Locating device...');
    try {
      const loc = await GetLocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });

      setCoords({ lat: loc.latitude, lon: loc.longitude });
      fetchWeather(loc.latitude, loc.longitude);
    } catch (error) {
      setStatus('Location failed.');
      Alert.alert('Error', 'Ensure GPS is enabled.');
    }
  };

  const fetchWeather = async (lat: number, lon: number) => {
    setStatus('Syncing with Weather API...');
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
      );
      const data = await response.json();

      if (data.main) {
        // Extracting City and Country from API
        const locationName = `${data.name}, ${data.sys.country}`;
        setReadableLocation(locationName);

        setWeather(`${data.weather[0].main}, ${data.main.temp.toFixed(1)}°C`);
        setTemp(data.main.temp);
        setHumidity(data.main.humidity);
        setIsValidated(true);
        setStatus('Analysis Complete.');
      }
    } catch (error) {
      setStatus('Sync failed.');
    }
  };

  // Function to open Google/Apple Maps
  const openInMaps = () => {
    if (!coords) return;
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${coords.lat},${coords.lon}`;
    const label = 'Detected Orchid Site';
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });

    if (url) Linking.openURL(url);
  };

  const calculateSuitability = () => {
    if (temp === null || humidity === null || !isValidated) return null;
    const lOpt = 6500; const lTol = 1500; // Target: 5,000-8,000 lx
    const hOpt = 70; const hTol = 10;     // Target: 60-80%
    const tOpt = 24.5; const tTol = 5.5;  // Target: 19-30°C

    const activeReadings = Object.values(lightData).filter(v => v !== '---').map(v => parseInt(v));
    const avgLux = activeReadings.reduce((a, b) => a + b, 0) / activeReadings.length;

    const lScore = Math.max(0, 1 - Math.abs(avgLux - lOpt) / lTol);
    const tScore = Math.max(0, 1 - Math.abs(temp - tOpt) / tTol);
    const hScore = Math.max(0, 1 - Math.abs(humidity - hOpt) / hTol);

    return Math.round((lScore * 0.5 + tScore * 0.3 + hScore * 0.2) * 100);
  };

  const finalScore = calculateSuitability();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Environmental Analysis</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Light Intensity (Lux Sensor)</Text>
          {(['morning', 'afternoon', 'evening'] as const).map((period) => (
            <View key={period} style={styles.lightRow}>
              <Text style={styles.periodText}>{period.charAt(0).toUpperCase() + period.slice(1)}</Text>
              <Text style={styles.luxValue}>{lightData[period]} lx</Text>
              <TouchableOpacity style={styles.checkBtn} onPress={() => navigation.navigate('CheckLightIntensity', { period })}>
                <Text style={styles.checkBtnText}>Capture</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.validateBtn} onPress={handleValidateLocation}>
          <Text style={styles.validateText}>Validate Location</Text>
        </TouchableOpacity>

        <View style={styles.statusBox}><Text style={styles.statusText}>{status}</Text></View>

        {isValidated && (
          <>
            <View style={[styles.scoreCard, { borderColor: (finalScore ?? 0) > 75 ? '#2E7D32' : '#C62828' }]}>
              <Text style={styles.scoreLabel}>Placement Suitability</Text>
              <Text style={styles.scoreDisplay}>{finalScore}%</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Detected Location</Text>
              <Text style={styles.detailValue}>{readableLocation || 'Processing...'}</Text>

              <TouchableOpacity onPress={openInMaps} style={styles.mapLink}>
                <Text style={styles.mapLinkText}>View on Map 📍</Text>
              </TouchableOpacity>

              <Text style={styles.detailLabel}>Local Climate</Text>
              <Text style={styles.detailValue}>{weather} (Humidity: {humidity}%)</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { padding: 20, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 20 },
  card: { width: '100%', backgroundColor: '#FFF', padding: 20, borderRadius: 12, elevation: 2, marginBottom: 20 },
  label: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginBottom: 15, textDecorationLine: 'underline' },
  lightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  periodText: { fontSize: 16, color: '#4B5563', flex: 1 },
  luxValue: { fontSize: 16, color: '#6B7280', flex: 1, textAlign: 'center' },
  checkBtn: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  checkBtnText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  validateBtn: { backgroundColor: '#1F2937', width: '100%', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
  validateText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  statusBox: { width: '100%', backgroundColor: '#F3F4F6', padding: 10, borderRadius: 8, marginBottom: 20 },
  statusText: { fontSize: 12, color: '#6B7280', fontStyle: 'italic', textAlign: 'center' },
  scoreCard: { width: '100%', padding: 20, borderRadius: 15, borderWidth: 3, alignItems: 'center', backgroundColor: '#ECFDF5', marginBottom: 20 },
  scoreLabel: { fontSize: 14, color: '#065F46', textTransform: 'uppercase' },
  scoreDisplay: { fontSize: 56, fontWeight: 'bold', color: '#064E3B' },
  detailSection: { width: '100%', paddingHorizontal: 10 },
  detailLabel: { fontSize: 14, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginTop: 15 },
  detailValue: { fontSize: 17, color: '#1F2937', fontWeight: '500' },
  mapLink: { marginTop: 5 },
  mapLinkText: { color: '#2563EB', fontSize: 15, textDecorationLine: 'underline' },
});

export default AnalyseLocation;