import { useEffect } from "react";
import { View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "./constants/colors";

export default function SplashScreen() {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/login");
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <SafeAreaView
      className="flex-1 justify-between items-center py-12"
      style={{ backgroundColor: colors.primary }}
    >
      <View className="flex-1 justify-center items-center px-6">
        <View className="bg-white/10 p-6 rounded-3xl mb-6 backdrop-blur-md shadow-xl border border-white/20">
          <Image
            source={require("../assets/app-logo.png")}
            className="w-36 h-36"
            resizeMode="contain"
          />
        </View>
        <Text
          className="text-4xl font-extrabold tracking-wide text-center"
          style={{ color: colors.white }}
        >
          Orchid<Text style={{ color: colors.primaryLight }}>Companion</Text>
        </Text>
        <Text
          className="text-base mt-2 text-center font-medium tracking-wide"
          style={{ color: colors.primaryLight }}
        >
          Smart Orchid Care & Diagnostics
        </Text>
      </View>
      <View className="items-center">
        <Text
          className="text-xs tracking-widest uppercase"
          style={{ color: colors.primaryLight, opacity: 0.8 }}
        >
          R26-SE-006
        </Text>
      </View>
    </SafeAreaView>
  );
}