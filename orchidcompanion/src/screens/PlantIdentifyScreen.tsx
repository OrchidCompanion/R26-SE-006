import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';

const PlantIdentifyScreen = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<string>("Species Can't Identify");
  const [isIdentified, setIsIdentified] = useState(false);

  const resetIdentification = () => {
    setIsIdentified(false);
  };

  const handleCamera = async () => {
    const result: ImagePickerResponse = await launchCamera({
      mediaType: 'photo',
      quality: 1,
      saveToPhotos: true,
    });

    if (result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri || null);
      resetIdentification();
    }
  };

  const handleGallery = async () => {
    const result: ImagePickerResponse = await launchImageLibrary({
      mediaType: 'photo',
      quality: 1,
    });

    if (result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri || null);
      resetIdentification();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Identify Orchid Species</Text>
        <Text style={styles.headerTitle}>Without Flowers</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.imageContainer}>
          {selectedImage ? (
            <Image source={{ uri: selectedImage }} style={styles.previewImage} />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>No Image Selected</Text>
            </View>
          )}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCamera}>
            <Text style={styles.buttonText}>Capture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.uploadBtn]} onPress={handleGallery}>
            <Text style={styles.buttonText}>Upload</Text>
          </TouchableOpacity>
        </View>

        {/* New Identify Button */}
        <TouchableOpacity 
          style={[
            styles.identifyBtn, 
            !selectedImage && styles.disabledBtn
          ]} 
          onPress={() => setIsIdentified(true)}
          disabled={!selectedImage}
        >
          <Text style={styles.buttonText}>Identify Species</Text>
        </TouchableOpacity>

        {/* Conditional AI Output Section */}
        {isIdentified && (
          <View style={styles.resultSection}>
            <Text style={styles.resultLabel}>Identification Result:</Text>
            <View style={styles.resultBox}>
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
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#333',
    marginBottom: 8
 },
  content: { padding: 20, alignItems: 'center' },
  imageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholder: { alignItems: 'center' },
  placeholderText: { color: '#888', fontSize: 16 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
  actionButton: {
    flex: 0.48,
    backgroundColor: '#36454F',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 2,
  },
  uploadBtn: { backgroundColor: '#36454F' },
  identifyBtn: {
    width: '100%',
    backgroundColor: '#36454F',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 10,
    elevation: 3,
  },
  disabledBtn: {
    backgroundColor: '#BDBDBD',
    elevation: 0,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  resultSection: { width: '100%', marginTop: 20 },
  resultLabel: { fontSize: 16, color: '#666', marginBottom: 10 },
  resultBox: {
    padding: 20,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  resultText: { fontSize: 18, fontWeight: '600', color: '#d32f2f' },
});

export default PlantIdentifyScreen;