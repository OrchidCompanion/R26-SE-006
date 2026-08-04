import { useEffect } from "react";
import { View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(
    () => {
      const timer = setTimeout(() => {
        router.replace("/login");
      }, 3000);

      return () => clearTimeout(timer);
    }
  );

  return (
    <SafeAreaView className="flex-1 bg-green-600 justify-center items-center">
      <View className="items-center">
        <Image
          source={require("../assets/splash-icon.png")}
          className="w-32 h-32 mb-4"
          resizeMode="contain"
        />
        <Text className="text-3xl font-bold text-white">Orchid Companion</Text>
        <Text className="text-green-100 text-sm mt-2">Smart Orchid Care Assistant</Text>
      </View>
    </SafeAreaView>
  );
}