import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const STAGE_CONFIGS = {
  Seedling: { label: 'Seedling', bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#60a5fa' },
  Vegetative: { label: 'Vegetative', bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#34d399' },
  Mature_Pseudobulb: { label: 'Mature Pseudobulb', bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#fbbf24' },
  Bud_formation: { label: 'Bud Formation', bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', text: '#c084fc' },
  Flowering: { label: 'Flowering', bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#f472b6' },
};

export default function StageBadge({ stage, size = 'medium' }) {
  const config = STAGE_CONFIGS[stage] || {
    label: stage || 'Unknown',
    bg: 'rgba(100, 116, 139, 0.15)',
    border: '#64748b',
    text: '#94a3b8',
  };

  const isSmall = size === 'small';

  return (
    <View style={[
      styles.badge,
      { backgroundColor: config.bg, borderColor: config.border },
      isSmall && styles.badgeSmall
    ]}>
      <Text style={[
        styles.text,
        { color: config.text },
        isSmall && styles.textSmall
      ]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'center',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  textSmall: {
    fontSize: 11,
    fontWeight: '600',
  },
});
