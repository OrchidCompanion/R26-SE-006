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
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDispatch } from "react-redux";
import { colors } from "../src/constants/colors";
import { saveAuthData } from "../src/services/storage";
import { setCredentials } from "../src/store/slices/authSlice";
import { API_BASE_URL } from "../src/config/api";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const dispatch = useDispatch();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Authentication failed.");
      }

      await saveAuthData(data.access_token, data.user);
      dispatch(setCredentials({ token: data.access_token, user: data.user }));
      router.replace("/home");
    } catch (err) {
      Alert.alert("Login Failed", err.message);
    } finally {
      setLoading(false);
    }
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
          <View className="flex-1 px-6 pt-24">
            <View className="items-center mb-6">
              <View
                className="w-24 h-24 rounded-full p-1 mb-3 shadow-sm border justify-center items-center"
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
                Welcome Back
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                Sign in to manage your orchids and sensor data
              </Text>
            </View>

            <View
              className="p-6 rounded-3xl border shadow-sm mb-6"
              style={{ backgroundColor: colors.white, borderColor: colors.borderGray }}
            >
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

              <TouchableOpacity
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
                className="rounded-xl py-4 items-center justify-center shadow-sm"
                style={{ backgroundColor: colors.primary }}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text
                    className="font-bold text-base tracking-wide"
                    style={{ color: colors.white }}
                  >
                    Log In
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}