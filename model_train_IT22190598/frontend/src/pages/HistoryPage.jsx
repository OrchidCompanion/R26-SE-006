import React from 'react';
import { History, Trash2, Calendar, Clock, ArrowRight, Activity } from 'lucide-react';
import StageBadge from '../components/StageBadge';

export default function HistoryPage({ history, onClearHistory }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 0.4rem 0' }} className="hero-gradient-text">
            Bloom Prediction History
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0 }}>
            Stored record of your previous orchid stage detections and flowering predictions.
          </p>
        </div>

        {history.length > 0 && (
          <button className="btn-danger" onClick={onClearHistory} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Trash2 size={16} /> Clear History
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <History size={48} color="var(--text-dim)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>No History Records Found</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
            Run your first Dendrobium bloom prediction to start building your orchid care log.
          </p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid var(--border-card)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '1rem 1.25rem' }}>Date</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Current Stage</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Next Stage</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Transition Days</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Est. Next Date</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Est. Flowering Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((rec, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-card)', transition: 'background 0.2s ease' }}>
                    <td style={{ padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      {rec.current_date}
                    </td>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <StageBadge stage={rec.current_stage} size="small" />
                    </td>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      {rec.is_flowering ? (
                        <span style={{ fontSize: '0.85rem', color: '#f472b6', fontWeight: 600 }}>Flowering</span>
                      ) : rec.timeline && rec.timeline[0] ? (
                        <StageBadge stage={rec.timeline[0].to_stage} size="small" />
                      ) : (
                        '--'
                      )}
                    </td>
                    <td style={{ padding: '1rem 1.25rem', fontWeight: 700, color: '#fbbf24' }}>
                      {rec.is_flowering ? '0 Days' : `${rec.display_total_days} Days`}
                    </td>
                    <td style={{ padding: '1rem 1.25rem', color: '#38bdf8' }}>
                      {rec.timeline && rec.timeline[0] ? rec.timeline[0].estimated_stage_date : '--'}
                    </td>
                    <td style={{ padding: '1rem 1.25rem', fontWeight: 700, color: '#f472b6' }}>
                      {rec.estimated_flowering_date || '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
