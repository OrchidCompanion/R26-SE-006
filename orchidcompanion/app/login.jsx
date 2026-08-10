import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleLogin = () => {
    router.replace("/home");
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 pt-36">
            
            {/* Header & User Profile Image */}
            <View className="items-center mb-4">
              <View className="w-28 h-28 bg-emerald-100 rounded-full p-1 mb-4 shadow-sm border border-emerald-200 justify-center items-center">
                <Image
                  source={require("../assets/user.png")}
                  className="w-full h-full rounded-full"
                  resizeMode="cover"
                />
              </View>
              <Text className="text-3xl font-extrabold text-gray-800 tracking-tight">
                User Login
              </Text>
            </View>

            {/* Form Card */}
            <View className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm mb-6">
              {/* Email Input */}
              <View className="mb-4">
                <Text className="text-gray-700 font-semibold mb-1.5 text-xs uppercase tracking-wider">
                  Email Address
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base focus:border-emerald-500"
                  placeholder="Enter your email"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              {/* Password Input */}
              <View className="mb-6">
                <Text className="text-gray-700 font-semibold mb-1.5 text-xs uppercase tracking-wider">
                  Password
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-800 text-base focus:border-emerald-500"
                  placeholder="Enter your password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              {/* Login Button */}
              <TouchableOpacity
                onPress={handleLogin}
                activeOpacity={0.8}
                className="bg-emerald-600 rounded-xl py-4 items-center justify-center shadow-sm active:bg-emerald-700"
              >
                <Text className="text-white font-bold text-base tracking-wide">
                  Log In
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}