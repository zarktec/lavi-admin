import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../src/ui/theme";

const icon = (e: string) => () => <Text style={{ fontSize: 20 }}>{e}</Text>;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.brand, headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false }}>
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: icon("🏠") }} />
      <Tabs.Screen name="treatments" options={{ title: "Tratamientos", tabBarIcon: icon("🧴") }} />
      <Tabs.Screen name="points" options={{ title: "Puntos", tabBarIcon: icon("⭐") }} />
      <Tabs.Screen name="store" options={{ title: "Tienda", tabBarIcon: icon("🛍️") }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: icon("👤") }} />
    </Tabs>
  );
}
