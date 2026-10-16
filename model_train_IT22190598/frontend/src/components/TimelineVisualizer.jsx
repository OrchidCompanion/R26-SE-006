import React from 'react';
import { ArrowRight, Clock, Calendar, Sparkles, CheckCircle } from 'lucide-react';
import StageBadge from './StageBadge';

const STAGE_ORDER = ["Seedling", "Vegetative", "Mature_Pseudobulb", "Bud_formation", "Flowering"];

export default function TimelineVisualizer({ currentStage, timeline = [], totalDays = 0, estimatedFloweringDate = null, floweringDateRangeDisplay = null }) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} color="var(--orchid-primary)" />
            Dendrobium Blooming Progression Timeline
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Estimated arrival date windows per stage with transition durations shown on connecting arrows.
          </p>
        </div>

        {estimatedFloweringDate && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(147,51,234,0.15) 100%)',
            border: '1px solid rgba(236,72,153,0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1.25rem',
            textAlign: 'right',
            width: '100%',
            maxWidth: '340px'
          }}>
            <span style={{ fontSize: '0.75rem', color: '#f472b6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3rem' }}>
              <Calendar size={13} /> Final Flowering Window
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8', margin: '0.3rem 0' }}>
              {floweringDateRangeDisplay || estimatedFloweringDate}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({Math.round(totalDays)} total days remaining)
            </div>
          </div>
        )}
      </div>

      {/* Responsive Stage Progression Sequence */}
      <div style={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflowX: 'auto',
        padding: '1rem 0.25rem',
        gap: '0.4rem',
        WebkitOverflowScrolling: 'touch'
      }}>
        {STAGE_ORDER.map((stageName, idx) => {
          const isCurrent = stageName === currentStage;
          const isPast = currentIdx > -1 && idx < currentIdx;
          const isNext = currentIdx > -1 && idx === currentIdx + 1;

          // Step where plant arrives at THIS stage
          const arrivalStep = timeline.find(step => step.to_stage === stageName);
          // Step where plant transitions FROM this stage to next stage
          const transitionStep = timeline.find(step => step.from_stage === stageName);

          return (
            <React.Fragment key={stageName}>
              {/* Stage Card */}
              <div style={{
                flex: '1 0 190px',
                minWidth: '190px',
                maxWidth: '230px',
                background: isCurrent ? 'rgba(16, 185, 129, 0.15)' : isNext ? 'rgba(236, 72, 153, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                border: isCurrent ? '2px solid var(--emerald-primary)' : isNext ? '2px dashed var(--orchid-primary)' : '1px solid var(--border-card)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 0.65rem',
                textAlign: 'center',
                position: 'relative',
                transition: 'all 0.3s ease',
                boxSizing: 'border-box',
                boxShadow: isCurrent ? '0 0 20px var(--emerald-glow)' : 'none'
              }}>
                <div style={{ marginBottom: '0.4rem', display: 'flex', justifyContent: 'center', width: '100%', overflow: 'hidden' }}>
                  <StageBadge stage={stageName} size="small" />
                </div>

                <div style={{ fontSize: '0.675rem', fontWeight: 700, color: isCurrent ? '#34d399' : isNext ? '#f472b6' : isPast ? 'var(--text-muted)' : 'var(--text-dim)', letterSpacing: '0.02em', marginBottom: '0.5rem' }}>
                  {isCurrent ? "● CURRENT STAGE" : isNext ? "➜ NEXT STAGE" : isPast ? "COMPLETED" : "UPCOMING"}
                </div>

                {/* Date Window Box for Stage Arrival */}
                <div style={{
                  borderTop: '1px solid var(--border-card)',
                  paddingTop: '0.5rem',
                  fontSize: '0.75rem'
                }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>
                    {isCurrent ? "Active Stage" : isPast ? "Status" : "Target Arrival Window"}
                  </div>

                  {isCurrent ? (
                    <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700, background: 'rgba(52,211,153,0.12)', padding: '0.35rem', borderRadius: 'var(--radius-sm)' }}>
                      Active Today
                    </div>
                  ) : isPast ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      <CheckCircle size={12} style={{ display: 'inline', marginRight: '3px' }} /> Passed
                    </div>
                  ) : arrivalStep ? (
                    <div style={{
                      fontSize: '0.7rem',
                      color: '#38bdf8',
                      background: 'rgba(56,189,248,0.12)',
                      padding: '0.35rem 0.25rem',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 700,
                      lineHeight: 1.3
                    }}>
                      {arrivalStep.date_range_display || arrivalStep.estimated_stage_date}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>--</div>
                  )}
                </div>
              </div>

              {/* Connecting Transition Arrow with Duration Pill */}
              {idx < STAGE_ORDER.length - 1 && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  padding: '0 0.15rem',
                  minWidth: '70px'
                }}>
                  {transitionStep ? (
                    <div style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      color: '#fbbf24',
                      background: 'rgba(251,191,36,0.15)',
                      border: '1px solid rgba(251,191,36,0.3)',
                      borderRadius: '12px',
                      padding: '0.2rem 0.45rem',
                      marginBottom: '0.2rem',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.2rem'
                    }}>
                      <Clock size={10} /> {transitionStep.display_days}d
                    </div>
                  ) : (
                    <div style={{ height: '18px' }} />
                  )}

                  <div style={{ color: idx < currentIdx ? 'var(--emerald-primary)' : transitionStep ? '#f472b6' : 'var(--text-dim)' }}>
                    <ArrowRight size={18} />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
