import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { History, Trash2, Calendar, Clock, RefreshCw } from 'lucide-react-native';
import StageBadge from '../components/StageBadge';
import { fetchPredictionHistory, clearPredictionHistory } from '../services/api';

export default function HistoryScreen() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await fetchPredictionHistory();
      setRecords(data || []);
    } catch (e) {
      console.error("Failed to load history", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleClear = () => {
    Alert.alert(
      "Clear History",
      "Are you sure you want to delete all prediction records stored in Supabase?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            await clearPredictionHistory();
            setRecords([]);
            setLoading(false);
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <History size={20} color="#ec4899" />
            <Text style={styles.screenTitle}>Bloom Prediction History</Text>
          </View>
          <Text style={styles.screenDesc}>
            Stored record of your previous orchid stage detections and flowering predictions from Supabase DB.
          </Text>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={loadHistory}>
          <RefreshCw size={16} color="#38bdf8" />
        </TouchableOpacity>
      </View>

      {records.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Trash2 size={14} color="#ef4444" />
          <Text style={styles.clearBtnText}>Clear Supabase History</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color="#ec4899" size="large" />
        </View>
      ) : records.length === 0 ? (
        <View style={styles.emptyCard}>
          <History size={40} color="#475569" style={{ marginBottom: 10 }} />
          <Text style={styles.emptyTitle}>No History Records Found</Text>
          <Text style={styles.emptySub}>
            Run your first Dendrobium bloom prediction to start building your cloud log.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {records.map((rec, i) => (
            <View key={rec.id || i} style={styles.historyCard}>
              <View style={styles.cardTopRow}>
                <Text style={styles.dateText}>{rec.created_at ? rec.created_at.slice(0, 10) : rec.current_date || '--'}</Text>
                <StageBadge stage={rec.current_stage} size="small" />
              </View>

              <View style={styles.cardBodyRow}>
                <View>
                  <Text style={styles.label}>Target Flowering Window</Text>
                  <Text style={styles.floweringDate}>
                    {rec.flowering_date_range_display || rec.estimated_flowering_date || '--'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.label}>Est. Time</Text>
                  <Text style={styles.daysText}>{rec.display_total_days || '--'} Days</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  screenTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  screenDesc: {
    color: '#94a3b8',
    fontSize: 12,
  },
  refreshBtn: {
    padding: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  clearBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  centerContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 30,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
  list: {
    gap: 10,
  },
  historyCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  dateText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  floweringDate: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  daysText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
});
