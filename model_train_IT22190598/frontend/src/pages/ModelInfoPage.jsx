import React from 'react';
import { Cpu, Layers, ShieldCheck, Database, FileCode, CheckCircle } from 'lucide-react';
import StageBadge from '../components/StageBadge';

export default function ModelInfoPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 0.4rem 0' }} className="hero-gradient-text">
          Machine Learning Model Specifications
        </h2>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0 }}>
          Technical architecture, algorithm details, feature vectors, and blooming stage progression sequence.
        </p>
      </div>

      <div className="grid-2">
        {/* Model 01 Specs */}
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ background: 'rgba(16,185,129,0.2)', padding: '0.6rem', borderRadius: '12px' }}>
              <Cpu size={24} color="var(--emerald-primary)" />
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                STAGE IDENTIFICATION MODEL
              </span>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
                Model 01: Computer Vision
              </h3>
            </div>
          </div>

          <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse', marginBottom: '1.25rem' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Algorithm</td>
                <td style={{ padding: '0.6rem 0', fontWeight: 700, textAlign: 'right' }}>YOLOv8</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Model File</td>
                <td style={{ padding: '0.6rem 0', fontWeight: 700, textAlign: 'right', fontFamily: 'monospace', color: '#38bdf8' }}>best.pt</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Purpose</td>
                <td style={{ padding: '0.6rem 0', textAlign: 'right' }}>Identify current blooming stage from 3 orchid images</td>
              </tr>
              <tr>
                <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Decision Method</td>
                <td style={{ padding: '0.6rem 0', textAlign: 'right' }}>Confidence-Weighted Majority Voting</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '1rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
              Recognized Blooming Stages
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {["Seedling", "Vegetative", "Mature_Pseudobulb", "Bud_formation", "Flowering"].map(st => (
                <StageBadge key={st} stage={st} size="small" />
              ))}
            </div>
          </div>
        </div>

        {/* Model 02 Specs */}
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ background: 'rgba(236,72,153,0.2)', padding: '0.6rem', borderRadius: '12px' }}>
              <Layers size={24} color="var(--orchid-primary)" />
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#f472b6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                BLOOM TRANSITION MODEL
              </span>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
                Model 02: Gradient Boosting
              </h3>
            </div>
          </div>

          <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse', marginBottom: '1.25rem' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Algorithm</td>
                <td style={{ padding: '0.6rem 0', fontWeight: 700, textAlign: 'right' }}>Gradient Boosting Regressor Pipeline</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Model File</td>
                <td style={{ padding: '0.6rem 0', fontWeight: 700, textAlign: 'right', fontFamily: 'monospace', color: '#f472b6' }}>gradient_boosting_experiment.joblib</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-card)' }}>
                <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Purpose</td>
                <td style={{ padding: '0.6rem 0', textAlign: 'right' }}>Predict stage transition duration in days</td>
              </tr>
              <tr>
                <td style={{ padding: '0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Input Features</td>
                <td style={{ padding: '0.6rem 0', fontWeight: 700, textAlign: 'right' }}>15 Exact Ordered Features</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '1rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
              Required Feature Vector Order (15 Features)
            </span>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '0.75rem', color: '#38bdf8', lineHeight: 1.6 }}>
              [current_stage, month, day_of_year, avg_temp_c, min_temp_c, max_temp_c, temp_std_c, avg_humidity_rh, min_humidity_rh, max_humidity_rh, humidity_std_rh, avg_light_lux, min_light_lux, max_light_lux, light_std_lux]
            </div>
          </div>
        </div>
      </div>

      {/* Security & Integrity Box */}
      <div className="glass-card" style={{ background: 'rgba(15, 23, 42, 0.6)' }}>
        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={20} color="var(--emerald-primary)" /> Model Security & Governance
        </h4>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Model weights (<code>best.pt</code> and <code>gradient_boosting_experiment.joblib</code>) are securely loaded once into server memory at API startup. Model endpoints validate all input payloads to ensure research integrity and prevent model file exposure.
        </p>
      </div>
    </div>
  );
}
