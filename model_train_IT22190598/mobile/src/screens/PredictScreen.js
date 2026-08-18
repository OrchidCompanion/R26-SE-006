import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, Sparkles, Layers, RefreshCw, AlertCircle } from 'lucide-react-native';
import StageBadge from '../components/StageBadge';
import TimelineVisualizer from '../components/TimelineVisualizer';
import SensorInputModal from '../components/SensorInputModal';
import { predictBloom } from '../services/api';

export default function PredictScreen({ onSavePrediction }) {
  const [images, setImages] = useState([null, null, null]);
  const [loading, setLoading] = useState(false);
  const [sensorModalVisible, setSensorModalVisible] = useState(false);

  const [plantId, setPlantId] = useState("029282a6-ecbe-441f-84c0-ce107f6470d9");
  const [moduleId, setModuleId] = useState("8f4c51d4-81df-491c-8c14-744fd4ae7f14");
  const [sensorSummary, setSensorSummary] = useState(null);

  const [bloomResult, setBloomResult] = useState(null);

  const pickImage = async (index, useCamera = false) => {
    let result;
    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Camera permission is required to take photo.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
    }

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setImages(prev => {
        const copy = [...prev];
        copy[index] = uri;
        return copy;
      });
    }
  };

  const handleRunPrediction = async () => {
    const filledCount = images.filter(Boolean).length;
    if (filledCount < 3) {
      Alert.alert("3 Images Required", `Please select all 3 orchid photos before predicting (${filledCount}/3 picked).`);
      return;
    }

    setLoading(true);
    setBloomResult(null);

    try {
      const sensorPayload = sensorSummary ? {
        plant_id: plantId,
        module_id: moduleId,
        ...sensorSummary
      } : null;

      const res = await predictBloom(images, sensorPayload);
      setBloomResult(res);
      if (onSavePrediction) {
        onSavePrediction(res);
      }
    } catch (err) {
      Alert.alert("Prediction Failed", err.message || "Failed to execute bloom prediction.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerTitleRow}>
        <Sparkles size={20} color="#ec4899" />
        <Text style={styles.screenTitle}>Bloom Prediction Engine</Text>
      </View>
      <Text style={styles.screenDesc}>
        Upload 3 images of your Dendrobium orchid and optionally connect Supabase IoT sensor data to generate timeline prediction.
      </Text>

      {/* 3 Images Upload Grid */}
      <View style={styles.uploadSection}>
        <Text style={styles.sectionLabel}>3 Required Orchid Photos</Text>
        <View style={styles.imageGrid}>
          {[0, 1, 2].map((idx) => (
            <View key={idx} style={styles.imageCard}>
              {images[idx] ? (
                <View style={styles.previewContainer}>
                  <Image source={{ uri: images[idx] }} style={styles.thumbnail} />
                  <TouchableOpacity
                    style={styles.repickBtn}
                    onPress={() => pickImage(idx, false)}
                  >
                    <RefreshCw size={12} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyPickerBox}>
                  <Text style={styles.slotTitle}>Photo #{idx + 1}</Text>
                  <View style={styles.pickButtonsRow}>
                    <TouchableOpacity
                      style={styles.iconPickBtn}
                      onPress={() => pickImage(idx, true)}
                    >
                      <Camera size={14} color="#ec4899" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconPickBtn}
                      onPress={() => pickImage(idx, false)}
                    >
                      <ImageIcon size={14} color="#38bdf8" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Supabase IoT Config Button */}
      <TouchableOpacity
        style={styles.iotCardBtn}
        onPress={() => setSensorModalVisible(true)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Layers size={18} color="#10b981" />
          <View>
            <Text style={styles.iotTitle}>Supabase IoT Sensor Data</Text>
            <Text style={styles.iotSub}>
              {sensorSummary ? `Loaded ${sensorSummary.readings_count || 168} Readings` : "Tap to select plant & fetch IoT data"}
            </Text>
          </View>
        </View>
        <Text style={styles.iotActionText}>{sensorSummary ? "Configured ✓" : "Configure ➜"}</Text>
      </TouchableOpacity>

      {/* Run Prediction Button */}
      <TouchableOpacity
        style={[styles.predictBtn, loading && styles.predictBtnDisabled]}
        onPress={handleRunPrediction}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <>
            <Sparkles size={18} color="#ffffff" />
            <Text style={styles.predictBtnText}>⚡ Run Dendrobium Bloom Prediction</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Prediction Results Display */}
      {bloomResult && (
        <View style={styles.resultsContainer}>
          {/* Model 01 Detected Stage Header */}
          <View style={styles.stageResultCard}>
            <Text style={styles.resCardLabel}>MODEL 01 DETECTED STAGE</Text>
            <View style={{ marginVertical: 6 }}>
              <StageBadge stage={bloomResult.current_stage} size="medium" />
            </View>
            <Text style={styles.confidenceText}>
              Confidence: {((bloomResult.model01_result?.overall_confidence || 0.95) * 100).toFixed(1)}%
            </Text>
          </View>

          {/* Next Stage Window Card */}
          <View style={styles.nextStageCard}>
            <Text style={styles.resCardLabel}>TARGET NEXT-STAGE WINDOW (±5 DAYS)</Text>
            <Text style={styles.targetRangeText}>
              {bloomResult.timeline[0]?.date_range_display || bloomResult.timeline[0]?.estimated_stage_date}
            </Text>
            <Text style={styles.targetSubText}>Calendar date range window</Text>
          </View>

          {/* Timeline Progression Visualizer */}
          <TimelineVisualizer
            currentStage={bloomResult.current_stage}
            timeline={bloomResult.timeline}
            totalDays={bloomResult.total_days_to_flowering}
            estimatedFloweringDate={bloomResult.estimated_flowering_date}
            floweringDateRangeDisplay={bloomResult.flowering_date_range_display}
          />

          {/* Final Estimated Flowering Date Banner */}
          <View style={styles.finalBanner}>
            <Text style={styles.finalBannerLabel}>TARGET FLOWERING WINDOW (±5 DAYS RANGE)</Text>
            <Text style={styles.finalBannerValue}>
              {bloomResult.flowering_date_range_display || bloomResult.estimated_flowering_date}
            </Text>
            <Text style={styles.finalBannerSub}>
              Estimated total flowering time: <Text style={{ fontWeight: '800', color: '#f8fafc' }}>{bloomResult.display_total_days} Days</Text> starting from {bloomResult.current_date}.
            </Text>
          </View>
        </View>
      )}

      {/* Sensor Input Modal */}
      <SensorInputModal
        visible={sensorModalVisible}
        onClose={() => setSensorModalVisible(false)}
        sensorSummary={sensorSummary}
        setSensorSummary={setSensorSummary}
        selectedPlantId={plantId}
        setSelectedPlantId={setPlantId}
        selectedModuleId={moduleId}
        setSelectedModuleId={setModuleId}
      />
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  screenTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  screenDesc: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 16,
  },
  uploadSection: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  imageGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  imageCard: {
    flex: 1,
    aspectRatio: 0.9,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',

  },
  repickBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 12,
    padding: 5,
  },
  emptyPickerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  slotTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  pickButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  iconPickBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 8,
  },
  iotCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  iotTitle: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '800',
  },
  iotSub: {
    color: '#94a3b8',
    fontSize: 11,
  },
  iotActionText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  predictBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  predictBtnDisabled: {
    opacity: 0.6,
  },
  predictBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  resultsContainer: {
    gap: 14,
  },
  stageResultCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    alignItems: 'center',
  },
  resCardLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  confidenceText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  nextStageCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    padding: 16,
    alignItems: 'center',
  },
  targetRangeText: {
    color: '#38bdf8',
    fontSize: 17,
    fontWeight: '800',
    marginVertical: 4,
  },
  targetSubText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  finalBanner: {
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    borderColor: 'rgba(236, 72, 153, 0.4)',
    borderWidth: 2,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  finalBannerLabel: {
    color: '#f472b6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  finalBannerValue: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '800',
    marginVertical: 6,
  },
  finalBannerSub: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
});
