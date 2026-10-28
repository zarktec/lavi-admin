import type { ExpoConfig } from "expo/config";

const domain = process.env.EXPO_PUBLIC_APP_DOMAIN ?? "app.tumarca.com";
const bundleId = process.env.APP_BUNDLE_ID ?? "com.tumarca.app";

const config: ExpoConfig = {
  name: process.env.APP_NAME ?? "Tu Marca",
  slug: "lavi-mobile",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "tumarca", // esquema de la redirección OAuth (tumarca://auth/callback)
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    // Universal Links: https://<dominio>/t?d=...&c=...
    associatedDomains: [`applinks:${domain}`],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: bundleId,
    permissions: ["android.permission.NFC", "android.permission.POST_NOTIFICATIONS"],
    intentFilters: [
      {
        // App Links verificados por /.well-known/assetlinks.json
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: domain, pathPrefix: "/t" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["react-native-nfc-manager", { nfcPermission: "Usamos el NFC para leer el tag de tu frasco y registrar tu aplicación.", includeNdefEntitlement: false }],
    "./plugins/withNfcFeature.js",
    ["expo-notifications", { color: "#2f5d50" }],
  ],
  experiments: { typedRoutes: false },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
};

export default config;
