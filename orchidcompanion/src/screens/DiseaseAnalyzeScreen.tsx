import React, { useState } from 'react';
import {
  View,
  Text,
  Button,
  Image,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'DiseaseAnalyze'>;

const BASE_URL = Platform.select({ android: 'http://10.0.2.2:5000', default: 'http://localhost:5000' });

const DiseaseAnalyzeScreen: React.FC<Props> = () => {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const pickImage = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (res.didCancel) return;
    const asset = res.assets && res.assets[0];
    if (asset && asset.uri) {
      setImageUri(asset.uri);
      setResult(null);
    }
  };

  const analyze = async () => {
    if (!imageUri) return;
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      // @ts-ignore - RN FormData file
      form.append('image', {
        uri: imageUri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      });

      const resp = await fetch(`${BASE_URL}/predict`, { method: 'POST', body: form });
      const json = await resp.json();
      setResult(json);
    } catch (err: any) {
      setResult({ error: err.message || String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>📷 Upload Leaf Image</Text>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder} />
        )}
        <View style={styles.row}>
          <Button title="Choose Image" onPress={pickImage} />
          <View style={{ width: 12 }} />
          <Button title="Analyze" onPress={analyze} disabled={!imageUri || loading} />
        </View>
      </View>

      {loading && (
        <View style={[styles.card, styles.center]}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 8 }}>Analyzing leaf + NPK data...</Text>
        </View>
      )}

      {result && (
        <View style={styles.card}>
          {result.error ? (
            <Text style={styles.error}>Error: {result.error}</Text>
          ) : (
            <>
              <View style={[styles.verdict, result.verdict === 'HEALTHY' ? styles.healthy : styles.disease]}>
                <Text style={styles.verdictText}>{result.verdict_msg}</Text>
              </View>

              <Text style={styles.sectionTitle}>🦠 Detection</Text>
              <Text style={styles.normal}>{result.disease_info}</Text>
              <Text style={styles.big}>{result.confidence}%</Text>

              <Text style={styles.sectionTitle}>🧪 NPK Sensor Data</Text>
              <Text style={styles.small}>Latest: {result.npk?.time ?? 'N/A'}</Text>
              <View style={styles.npkRow}>
                {['N', 'P', 'K'].map((n) => {
                  const st = result.npk_status?.[n] || 'ok';
                  const val = (result.npk && result.npk[n] !== null) ? String(result.npk[n]) : 'N/A';
                  return (
                    <View key={n} style={[styles.npkBox, st === 'ok' ? styles.ok : st === 'low' ? styles.low : styles.high]}>
                      <Text style={styles.npkN}>{n}</Text>
                      <Text style={styles.npkV}>{val}</Text>
                      <Text style={styles.npkU}>mg/kg</Text>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>💊 Treatment Recommendations</Text>
              {Array.isArray(result.treatment) && result.treatment.map((t: string, i: number) => (
                <Text key={i} style={styles.listItem}>• {t}</Text>
              ))}

              {result.result_image ? (
                <>
                  <Text style={styles.sectionTitle}>🔍 AI Detection Image</Text>
                  <Image source={{ uri: `data:image/jpeg;base64,${result.result_image}` }} style={styles.resultImg} />
                </>
              ) : null}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 12, elevation: 2 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  preview: { width: '100%', height: 240, borderRadius: 8, marginBottom: 10, resizeMode: 'cover' },
  placeholder: { width: '100%', height: 240, borderRadius: 8, marginBottom: 10, backgroundColor: '#f0f0f0' },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  verdict: { padding: 12, borderRadius: 8, marginBottom: 10 },
  healthy: { backgroundColor: '#2e7d32' },
  disease: { backgroundColor: '#c62828' },
  verdictText: { color: '#fff', fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  normal: { color: '#333', marginBottom: 6 },
  big: { fontSize: 22, fontWeight: '800', color: '#1b5e20', marginBottom: 8 },
  small: { color: '#666', marginBottom: 6 },
  npkRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  npkBox: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 8, marginHorizontal: 4 },
  ok: { borderWidth: 1, borderColor: '#2e7d32', backgroundColor: '#e8f5e9' },
  low: { borderWidth: 1, borderColor: '#f57f17', backgroundColor: '#fff8e1' },
  high: { borderWidth: 1, borderColor: '#c62828', backgroundColor: '#ffebee' },
  npkN: { fontWeight: '700' },
  npkV: { fontSize: 18, fontWeight: '800' },
  npkU: { fontSize: 12, color: '#666' },
  listItem: { paddingVertical: 4, color: '#333' },
  resultImg: { width: '100%', height: 280, borderRadius: 8, marginTop: 8 },
  error: { color: '#c62828', fontWeight: '700' },
});

export default DiseaseAnalyzeScreen;
