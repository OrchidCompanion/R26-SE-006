export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export const getAuthHeaders = (token) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});