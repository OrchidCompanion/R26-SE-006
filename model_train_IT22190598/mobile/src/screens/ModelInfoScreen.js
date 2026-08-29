import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Info, Cpu, Layers, ShieldCheck, Thermometer } from 'lucide-react-native';

const FEATURES = [
  "current_stage", "month", "day_of_year",
  "avg_temp_c", "min_temp_c", "max_temp_c", "temp_std_c",
  "avg_humidity_rh", "min_humidity_rh", "max_humidity_rh", "humidity_std_rh",
  "avg_light_lux", "min_light_lux", "max_light_lux", "light_std_lux"
];

export default function ModelInfoScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Info size={20} color="#ec4899" />
        <Text style={styles.screenTitle}>Model Architecture & Pipeline</Text>
      </View>
      <Text style={styles.screenDesc}>
        Dual-model machine learning pipeline for Dendrobium orchid blooming stage detection and transition duration prediction.
      </Text>

      {/* Model 01 Card */}
      <View style={styles.modelCard}>
        <View style={styles.modelHeader}>
          <Layers size={18} color="#ec4899" />
          <Text style={styles.modelTitle}>Model 01 — YOLOv8 Visual Stage Classifier</Text>
        </View>
        <Text style={styles.modelSub}>File: best.pt | Architecture: YOLOv8 PyTorch</Text>
        <Text style={styles.modelBody}>
          Processes 3 orchid images and applies confidence-weighted voting across 5 target blooming classes (`Seedling`, `Vegetative`, `Mature Pseudobulb`, `Bud Formation`, `Flowering`).
        </Text>
      </View>

      {/* Model 02 Card */}
      <View style={styles.modelCard}>
        <View style={styles.modelHeader}>
          <Cpu size={18} color="#10b981" />
          <Text style={styles.modelTitle}>Model 02 — Gradient Boosting Regressor</Text>
        </View>
        <Text style={styles.modelSub}>File: gradient_boosting_experiment.joblib | Architecture: Scikit-Learn Pipeline</Text>
        <Text style={styles.modelBody}>
          Predicts transition duration (days) from current stage to next stage using exact 15 feature vector computed from 7-day hourly Supabase IoT readings.
        </Text>
      </View>

      {/* 15 Features Vector List */}
      <View style={styles.featuresSection}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Thermometer size={16} color="#38bdf8" />
          <Text style={styles.featuresTitle}>15 Required Feature Vector</Text>
        </View>

        <View style={styles.featureGrid}>
          {FEATURES.map((feat, i) => (
            <View key={feat} style={styles.featurePill}>
              <Text style={styles.featureIndex}>{i + 1}</Text>
              <Text style={styles.featureName}>{feat}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b131e',
  },
  content: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  screenTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  screenDesc: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 16,
  },
  modelCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    marginBottom: 14,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  modelTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  modelSub: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  modelBody: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
  },
  featuresSection: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
  },
  featuresTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  featureIndex: {
    color: '#ec4899',
    fontSize: 10,
    fontWeight: '800',
  },
  featureName: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
