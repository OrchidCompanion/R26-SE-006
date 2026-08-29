import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Sparkles, Calendar, Layers, Activity, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import StageBadge from '../components/StageBadge';

const STAGES = ["Seedling", "Vegetative", "Mature_Pseudobulb", "Bud_formation", "Flowering"];

export default function DashboardScreen({ onNavigatePredict, lastPrediction }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Welcome Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroBadge}>
          <Sparkles size={14} color="#ec4899" />
          <Text style={styles.heroBadgeText}>AI Botanical Intelligence</Text>
        </View>

        <Text style={styles.heroTitle}>Dendrobium Orchid Bloom Predictor</Text>
        <Text style={styles.heroDesc}>
          Multi-model machine learning pipeline predicting 5 blooming progression stages and total days to full flowering with ±5 days date range window.
        </Text>

        <TouchableOpacity style={styles.ctaBtn} onPress={onNavigatePredict} activeOpacity={0.8}>
          <Sparkles size={18} color="#ffffff" />
          <Text style={styles.ctaBtnText}>Start Stage Prediction</Text>
          <ArrowRight size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Last Prediction Summary Card */}
      {lastPrediction && (
        <View style={styles.lastPredCard}>
          <View style={styles.cardHeader}>
            <Activity size={16} color="#34d399" />
            <Text style={styles.cardTitle}>Latest Prediction</Text>
          </View>
          <View style={styles.lastPredContent}>
            <View>
              <Text style={styles.lastPredLabel}>Current Stage</Text>
              <View style={{ marginTop: 4 }}>
                <StageBadge stage={lastPrediction.current_stage} size="small" />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.lastPredLabel}>Target Flowering Window</Text>
              <Text style={styles.lastPredDate}>
                {lastPrediction.flowering_date_range_display || lastPrediction.estimated_flowering_date}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* 5 Blooming Progression Stages Guide */}
      <View style={styles.stagesSection}>
        <Text style={styles.sectionTitle}>5 Dendrobium Blooming Stages</Text>
        <Text style={styles.sectionSub}>Sequential progression from seedling to full bloom</Text>

        <View style={styles.stagesList}>
          {STAGES.map((st, i) => (
            <View key={st} style={styles.stageRow}>
              <View style={styles.stageNumBadge}>
                <Text style={styles.stageNumText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <StageBadge stage={st} size="small" />
              </View>
              <CheckCircle2 size={16} color="#34d399" />
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
  heroCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.3)',
    padding: 20,
    marginBottom: 16,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  heroBadgeText: {
    color: '#f472b6',
    fontSize: 11,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    lineHeight: 28,
  },
  heroDesc: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  ctaBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  lastPredCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  cardTitle: {
    color: '#34d399',
    fontSize: 14,
    fontWeight: '800',
  },
  lastPredContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastPredLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  lastPredDate: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  stagesSection: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  sectionSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 14,
  },
  stagesList: {
    gap: 10,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  stageNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageNumText: {
    color: '#f472b6',
    fontSize: 12,
    fontWeight: '800',
  },
});
