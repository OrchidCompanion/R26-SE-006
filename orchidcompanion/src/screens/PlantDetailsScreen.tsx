import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  ScrollView 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';

// Define the route prop type
type PlantDetailsRouteProp = RouteProp<RootStackParamList, 'PlantDetails'>;

const PlantDetailsScreen = () => {
  const route = useRoute<PlantDetailsRouteProp>();
  const { plantId } = route.params as { plantId: string };

  // This should match the data structure in your HomeScreen
  const plants = [
    { 
      id: '1', 
      name: 'Dendrobium Near Window', 
      species: 'Dendrobium',
      location: 'Near Window',
      bloomingPeriod: 'April 28 - May 02',
      image: require('../assets/images/dendrobium-near-window.jpg') 
    },
    { 
      id: '2', 
      name: 'Kandyan Dance', 
      species: 'Oncidium',
      location: 'Garden',
      bloomingPeriod: 'May 10 - May 25',
      image: require('../assets/images/kandyan-dance.jpg') 
    },
    { 
      id: '3', 
      name: 'White Orchid Plant', 
      species: 'Phalaenopsis',
      location: 'Back Garden',
      bloomingPeriod: 'June 05 - June 20',
      image: require('../assets/images/white-phalaenopsis.jpg') 
    },
  ];

  // Find the specific plant data
  const plant = plants.find(p => p.id === plantId) || plants[0];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Plant Image */}
        <Image source={plant.image} style={styles.mainImage} />

        <View style={styles.infoSection}>
          <Text style={styles.plantTitle}>{plant.name}</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Species:</Text>
            <Text style={styles.detailValue}>{plant.species}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>{plant.location}</Text>
          </View>

          {/* Blooming Period Section */}
          <View style={styles.bloomSection}>
            <Text style={styles.bloomText}>
              Blooming Period : <Text style={styles.bloomDate}>{plant.bloomingPeriod}</Text>
            </Text>
          </View>
        </View>

        {/* Action Buttons Grid */}
        <View style={styles.buttonGrid}>
          <TouchableOpacity style={styles.featureButton}>
            <Text style={styles.featureButtonText}>Identify Disease{'\n'}from Leaf</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.featureButton}>
            <Text style={styles.featureButtonText}>Check{'\n'}Nutrients</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.featureButton, { width: '95%', marginTop: 15 }]}>
            <Text style={styles.featureButtonText}>Predict Bloom Period</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  mainImage: {
    width: '100%',
    height: 300,
    resizeMode: 'cover',
  },
  infoSection: {
    padding: 20,
  },
  plantTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    width: 100,
  },
  detailValue: {
    fontSize: 18,
    color: '#333',
  },
  bloomSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#F0F8FF',
    borderRadius: 10,
    borderLeftWidth: 5,
    borderLeftColor: '#36454F',
  },
  bloomText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  bloomDate: {
    color: '#D2691E', // Earthy orange color for the date
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 15,
  },
  featureButton: {
    width: '45%',
    height: 110,
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#36454F',
    flexShrink: 0,
    // Shadow/Elevation
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  featureButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default PlantDetailsScreen;