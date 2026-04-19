import React, { useEffect } from 'react';
import { 
  ActivityIndicator, 
  StyleSheet, 
  PermissionsAndroid, 
  Platform, 
  Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, StackActions, NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/RootNavigator';

const LoadingScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const requestAppPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        // Define the list of permissions we need
        const permissions = [
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];

        // Handle scoped storage permissions for Android 13 (API 33) and above
        if (Platform.Version >= 33) {
          permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
        } else {
          permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        }

        const granted = await PermissionsAndroid.requestMultiple(permissions);

        // Check if essential permissions were denied
        const cameraGranted = granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED;
        const locationGranted = granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;

        if (!cameraGranted || !locationGranted) {
          Alert.alert(
            "Permissions Required",
            "Orchid Companion needs Camera and Location access to identify species and analyze your orchid's environment.",
            [{ text: "OK", onPress: () => navigation.dispatch(StackActions.replace('Home')) }]
          );
          return;
        }
      } catch (err) {
        console.warn("Permission request error:", err);
      }
    }
    
    // Once permissions are handled, proceed to the Home Screen
    navigation.dispatch(StackActions.replace('Home'));
  };

  useEffect(() => {
    // A small delay to let the UI settle before the permission popups appear
    const timer = setTimeout(() => {
      requestAppPermissions();
    }, 1500);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color="#36454F" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
});

export default LoadingScreen;