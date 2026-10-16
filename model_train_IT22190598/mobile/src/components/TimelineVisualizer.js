import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Sparkles, Calendar, Clock, ArrowRight, CheckCircle } from 'lucide-react-native';
import StageBadge from './StageBadge';

const STAGE_ORDER = ["Seedling", "Vegetative", "Mature_Pseudobulb", "Bud_formation", "Flowering"];

export default function TimelineVisualizer({
  currentStage,
  timeline = [],
  totalDays = 0,
  estimatedFloweringDate = null,
  floweringDateRangeDisplay = null
}) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Sparkles size={18} color="#ec4899" />
            <Text style={styles.title}>Progression Timeline</Text>
          </View>
          <Text style={styles.subtitle}>
            Predicted arrival date windows with transition duration pills on connecting arrows.
          </Text>
        </View>
      </View>

      {estimatedFloweringDate && (
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>Target Flowering Window</Text>
          <Text style={styles.bannerValue}>
            {floweringDateRangeDisplay || estimatedFloweringDate}
          </Text>
          <Text style={styles.bannerSub}>
            ({Math.round(totalDays)} total days remaining)
          </Text>
        </View>
      )}

      {/* Horizontal Stage Progression Sequence */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {STAGE_ORDER.map((stageName, idx) => {
          const isCurrent = stageName === currentStage;
          const isPast = currentIdx > -1 && idx < currentIdx;
          const isNext = currentIdx > -1 && idx === currentIdx + 1;

          const arrivalStep = timeline.find(step => step.to_stage === stageName);
          const transitionStep = timeline.find(step => step.from_stage === stageName);

          return (
            <React.Fragment key={stageName}>
              {/* Stage Card */}
              <View style={[
                styles.stageCard,
                isCurrent && styles.stageCardCurrent,
                isNext && styles.stageCardNext,
              ]}>
                <StageBadge stage={stageName} size="small" />

                <Text style={[
                  styles.statusText,
                  isCurrent && { color: '#34d399' },
                  isNext && { color: '#f472b6' },
                  isPast && { color: '#64748b' }
                ]}>
                  {isCurrent ? "● CURRENT" : isNext ? "➜ NEXT" : isPast ? "COMPLETED" : "UPCOMING"}
                </Text>

                <View style={styles.divider} />

                <Text style={styles.boxLabel}>
                  {isCurrent ? "Active Stage" : isPast ? "Status" : "Target Arrival Window"}
                </Text>

                {isCurrent ? (
                  <View style={styles.activePill}>
                    <Text style={styles.activePillText}>Active Today</Text>
                  </View>
                ) : isPast ? (
                  <Text style={styles.passedText}>Passed</Text>
                ) : arrivalStep ? (
                  <View style={styles.rangeBox}>
                    <Text style={styles.rangeBoxText}>
                      {arrivalStep.date_range_display || arrivalStep.estimated_stage_date}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.emptyText}>--</Text>
                )}
              </View>

              {/* Connecting Transition Arrow with Duration Pill */}
              {idx < STAGE_ORDER.length - 1 && (
                <View style={styles.arrowContainer}>
                  {transitionStep ? (
                    <View style={styles.durationPill}>
                      <Clock size={10} color="#fbbf24" />
                      <Text style={styles.durationText}>{transitionStep.display_days}d</Text>
                    </View>
                  ) : (
                    <View style={{ height: 16 }} />
                  )}
                  <ArrowRight size={18} color={idx < currentIdx ? "#10b981" : transitionStep ? "#f472b6" : "#475569"} />
                </View>
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 12,
  },
  banner: {
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    borderColor: 'rgba(236, 72, 153, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  bannerLabel: {
    color: '#f472b6',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bannerValue: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '800',
    marginVertical: 2,
  },
  bannerSub: {
    color: '#94a3b8',
    fontSize: 11,
  },
  scrollContent: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  stageCard: {
    width: 175,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  stageCardCurrent: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#10b981',
    borderWidth: 2,
  },
  stageCardNext: {
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
    borderColor: '#ec4899',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    marginVertical: 8,
  },
  boxLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  activePill: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activePillText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  passedText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  rangeBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  rangeBoxText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: '#475569',
    fontSize: 11,
  },
  arrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 3,
  },
  durationText: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: '800',
  },
});
