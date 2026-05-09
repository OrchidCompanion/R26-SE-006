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
  const [lightData, setLightData] = useState({
    morning: '---',
    afternoon: '---',
    evening: '---',
  });

  // SAFETY CHECK: Handle incoming data from the sensor screen
  useEffect(() => {
    // Using optional chaining (?.) prevents the "property of undefined" error
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
    console.log('[Location] Process Started');
    setStatus('Accessing device location...');
    
    try {
      setStatus('GPS location fetch in progress...');
      const loc = await GetLocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });

      const locString = `Lat: ${loc.latitude.toFixed(4)}, Long: ${loc.longitude.toFixed(4)}`;
      setLocation(locString);
      setStatus('Latitude and Longitude showed.');
      
      fetchWeather(loc.latitude, loc.longitude);
    } catch (error: any) {
      setStatus('Location access failed.');
      Alert.alert('Location Error', 'Please enable GPS.');
    }
  };

  const fetchWeather = async (lat: number, lon: number) => {
    setStatus('Connecting to OpenWeatherMap...');
    try {
      setStatus('Sending request to API...');
      console.log(`[OpenWeatherMap] Requesting weather for Lat: ${lat}, Lon: ${lon}`);
      console.log('URL : ', `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`);

      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
      );
      setStatus('Received a response.');
      const data = await response.json();
      console.log('[OpenWeatherMap] Full response:', data); // <-- Added log
      if (data.weather) {
        setWeather(`${data.weather[0].main}, ${data.main.temp.toFixed(1)}°C`);
        setStatus('Connected to OpenWeatherMap: Data fetched.');
      }
    } catch (error) {
      setStatus('Weather request failed.');
      setWeather('Error fetching weather');
      console.log('[OpenWeatherMap] Error:', error); // <-- Added log
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Analyse Plant Placement Location</Text>

        <TouchableOpacity style={styles.initiateBtn} onPress={handleInitiate}>
          <Text style={styles.btnText}>Initiate</Text>
        </TouchableOpacity>

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>Status: {status}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Location</Text>
          <Text style={styles.value}>{location}</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Weather</Text>
          <Text style={styles.value}>{weather}</Text>
          <View style={styles.divider} />
        </View>

        <Text style={[styles.label, styles.lightTitle]}>Light Intensity</Text>

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

// Styles remain the same as previous implementations...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 20, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '600', color: '#000', marginBottom: 20 },
  statusBox: { width: '100%', backgroundColor: '#f0f0f0', padding: 10, borderRadius: 5, marginBottom: 20 },
  statusText: { fontSize: 13, color: '#555', fontStyle: 'italic' },
  initiateBtn: { backgroundColor: '#37474F', paddingVertical: 15, paddingHorizontal: 60, borderRadius: 8, marginBottom: 20 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  section: { width: '100%', marginBottom: 20 },
  label: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 5 },
  value: { fontSize: 16, color: '#666', marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#EEE', width: '100%' },
  lightTitle: { alignSelf: 'flex-start', textDecorationLine: 'underline', marginTop: 10, marginBottom: 20 },
  lightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
  periodText: { fontSize: 16, flex: 1 },
  luxText: { fontSize: 16, flex: 1, color: '#666', textAlign: 'center' },
  checkBtn: { borderWidth: 1, borderColor: '#000', borderRadius: 5, paddingVertical: 5, paddingHorizontal: 15, minWidth: 80, alignItems: 'center' },
  checkBtnText: { fontSize: 14, color: '#000' },
});

export default AnalyseLocation;