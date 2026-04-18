import React, { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, StackActions, NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/RootNavigator';

const SplashScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.dispatch(StackActions.replace('Loading'));
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <Image source={require('../assets/images/app-logo.png')} style={styles.logo} resizeMode="contain" />
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
  logo: {
    width: 150,
    height: 150,
  },
});

export default SplashScreen;
