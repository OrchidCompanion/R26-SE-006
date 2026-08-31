import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import DashboardPage from './pages/DashboardPage';
import PredictPage from './pages/PredictPage';
import ModelInfoPage from './pages/ModelInfoPage';
import HistoryPage from './pages/HistoryPage';
import { checkHealth, savePredictionHistory, fetchPredictionHistory, clearPredictionHistory } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiStatus, setApiStatus] = useState('connecting');
  const [history, setHistory] = useState([]);
  const [lastPrediction, setLastPrediction] = useState(null);

  // Load history exclusively from Supabase at mount
  useEffect(() => {
    fetchPredictionHistory().then(remoteRecords => {
      if (Array.isArray(remoteRecords)) {
        setHistory(remoteRecords);
        if (remoteRecords.length > 0) {
          setLastPrediction(remoteRecords[0]);
        }
      }
    }).catch(err => {
      console.error("Failed to fetch prediction history from Supabase", err);
    });

    // Ping health check
    checkHealth().then(res => {
      if (res.status === 'healthy') {
        setApiStatus('healthy');
      } else {
        setApiStatus('offline');
      }
    });
  }, []);

  const handleSavePrediction = (newPred) => {
    setLastPrediction(newPred);
    setHistory(prev => [newPred, ...prev]);

    // Save exclusively to Supabase
    savePredictionHistory(newPred).catch(err => {
      console.warn("Failed to save prediction history to Supabase", err);
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    setLastPrediction(null);
    clearPredictionHistory().catch(err => {
      console.warn("Failed to clear prediction history in Supabase", err);
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} apiStatus={apiStatus} />

      <main style={{ maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem', flex: 1 }}>
        {activeTab === 'dashboard' && (
          <DashboardPage
            onNavigatePredict={() => setActiveTab('predict')}
            lastPrediction={lastPrediction}
          />
        )}

        {activeTab === 'predict' && (
          <PredictPage onSavePrediction={handleSavePrediction} />
        )}

        {activeTab === 'history' && (
          <HistoryPage history={history} onClearHistory={handleClearHistory} />
        )}

        {activeTab === 'info' && (
          <ModelInfoPage />
        )}
      </main>

      <footer style={{
        borderTop: '1px solid var(--border-card)',
        padding: '1.5rem',
        textAlign: 'center',
        color: 'var(--text-dim)',
        fontSize: '0.85rem',
        background: 'rgba(11, 19, 30, 0.9)'
      }}>
        <div>Dendrobium Orchid Bloom Prediction System &copy; 2026</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Powered by RF-DETR (checkpoint_best_total.pth) & Scikit-Learn Gradient Boosting (gradient_boosting_experiment.joblib)
        </div>
      </footer>
    </div>
  );
}
