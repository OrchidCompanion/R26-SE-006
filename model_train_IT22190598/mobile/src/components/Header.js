import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Flower2, Settings, Wifi, Check, X } from 'lucide-react-native';
import { getBaseUrl, setBaseUrl, checkHealth } from '../services/api';

export default function Header({ apiStatus, setApiStatus }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [hostInput, setHostInput] = useState(getBaseUrl());

  const handleSaveHost = async () => {
    const updatedUrl = setBaseUrl(hostInput);
    setHostInput(updatedUrl);
    setModalVisible(false);

    setApiStatus('connecting');
    const health = await checkHealth();
    if (health.status === 'healthy') {
      setApiStatus('healthy');
    } else {
      setApiStatus('offline');
    }
  };

  return (
    <View style={styles.header}>
      <View style={styles.leftRow}>
        <View style={styles.logoBadge}>
          <Flower2 size={22} color="#ec4899" />
        </View>
        <View>
          <Text style={styles.title}>Dendrobium AI</Text>
          <Text style={styles.subtitle}>Bloom Prediction System</Text>
        </View>
      </View>

      <View style={styles.rightRow}>
        {/* Status indicator */}
        <View style={[
          styles.statusBadge,
          apiStatus === 'healthy' ? styles.statusGreen : styles.statusRed
        ]}>
          <View style={[
            styles.dot,
            apiStatus === 'healthy' ? { backgroundColor: '#10b981' } : { backgroundColor: '#ef4444' }
          ]} />
          <Text style={styles.statusText}>
            {apiStatus === 'healthy' ? 'API Online' : 'Offline'}
          </Text>
        </View>

        {/* Server IP Config Button */}
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Settings size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Backend IP Settings Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Wifi size={20} color="#ec4899" />
                <Text style={styles.modalTitle}>Backend Server Host</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>
              Enter your PC's IP address (e.g. 192.168.1.10:8000) when running with Expo Go on mobile.
            </Text>

            <TextInput
              style={styles.input}
              value={hostInput}
              onChangeText={setHostInput}
              placeholder="http://192.168.1.X:8000/api/v1"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveHost}>
              <Check size={18} color="#ffffff" />
              <Text style={styles.saveBtnText}>Connect to Backend</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(11, 19, 30, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 11,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '700',
  },
  settingsBtn: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  modalHint: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 16,
  },
  input: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 13,
    marginBottom: 14,
  },
  saveBtn: {
    backgroundColor: '#ec4899',
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
