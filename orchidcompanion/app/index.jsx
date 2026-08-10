import { useEffect } from "react";
import { View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/login");
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-emerald-700 justify-between items-center py-12">
      <View className="flex-1 justify-center items-center px-6">
        <View className="bg-white/10 p-6 rounded-3xl mb-6 backdrop-blur-md shadow-xl border border-white/20">
          <Image
            source={require("../assets/app-logo.png")}
            className="w-36 h-36"
            resizeMode="contain"
          />
        </View>
        <Text className="text-4xl font-extrabold text-white tracking-wide text-center">
          Orchid<Text className="text-emerald-200">Companion</Text>
        </Text>
        <Text className="text-emerald-100 text-base mt-2 text-center font-medium tracking-wide">
          Smart Orchid Care & Diagnostics
        </Text>
      </View>

      <View className="items-center">
        <Text className="text-emerald-200/80 text-xs tracking-widest uppercase">
          R26-SE-006
        </Text>
      </View>
    </SafeAreaView>
  );
}