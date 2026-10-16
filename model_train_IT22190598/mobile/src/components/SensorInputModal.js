import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Cpu, Sprout, Zap, Check, X, RefreshCw, Layers } from 'lucide-react-native';
import { fetchSupabaseReadings, fetchSupabasePlants, fetchSupabaseModules } from '../services/api';

const DEFAULT_SUPABASE_URL = "https://kelrhjmhusezqztlgtil.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_kIoXiQwU6phX7JD3z9Y0Dw_rtSrt1by";
const DEFAULT_USER_ID = "47d388cc-703e-46b3-8cb9-4fd6cb616613";

export default function SensorInputModal({ visible, onClose, sensorSummary, setSensorSummary, selectedPlantId, setSelectedPlantId, selectedModuleId, setSelectedModuleId }) {
  const [loading, setLoading] = useState(false);
  const [plants, setPlants] = useState([
    { plant_id: "029282a6-ecbe-441f-84c0-ce107f6470d9", plant_name: "Bamboo Orchid (029282a6...)" },
    { plant_id: "059282a6-ecbe-441f-84c0-ce107f6470d9", plant_name: "Bamboo Orchid (059282a6...)" }
  ]);
  const [modules, setModules] = useState([
    { module_id: "8f4c51d4-81df-491c-8c14-744fd4ae7f14", module_name: "ESP32 S3 Sensor (8f4c51d4...)" },
    { module_id: "5f4c51d4-81df-491c-8c14-744fd4ae7f14", module_name: "ESP32 S3 Sensor (5f4c51d4...)" }
  ]);

  useEffect(() => {
    if (visible) {
      loadPlantsAndModules();
    }
  }, [visible]);

  const loadPlantsAndModules = async () => {
    try {
      const pRes = await fetchSupabasePlants(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY, DEFAULT_USER_ID);
      if (pRes && pRes.plants && pRes.plants.length > 0) {
        setPlants(pRes.plants);
      }
      const mRes = await fetchSupabaseModules(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY, DEFAULT_USER_ID);
      if (mRes && mRes.modules && mRes.modules.length > 0) {
        setModules(mRes.modules);
      }
    } catch (e) {
      console.warn("Could not fetch remote plants/modules list", e);
    }
  };

  const handleFetchReadings = async () => {
    setLoading(true);
    try {
      const data = await fetchSupabaseReadings(
        DEFAULT_SUPABASE_URL,
        DEFAULT_SUPABASE_KEY,
        selectedPlantId,
        selectedModuleId,
        7
      );

      if (data && data.sensor_summary) {
        setSensorSummary(data.sensor_summary);
        Alert.alert("Success", `Loaded 7-day hourly IoT sensor data (${data.sensor_summary.readings_count || 168} readings).`);
      } else {
        Alert.alert("Notice", "No readings returned from Supabase.");
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to fetch readings from Supabase.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Layers size={20} color="#10b981" />
              <Text style={styles.modalTitle}>Supabase IoT Data Config</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }}>
            {/* Select Plant ID */}
            <Text style={[styles.label, { color: '#34d399' }]}>
              <Sprout size={12} color="#34d399" /> Select Plant ID
            </Text>
            <View style={styles.pickerContainer}>
              {plants.map(p => (
                <TouchableOpacity
                  key={p.plant_id}
                  style={[
                    styles.pickerOption,
                    selectedPlantId === p.plant_id && styles.pickerOptionSelected
                  ]}
                  onPress={() => setSelectedPlantId(p.plant_id)}
                >
                  <Text style={[
                    styles.pickerText,
                    selectedPlantId === p.plant_id && { color: '#ffffff', fontWeight: '800' }
                  ]}>
                    {p.plant_name || 'Orchid Plant'} - {p.plant_id.slice(0, 8)}...
                  </Text>
                  {selectedPlantId === p.plant_id && <Check size={16} color="#10b981" />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Select IoT Module ID */}
            <Text style={[styles.label, { color: '#f472b6', marginTop: 12 }]}>
              <Cpu size={12} color="#f472b6" /> Select IoT Module ID
            </Text>
            <View style={styles.pickerContainer}>
              {modules.map(m => (
                <TouchableOpacity
                  key={m.module_id}
                  style={[
                    styles.pickerOption,
                    selectedModuleId === m.module_id && styles.pickerOptionSelectedModule
                  ]}
                  onPress={() => setSelectedModuleId(m.module_id)}
                >
                  <Text style={[
                    styles.pickerText,
                    selectedModuleId === m.module_id && { color: '#ffffff', fontWeight: '800' }
                  ]}>
                    {m.module_name || 'ESP32 S3 Sensor'} - {m.module_id.slice(0, 8)}...
                  </Text>
                  {selectedModuleId === m.module_id && <Check size={16} color="#ec4899" />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Fetch Readings Button */}
            <TouchableOpacity
              style={styles.fetchBtn}
              onPress={handleFetchReadings}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Zap size={16} color="#ffffff" />
                  <Text style={styles.fetchBtnText}>Fetch 7-Day IoT Data from Supabase</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Current Summary Display */}
            {sensorSummary && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Active Model 02 Sensor Stats</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Avg Temp</Text>
                    <Text style={styles.statVal}>{sensorSummary.avg_temp_c}°C</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Avg Humidity</Text>
                    <Text style={styles.statVal}>{sensorSummary.avg_humidity_rh}%</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Avg Light</Text>
                    <Text style={styles.statVal}>{sensorSummary.avg_light_lux} Lux</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Readings</Text>
                    <Text style={styles.statVal}>{sensorSummary.readings_count || 168}</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 18,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  pickerContainer: {
    gap: 6,
    marginBottom: 8,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  pickerOptionSelected: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  pickerOptionSelectedModule: {
    borderColor: '#ec4899',
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
  },
  pickerText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  fetchBtn: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 14,
  },
  fetchBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    marginBottom: 10,
  },
  summaryTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    padding: 8,
  },
  statLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
  statVal: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  closeBtnText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
});
