declare module 'react-native-config' {
  interface Env {
    WEATHER_API_KEY: string;
  }

  const Config: Env;
  export default Config;
}