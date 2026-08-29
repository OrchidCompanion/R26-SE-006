import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "./constants/colors";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const handleLogin = () => {
    router.replace("/home");
  };
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
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
              <View
                className="w-28 h-28 rounded-full p-1 mb-4 shadow-sm border justify-center items-center"
                style={{
                  backgroundColor: colors.primaryLight,
                  borderColor: colors.primary,
                }}
              >
                <Image
                  source={require("../assets/user.png")}
                  className="w-full h-full rounded-full"
                  resizeMode="cover"
                />
              </View>
              <Text
                className="text-3xl font-extrabold tracking-tight"
                style={{ color: colors.darkGray }}
              >
                User Login
              </Text>
            </View>
            {/* Form Card */}
            <View
              className="p-6 rounded-3xl border shadow-sm mb-6"
              style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
            >
              {/* Email Input */}
              <View className="mb-4">
                <Text
                  className="font-semibold mb-1.5 text-xs uppercase tracking-wider"
                  style={{ color: colors.darkGray }}
                >
                  Email Address
                </Text>
                <TextInput
                  className="rounded-xl px-4 py-3.5 text-base border"
                  style={{
                    backgroundColor: colors.lightGray,
                    borderColor: colors.borderGray,
                    color: colors.darkGray,
                  }}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.mediumGray}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
              {/* Password Input */}
              <View className="mb-6">
                <Text
                  className="font-semibold mb-1.5 text-xs uppercase tracking-wider"
                  style={{ color: colors.darkGray }}
                >
                  Password
                </Text>
                <TextInput
                  className="rounded-xl px-4 py-3.5 text-base border"
                  style={{
                    backgroundColor: colors.lightGray,
                    borderColor: colors.borderGray,
                    color: colors.darkGray,
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.mediumGray}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
              {/* Login Button */}
              <TouchableOpacity
                onPress={handleLogin}
                activeOpacity={0.8}
                className="rounded-xl py-4 items-center justify-center shadow-sm"
                style={{ backgroundColor: colors.primary }}
              >
                <Text
                  className="font-bold text-base tracking-wide"
                  style={{ color: colors.white }}
                >
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