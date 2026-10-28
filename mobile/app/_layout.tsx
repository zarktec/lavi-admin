import { ColorScheme, ShopifyCheckoutSheetProvider } from "@shopify/checkout-sheet-kit";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app-context";
import { colors } from "../src/ui/theme";
import UpdateRequired from "./update-required";

function Gate() {
  const { status, forceUpdate } = useApp();
  if (forceUpdate) return <UpdateRequired />;
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  const signedIn = status === "signedIn";
  return (
    <Stack screenOptions={{ headerTintColor: colors.brand, headerStyle: { backgroundColor: colors.bg }, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="privacy" options={{ title: "Política de datos", presentation: "modal" }} />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: "Registrar aplicación", presentation: "modal" }} />
        <Stack.Screen name="t" options={{ title: "Leyendo frasco", headerBackVisible: false }} />
        <Stack.Screen name="scan-result" options={{ title: "Resultado", headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="activate" options={{ title: "Activar frasco", headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="nfc-unsupported" options={{ title: "NFC no disponible" }} />
        <Stack.Screen name="treatment/[id]" options={{ title: "Tratamiento" }} />
        <Stack.Screen name="redemptions" options={{ title: "Canjear puntos" }} />
        <Stack.Screen name="cart" options={{ title: "Carrito" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProvider>
        <ShopifyCheckoutSheetProvider configuration={{ colorScheme: ColorScheme.automatic }}>
          <Gate />
        </ShopifyCheckoutSheetProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
