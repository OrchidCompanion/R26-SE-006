import React from 'react';
import { Flower2, LayoutDashboard, Compass, History, Info } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, apiStatus }) {
  return (
    <header style={{
      borderBottom: '1px solid var(--border-card)',
      background: 'rgba(11, 19, 30, 0.9)',
      backdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      padding: '0.75rem 1.25rem'
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setActiveTab('dashboard')}>
          <div style={{
            background: 'linear-gradient(135deg, #10b981 0%, #ec4899 100%)',
            padding: '0.5rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)'
          }}>
            <Flower2 size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, lineHeight: 1.1 }} className="hero-gradient-text">
              Dendrobium Bloom AI
            </h1>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Stage & Flowering Forecast
            </span>
          </div>
        </div>

        {/* Navigation Tabs Container */}
        <nav className="nav-tabs-scroll" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'nowrap' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
          >
            <LayoutDashboard size={15} />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab('predict')}
            className={activeTab === 'predict' ? 'btn-orchid' : 'btn-secondary'}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
          >
            <Compass size={15} />
            Predict Bloom
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
          >
            <History size={15} />
            History
          </button>

          <button
            onClick={() => setActiveTab('info')}
            className={activeTab === 'info' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
          >
            <Info size={15} />
            Model Info
          </button>
        </nav>

        {/* API Status Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.75rem',
          background: 'rgba(255,255,255,0.04)',
          padding: '0.3rem 0.65rem',
          borderRadius: '9999px',
          border: '1px solid var(--border-card)'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: apiStatus === 'healthy' ? '#10b981' : '#ef4444',
            boxShadow: apiStatus === 'healthy' ? '0 0 8px #10b981' : '0 0 8px #ef4444'
          }} />
          <span style={{ color: 'var(--text-muted)' }}>
            API: {apiStatus === 'healthy' ? 'Online' : 'Connecting...'}
          </span>
        </div>
      </div>
    </header>
  );
}
