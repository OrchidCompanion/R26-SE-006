import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as AmbientLight from 'react-native-ambient-light-module';

const CheckLightIntensity = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { period } = route.params;

  const [lux, setLux] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [readings, setReadings] = useState<number[]>([]);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  const readingsRef = useRef<number[]>([]);

  useEffect(() => {
    console.log(`[Sensor] Starting light analysis for ${period}`);
    
    // Initialize Sensor
    AmbientLight.isAvailable().then((available) => {
      if (available) {
        AmbientLight.setUpdateInterval(500);
        AmbientLight.startUpdates();
        
        const subscription = AmbientLight.addAmbientLightListener((event) => {
          setLux(event.lux);
        });

        const timer = setInterval(() => {
          setTimeLeft((prev) => {
            const nextTime = prev - 1;
            if ([50, 35, 20, 5].includes(nextTime)) {
              captureReading();
            }

            if (nextTime <= 0) {
              clearInterval(timer);
              setIsFinished(true);
              AmbientLight.stopUpdates();
              subscription.remove();
              console.log('[Sensor] Analysis complete');
            }
            return nextTime;
          });
        }, 1000);

        return () => {
          clearInterval(timer);
          subscription.remove();
          AmbientLight.stopUpdates();
        };
      } else {
        Alert.alert('Sensor Error', 'Device does not support ambient light sensing.');
        navigation.goBack();
      }
    });
  }, []);

  const captureReading = async () => {
    try {
      const { lux: currentLux } = await AmbientLight.getCurrentIlluminance();
      const updatedReadings = [...readingsRef.current, currentLux];
      readingsRef.current = updatedReadings;
      setReadings(updatedReadings);
      console.log(`[Sensor] Captured Reading #${updatedReadings.length}: ${currentLux}lx`);
    } catch (e) {
      console.error('[Sensor] Capture failed', e);
    }
  };

  const calculateAverage = () => {
    if (readings.length === 0) return 0;
    const sum = readings.reduce((a, b) => a + b, 0);
    return Math.round(sum / readings.length);
  };

  const avgValue = calculateAverage();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analysing {period} Light</Text>
        <Text style={styles.timer}>{timeLeft}s</Text>
        <Text style={{ fontSize: 14, color: '#555' }}>remaining</Text>
      </View>

      <View style={styles.header}>
        <Text style={{ fontSize: 12, color: '#999' }}>Please keep the device steady</Text>
      </View>

      <View style={styles.liveContainer}>
        <Text style={styles.liveLabel}>Live Reading:</Text>
        <Text style={styles.liveLux}>{lux.toFixed(1)} <Text style={styles.unit}>lx</Text></Text>
      </View>

      <View style={styles.samplesContainer}>
        <Text style={styles.sampleHeader}>Captured Samples (4 required):</Text>
        {readings.map((r, i) => (
          <Text key={i} style={styles.sampleText}>Reading {i + 1}: {r.toFixed(0)} lx</Text>
        ))}
      </View>

      <View style={styles.averageBox}>
        <Text style={styles.avgLabel}>Current Average:</Text>
        <Text style={styles.avgValue}>{avgValue} lx</Text>
      </View>

      {isFinished && (
        <TouchableOpacity 
          style={styles.backBtn}
          onPress={() => {
            console.log(`[Nav] Returning to main screen with avg: ${avgValue}`);
            navigation.replace('AnalyseLocation', { period, averageLux: avgValue });
          }}
        >
          <Text style={styles.backBtnText}>Confirm & Go Back</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  timer: { fontSize: 48, fontWeight: '300', color: '#E53935' },
  liveContainer: { alignItems: 'center', marginBottom: 30, backgroundColor: '#f9f9f9', padding: 20, borderRadius: 15 },
  liveLabel: { fontSize: 14, color: '#888', textTransform: 'uppercase' },
  liveLux: { fontSize: 42, fontWeight: 'bold', color: '#000' },
  unit: { fontSize: 18, color: '#666' },
  samplesContainer: { flex: 1 },
  sampleHeader: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  sampleText: { fontSize: 16, color: '#444', marginBottom: 5 },
  averageBox: { padding: 20, borderTopWidth: 1, borderColor: '#eee', alignItems: 'center' },
  avgLabel: { fontSize: 16, color: '#555' },
  avgValue: { fontSize: 28, fontWeight: 'bold', color: '#2E7D32' },
  backBtn: { backgroundColor: '#37474F', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default CheckLightIntensity;