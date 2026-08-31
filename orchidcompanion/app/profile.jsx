import { View, Text, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { LogOut } from "lucide-react-native";
import Header from "../src/components/Header";
import { colors } from "../src/constants/colors";
import { clearAuthData } from "../src/services/storage";
import { logout } from "../src/store/slices/authSlice";

export default function ProfileScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const handleLogout = async () => {
    await clearAuthData();
    dispatch(logout());
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.lightGray }}>
      <Header title="User Profile" />

      <View className="flex-1 p-5 justify-between">
        <View className="items-center pt-8">
          <View
            className="w-24 h-24 rounded-full p-1 mb-4 border justify-center items-center"
            style={{ backgroundColor: colors.primaryLight, borderColor: colors.primary }}
          >
            <Image source={require("../assets/user.png")} className="w-full h-full rounded-full" />
          </View>

          <Text className="text-2xl font-extrabold" style={{ color: colors.darkGray }}>
            {user ? `${user.first_name} ${user.last_name}` : "Orchid Grower"}
          </Text>
          <Text className="text-sm font-semibold mt-1" style={{ color: colors.mediumGray }}>
            {user?.email}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          className="flex-row items-center justify-center py-4 rounded-xl border shadow-xs"
          style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
        >
          <LogOut size={18} color={colors.danger} />
          <Text className="text-sm font-bold ml-2" style={{ color: colors.danger }}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}