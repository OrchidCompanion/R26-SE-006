import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "user_token";
const USER_KEY = "user_data";

export const saveAuthData = async (token, user) => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
};

export const getAuthData = async () => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const userStr = await SecureStore.getItemAsync(USER_KEY);
  return {
    token,
    user: userStr ? JSON.parse(userStr) : null,
  };
};

export const clearAuthData = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
};