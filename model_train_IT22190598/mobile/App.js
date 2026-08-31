import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Home, Sparkles, History, Info } from 'lucide-react-native';

import Header from './src/components/Header';
import DashboardScreen from './src/screens/DashboardScreen';
import PredictScreen from './src/screens/PredictScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ModelInfoScreen from './src/screens/ModelInfoScreen';
import { checkHealth, fetchPredictionHistory } from './src/services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiStatus, setApiStatus] = useState('connecting');
  const [lastPrediction, setLastPrediction] = useState(null);

  useEffect(() => {
    // Check backend health
    checkHealth().then(res => {
      if (res.status === 'healthy') {
        setApiStatus('healthy');
      } else {
        setApiStatus('offline');
      }
    });

    // Fetch initial prediction history from Supabase DB
    fetchPredictionHistory().then(records => {
      if (records && records.length > 0) {
        setLastPrediction(records[0]);
      }
    });
  }, []);

  const handleSavePrediction = (newPred) => {
    setLastPrediction(newPred);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0b131e" />

      {/* Header with Server Host Config */}
      <Header apiStatus={apiStatus} setApiStatus={setApiStatus} />

      {/* Main Tab Screen View */}
      <View style={styles.screenContainer}>
        {activeTab === 'dashboard' && (
          <DashboardScreen
            onNavigatePredict={() => setActiveTab('predict')}
            lastPrediction={lastPrediction}
          />
        )}
        {activeTab === 'predict' && (
          <PredictScreen onSavePrediction={handleSavePrediction} />
        )}
        {activeTab === 'history' && (
          <HistoryScreen key="history_screen" />
        )}
        {activeTab === 'info' && (
          <ModelInfoScreen />
        )}
      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'dashboard' && styles.tabItemActive]}
          onPress={() => setActiveTab('dashboard')}
        >
          <Home size={20} color={activeTab === 'dashboard' ? '#ec4899' : '#64748b'} />
          <Text style={[styles.tabLabel, activeTab === 'dashboard' && styles.tabLabelActive]}>
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'predict' && styles.tabItemActive]}
          onPress={() => setActiveTab('predict')}
        >
          <Sparkles size={20} color={activeTab === 'predict' ? '#ec4899' : '#64748b'} />
          <Text style={[styles.tabLabel, activeTab === 'predict' && styles.tabLabelActive]}>
            Predict
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}
          onPress={() => setActiveTab('history')}
        >
          <History size={20} color={activeTab === 'history' ? '#ec4899' : '#64748b'} />
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]}>
            History
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'info' && styles.tabItemActive]}
          onPress={() => setActiveTab('info')}
        >
          <Info size={20} color={activeTab === 'info' ? '#ec4899' : '#64748b'} />
          <Text style={[styles.tabLabel, activeTab === 'info' && styles.tabLabelActive]}>
            Info
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  </SafeAreaProvider>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b131e',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
  },
  tabLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#ec4899',
  },
});
