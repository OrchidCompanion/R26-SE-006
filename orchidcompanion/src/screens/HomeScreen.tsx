import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';

interface PlantItemProps {
  id: string;
  name: string;
  image: ImageSourcePropType;
  onPress: (id: string) => void;
}

const PlantItem = ({ id, name, image, onPress }: PlantItemProps) => (
  <TouchableOpacity style={styles.plantItem} onPress={() => onPress(id)}>
    <Image source={image} style={styles.plantImage} />
    <Text style={styles.plantName}>{name}</Text>
    <Text style={styles.chevron}>{'>'}</Text>
  </TouchableOpacity>
);

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // Updated Mock Data with image requirements
  const plants = [
    { 
      id: '1', 
      name: 'Dendrobium Near Window', 
      image: require('../assets/images/dendrobium-near-window.jpg') 
    },
    { 
      id: '2', 
      name: 'Kandyan Dance', 
      image: require('../assets/images/kandyan-dance.jpg') 
    },
    { 
      id: '3', 
      name: 'White Orchid Plant', 
      image: require('../assets/images/white-phalaenopsis.jpg') 
    },
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
            image={plant.image} // Pass the image here
            onPress={(id) => navigation.navigate('PlantDetails' as any, { plantId: id })} 
          />
        ))}

        {/* Add New Plant Button */}
        <TouchableOpacity 
          style={styles.addButton} 
        >
          <Text style={styles.addButtonText}>⊕ Add New Plant</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom Feature Buttons remains the same */}
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
  // Replaced imagePlaceholder with plantImage
  plantImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
    backgroundColor: '#f0f0f0', // Fallback color while loading
  },
  plantName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: '#36454F'
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff'
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
    backgroundColor: '#36454F'
  },
  featureButtonText: {
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: '#fff'
  },
});

export default HomeScreen;