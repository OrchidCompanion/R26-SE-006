import React from 'react';
import { Sprout, Leaf, Layers, Sparkles, Flower2 } from 'lucide-react';

export default function StageBadge({ stage, size = 'medium' }) {
  let badgeClass = 'badge-stage ';
  let icon = null;
  let label = stage || 'Unknown';

  switch (stage) {
    case 'Seedling':
      badgeClass += 'badge-seedling';
      icon = <Sprout size={size === 'large' ? 18 : 13} style={{ flexShrink: 0 }} />;
      break;
    case 'Vegetative':
      badgeClass += 'badge-vegetative';
      icon = <Leaf size={size === 'large' ? 18 : 13} style={{ flexShrink: 0 }} />;
      break;
    case 'Mature_Pseudobulb':
      badgeClass += 'badge-pseudobulb';
      icon = <Layers size={size === 'large' ? 18 : 13} style={{ flexShrink: 0 }} />;
      label = 'Mature_Pseudobulb';
      break;
    case 'Bud_formation':
      badgeClass += 'badge-bud';
      icon = <Sparkles size={size === 'large' ? 18 : 13} style={{ flexShrink: 0 }} />;
      label = 'Bud_formation';
      break;
    case 'Flowering':
      badgeClass += 'badge-flowering';
      icon = <Flower2 size={size === 'large' ? 18 : 13} style={{ flexShrink: 0 }} />;
      label = 'Flowering';
      break;
    default:
      badgeClass += 'badge-seedling';
      break;
  }

  // Adjust font size dynamically so long text like Mature_Pseudobulb fits cleanly
  const isLongText = label.length > 12;
  const fontSize = size === 'large' ? '0.95rem' : isLongText ? '0.7rem' : '0.775rem';
  const padding = size === 'large' ? '0.5rem 1.1rem' : '0.3rem 0.6rem';

  return (
    <span 
      className={badgeClass} 
      style={{ 
        fontSize, 
        padding, 
        maxWidth: '100%', 
        boxSizing: 'border-box',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}
      title={label}
    >
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </span>
  );
}
