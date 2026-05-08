import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';

const IdentifyPlant = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Does your orchid have flowers?</Text>
        
        <View style={styles.buttonContainer}>
          {/* Option: With Flowers */}
          <TouchableOpacity 
            style={styles.choiceButton}
            onPress={() => navigation.navigate('FlowerIdentify')}
          >
            <Image 
              source={require('../assets/images/plant-with-flower.jpg')} 
              style={styles.image} 
            />
            <Text style={styles.buttonText}>Yes, it has flowers</Text>
          </TouchableOpacity>

          {/* Option: Without Flowers */}
          <TouchableOpacity 
            style={styles.choiceButton}
            onPress={() => navigation.navigate('PlantIdentify' as any)}
          >
            <Image 
              source={require('../assets/images/plant-with-out-flower.jpg')} 
              style={styles.image} 
            />
            <Text style={styles.buttonText}>No flowers yet</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  buttonContainer: {
    width: '100%',
    gap: 20, // Adds spacing between the buttons
  },
  choiceButton: {
    backgroundColor: '#fff',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden', // Ensures image corners follow border radius
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '80%',
    height: 280,
    resizeMode: 'cover',
  },
  buttonText: {
    padding: 15,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#333',
  },
});

export default IdentifyPlant;