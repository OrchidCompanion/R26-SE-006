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
import { Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react-native";
import { colors } from "../src/constants/colors";
import { saveAuthData } from "../src/services/storage";
import { setCredentials } from "../src/store/slices/authSlice";
import { API_BASE_URL } from "../src/config/api";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F7FAF8" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 pt-16 justify-between pb-8">
            {/* Top Brand Header */}
            <View>
              <View className="items-center mb-8">
                <View className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-100 p-3 mb-3 items-center justify-center shadow-xs">
                  <Image
                    source={require("../assets/app-logo.png")}
                    className="w-full h-full"
                    resizeMode="contain"
                  />
                </View>

                <View className="flex-row items-center gap-1.5 mb-1">
                  <Text className="text-2xl font-black text-gray-900 tracking-tight">
                    Orchid<Text className="text-emerald-700">Companion</Text>
                  </Text>
                  <Sparkles size={16} color="#059669" />
                </View>

                <Text className="text-xs text-gray-400 font-medium text-center">
                  Smart Orchid Care & IoT Telemetry
                </Text>
              </View>

              {/* Login Card */}
              <View className="p-6 rounded-3xl border border-emerald-900/10 bg-white shadow-xs">
                <Text className="text-lg font-black text-gray-900 mb-1">Sign In</Text>
                <Text className="text-xs text-gray-400 mb-5">
                  Enter your credentials to access your orchids and sensors
                </Text>

                {/* Email Input */}
                <View className="mb-4">
                  <Text className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1.5">
                    Email Address
                  </Text>
                  <View className="flex-row items-center bg-[#F1F5F2] rounded-2xl px-3.5 py-3 border border-emerald-900/10">
                    <Mail size={18} color="#059669" className="mr-2.5" />
                    <TextInput
                      className="flex-1 text-sm font-medium text-gray-800 p-0"
                      placeholder="e.g. grower@example.com"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>
                </View>

                {/* Password Input */}
                <View className="mb-6">
                  <Text className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1.5">
                    Password
                  </Text>
                  <View className="flex-row items-center bg-[#F1F5F2] rounded-2xl px-3.5 py-3 border border-emerald-900/10">
                    <Lock size={18} color="#059669" className="mr-2.5" />
                    <TextInput
                      className="flex-1 text-sm font-medium text-gray-800 p-0"
                      placeholder="Enter password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      className="p-1"
                    >
                      {showPassword ? (
                        <EyeOff size={18} color="#6B7280" />
                      ) : (
                        <Eye size={18} color="#6B7280" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Log In Button */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                  className="rounded-2xl py-4 items-center justify-center flex-row gap-2 bg-emerald-600 shadow-xs"
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Text className="font-bold text-sm tracking-wide text-white">
                        Sign In to Sanctuary
                      </Text>
                      <ArrowRight size={16} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* System Tag */}
            <View className="items-center mt-6">
              <Text className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">
                R26-SE-006 • Smart IoT Ecosystem
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}