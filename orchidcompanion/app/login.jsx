import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
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
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 py-8">
          <Text className="text-3xl font-bold text-gray-800 text-center mb-2">Welcome Back</Text>
          <Text className="text-gray-500 text-center mb-8">Sign in to manage your orchids</Text>

          {/* Email Input */}
          <View className="mb-4">
            <Text className="text-gray-700 font-medium mb-1">Email</Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 text-gray-800"
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password Input */}
          <View className="mb-6">
            <Text className="text-gray-700 font-medium mb-1">Password</Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 text-gray-800"
              placeholder="Enter your password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Login Button */}
          <TouchableOpacity
            onPress={handleLogin}
            className="bg-green-600 rounded-lg py-3.5 items-center justify-center shadow-md active:bg-green-700"
          >
            <Text className="text-white font-semibold text-lg">Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}