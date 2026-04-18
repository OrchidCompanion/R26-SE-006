import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';

// Reusable Plant Item Component
interface PlantItemProps {
  id: string;
  name: string;
  onPress: (id: string) => void;
}

const PlantItem = ({ id, name, onPress }: PlantItemProps) => (
  <TouchableOpacity style={styles.plantItem} onPress={() => onPress(id)}>
    <View style={styles.imagePlaceholder} />
    <Text style={styles.plantName}>{name}</Text>
    <Text style={styles.chevron}>{'>'}</Text>
  </TouchableOpacity>
);

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // Mock datar
  const plants = [
    { id: '1', name: 'Phalaenopsis' },
    { id: '2', name: 'Cattleya' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orchid Companion</Text>
      </View>

      {/* Scrollable Section */}
      <ScrollView style={styles.scrollSection} contentContainerStyle={styles.scrollContent}>
        {plants.map((plant) => (
          <PlantItem 
            key={plant.id} 
            id={plant.id} 
            name={plant.name} 
            onPress={(id) => navigation.navigate('PlantDetails' as any, { plantId: id })} 
          />
        ))}

        {/* Add New Plant Button */}
        <TouchableOpacity 
          style={styles.addButton} 
          onPress={() => navigation.navigate('AddPlant' as any)}
        >
          <Text style={styles.addButtonText}>⊕ Add New Plant</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom Feature Buttons */}
      <View style={styles.bottomActions}>
        <TouchableOpacity 
          style={styles.featureButton}
          onPress={() => navigation.navigate('IdentifyPlant' as any)}
        >
          <Text style={styles.featureButtonText}>Identify{'\n'}Plant</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.featureButton}
          onPress={() => navigation.navigate('AnalyseLocation' as any)}
        >
          <Text style={styles.featureButtonText}>Analyse{'\n'}Location</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollSection: {
    flex: 1,
  },
  scrollContent: {
    padding: 15,
  },
  plantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imagePlaceholder: {
    width: 60,
    height: 60,
    backgroundColor: '#e1e1e1',
    borderRadius: 8,
    marginRight: 15,
  },
  plantName: {
    flex: 1,
    fontSize: 18,
    color: '#333',
  },
  chevron: {
    fontSize: 20,
    color: '#999',
    fontWeight: 'bold',
  },
  addButton: {
    borderWidth: 1,
    borderColor: '#333',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
  },
  featureButton: {
    width: '45%',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  featureButtonText: {
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
});

export default HomeScreen;