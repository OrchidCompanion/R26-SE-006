import "../global.css";
import { Stack } from "expo-router";
import { Provider } from "react-redux";
import { store } from "../src/store";

export default function RootLayout() {
  return (
    <Provider store={store}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="home" />
        <Stack.Screen name="all-plants" />
        <Stack.Screen name="plant-details" />
        <Stack.Screen name="identify-species" />
        <Stack.Screen name="analyse-location" />
        <Stack.Screen name="profile" />
      </Stack>
    </Provider>
  );
}