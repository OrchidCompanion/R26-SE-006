import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import SplashScreen from '../screens/SplashScreen';
import LoadingScreen from '../screens/LoadingScreen';
import HomeScreen from '../screens/HomeScreen';
import AddPlantScreen from '../screens/AddPlantScreen';
import PlantDetailsScreen from '../screens/PlantDetailsScreen';
import IdentifyPlant from '../screens/IdentifyPlant';
import AnalyseLocation from '../screens/AnalyseLocation';
import FlowerIdentifyScreen from '../screens/FlowerIdentifyScreen';
import PlantIdentifyScreen from '../screens/PlantIdentifyScreen';
import CheckLightIntensity from '../screens/CheckLightIntensity';

export type RootStackParamList = {
  Splash: undefined;
  Loading: undefined;
  Home: undefined;
  AddPlant: undefined;
  PlantDetails: { plantId: string };
  IdentifyPlant: undefined;
  AnalyseLocation: { period?: string; averageLux?: number } | undefined;
  FlowerIdentify: undefined;
  PlantIdentify: undefined;
  CheckLightIntensity: { period: 'morning' | 'afternoon' | 'evening' };
};

const Stack = createStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Loading" component={LoadingScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="AddPlant" component={AddPlantScreen} />
        <Stack.Screen name="PlantDetails" component={PlantDetailsScreen} />
        <Stack.Screen name="IdentifyPlant" component={IdentifyPlant} />
        <Stack.Screen name="AnalyseLocation" component={AnalyseLocation} />
        <Stack.Screen name="FlowerIdentify" component={FlowerIdentifyScreen} />
        <Stack.Screen name="PlantIdentify" component={PlantIdentifyScreen} />
        <Stack.Screen name="CheckLightIntensity" component={CheckLightIntensity} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
