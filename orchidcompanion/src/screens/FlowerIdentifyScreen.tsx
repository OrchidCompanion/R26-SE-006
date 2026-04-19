import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary, ImagePickerResponse, CameraOptions, ImageLibraryOptions } from 'react-native-image-picker';

const FlowerIdentifyScreen = () => {
  const [flowerImage, setFlowerImage] = useState<string | null>(null);
  const [leafImage, setLeafImage] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<string>("Species Can't Identify");
  const [isIdentified, setIsIdentified] = useState(false);

  // Helper to handle image selection for both types
  const handleImagePick = async (type: 'flower' | 'leaf', method: 'camera' | 'library') => {
    let result: ImagePickerResponse;

    if (method === 'camera') {
      const cameraOptions: CameraOptions = {
        mediaType: 'photo',
        quality: 1,
        saveToPhotos: true,
      };
      result = await launchCamera(cameraOptions);
    } else {
      const libraryOptions: ImageLibraryOptions = {
        mediaType: 'photo',
        quality: 1,
      };
      result = await launchImageLibrary(libraryOptions);
    }

    if (result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri || null;
      if (type === 'flower') setFlowerImage(uri);
      else setLeafImage(uri);
      setIsIdentified(false);
    }
  };

  const canIdentify = flowerImage && leafImage;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Identify Orchid Species</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Section 1: Flower Image */}
        <View style={styles.section}>
          <Text style={styles.label}>1. Photo of Flower</Text>
          <View style={styles.miniImageContainer}>
            {flowerImage ? (
              <Image source={{ uri: flowerImage }} style={styles.previewImage} />
            ) : (
              <Text style={styles.placeholderText}>No Flower Image</Text>
            )}
          </View>
          <View style={styles.miniButtonRow}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => handleImagePick('flower', 'camera')}>
              <Text style={styles.smallBtnText}>Capture</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallBtn, styles.galleryColor]} onPress={() => handleImagePick('flower', 'library')}>
              <Text style={styles.smallBtnText}>Upload</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 2: Plant/Leaf Image */}
        <View style={styles.section}>
          <Text style={styles.label}>2. Photo of Plant & Leaves</Text>
          <View style={styles.miniImageContainer}>
            {leafImage ? (
              <Image source={{ uri: leafImage }} style={styles.previewImage} />
            ) : (
              <Text style={styles.placeholderText}>No Plant Image</Text>
            )}
          </View>
          <View style={styles.miniButtonRow}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => handleImagePick('leaf', 'camera')}>
              <Text style={styles.smallBtnText}>Capture</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallBtn, styles.galleryColor]} onPress={() => handleImagePick('leaf', 'library')}>
              <Text style={styles.smallBtnText}>Upload</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Identify Button */}
        <TouchableOpacity
          style={[styles.identifyBtn, !canIdentify && styles.disabledBtn]}
          onPress={() => setIsIdentified(true)}
          disabled={!canIdentify}
        >
          <Text style={styles.buttonText}>Identify Species</Text>
        </TouchableOpacity>

        {/* AI Output Section */}
        {isIdentified && (
          <View style={styles.resultSection}>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>AI Analysis:</Text>
              <Text style={styles.resultText}>{aiResult}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  content: { paddingHorizontal: 20, paddingVertical: 10 },
  section: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6 },
  miniImageContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholderText: { color: '#aaa', fontSize: 12 },
  miniButtonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  smallBtn: {
    flex: 0.48,
    backgroundColor: '#36454F',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  galleryColor: { backgroundColor: '#36454F' },
  smallBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  identifyBtn: {
    backgroundColor: '#36454F',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
    elevation: 2,
  },
  disabledBtn: { backgroundColor: '#ccc', elevation: 0 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  resultSection: { marginTop: 15 },
  resultBox: {
    padding: 12,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffcdd2',
    alignItems: 'center',
  },
  resultLabel: { fontSize: 12, color: '#c62828', fontWeight: 'bold', marginBottom: 2 },
  resultText: { fontSize: 16, fontWeight: '700', color: '#b71c1c' },
});

export default FlowerIdentifyScreen;