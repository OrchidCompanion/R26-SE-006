import React from 'react';
import { Compass, Flower2, Clock, Calendar, ArrowRight, Activity, ShieldCheck } from 'lucide-react';
import TimelineVisualizer from '../components/TimelineVisualizer';
import StageBadge from '../components/StageBadge';

export default function DashboardPage({ onNavigatePredict, lastPrediction }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Hero Banner */}
      <div className="glass-card" style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(236,72,153,0.12) 100%)',
        border: '1px solid rgba(16,185,129,0.3)',
        padding: '2rem'
      }}>
        <div style={{ maxWidth: '800px' }}>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#34d399',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            background: 'rgba(16,185,129,0.15)',
            padding: '0.3rem 0.75rem',
            borderRadius: '9999px',
            border: '1px solid rgba(16,185,129,0.3)',
            display: 'inline-block',
            marginBottom: '0.75rem'
          }}>
            AI-Powered Home Orchid Care
          </span>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0 0 0.75rem 0', lineHeight: 1.15 }} className="hero-gradient-text">
            Dendrobium Bloom Progression & Flowering Prediction
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Identify your orchid's exact blooming stage using computer vision (Model 01: YOLOv8) and forecast future transition durations to flowering using environmental machine learning (Model 02: Gradient Boosting).
          </p>
          <button className="btn-orchid" onClick={onNavigatePredict} style={{ padding: '0.85rem 1.75rem', fontSize: '1rem' }}>
            <Compass size={18} /> Start New Bloom Prediction
          </button>
        </div>
      </div>

      {/* Dashboard Metrics Cards */}
      <div className="grid-4">
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>CURRENT STAGE</span>
            <Activity size={18} color="var(--emerald-primary)" />
          </div>
          <div style={{ margin: '0.5rem 0' }}>
            {lastPrediction ? (
              <StageBadge stage={lastPrediction.current_stage} size="large" />
            ) : (
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-dim)' }}>Not Analyzed</span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Determined by Model 01 (YOLOv8)
          </span>
        </div>

        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>NEXT STAGE</span>
            <ArrowRight size={18} color="var(--orchid-primary)" />
          </div>
          <div style={{ margin: '0.5rem 0' }}>
            {lastPrediction && lastPrediction.timeline && lastPrediction.timeline.length > 0 ? (
              <StageBadge stage={lastPrediction.timeline[0].to_stage} size="large" />
            ) : lastPrediction && lastPrediction.is_flowering ? (
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f472b6' }}>Flowering Reached</span>
            ) : (
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-dim)' }}>Pending</span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Next transition state
          </span>
        </div>

        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>PREDICTED DAYS</span>
            <Clock size={18} color="#fbbf24" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', margin: '0.2rem 0' }}>
            {lastPrediction ? `${lastPrediction.display_total_days} Days` : '--'}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Predicted by Model 02 (Gradient Boosting)
          </span>
        </div>

        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>ESTIMATED FLOWERING DATE</span>
            <Calendar size={18} color="#f472b6" />
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f472b6', margin: '0.3rem 0' }}>
            {lastPrediction ? lastPrediction.estimated_flowering_date : '--'}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Calendar date forecast
          </span>
        </div>
      </div>

      {/* Visual Blooming Timeline */}
      <TimelineVisualizer
        currentStage={lastPrediction ? lastPrediction.current_stage : 'Mature_Pseudobulb'}
        timeline={lastPrediction ? lastPrediction.timeline : []}
        totalDays={lastPrediction ? lastPrediction.total_days_to_flowering : 0}
        estimatedFloweringDate={lastPrediction ? lastPrediction.estimated_flowering_date : null}
      />
    </div>
  );
}
