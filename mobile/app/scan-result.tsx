import { router } from "expo-router";
import { Text, View } from "react-native";
import { useApp } from "../src/app-context";
import { describeScan } from "../src/lib/results";
import { Banner, Button, H1, P, Screen } from "../src/ui/components";
import { colors, spacing } from "../src/ui/theme";

export default function ScanResult() {
  const { scanOutcome: o } = useApp();
  const home = () => router.replace("/(tabs)");

  if (!o) return <Screen><P>No hay resultado que mostrar.</P><Button title="Ir al inicio" onPress={home} /></Screen>;

  if (o.kind === "queued") {
    return (
      <Screen>
        <Hero icon="📥" title="Lectura guardada" tone="warning" />
        <P>No hay conexión en este momento. Guardamos tu lectura y se validará cuando vuelva el internet. Si todavía estás dentro del plazo permitido, contará.</P>
        <Button title="Entendido" onPress={home} />
      </Screen>
    );
  }
  if (o.kind === "error") {
    return (
      <Screen>
        <Hero icon="⚠️" title="No pudimos registrar la lectura" tone="error" />
        <Banner tone="error">{o.message}</Banner>
        <Button title="Intentar de nuevo" onPress={() => router.replace("/scan")} />
        <Button title="Ir al inicio" variant="secondary" onPress={home} />
      </Screen>
    );
  }

  const v = describeScan(o.response);
  const r = o.response;
  return (
    <Screen>
      <Hero icon={v.icon} title={v.title} tone={v.tone} />
      <P style={{ textAlign: "center" }}>{v.message}</P>
      {r.result === "dose_recorded" && (
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <Stat label="Puntos" value={`+${r.points_earned + r.bonus_points}`} />
          <Stat label="Racha" value={`🔥 ${r.streak}`} />
          <Stat label="Saldo" value={String(r.balance)} />
        </View>
      )}
      {(r.result === "dose_recorded" || r.result === "late") && r.next_dose && (
        <P muted style={{ textAlign: "center" }}>Próxima dosis: {new Date(r.next_dose.window_start).toLocaleString("es-CO", { weekday: "long", hour: "numeric", minute: "2-digit" })}</P>
      )}
      {v.suggestRepurchase && <Button title="Reordenar en la tienda" onPress={() => router.replace("/(tabs)/store")} />}
      <Button title="Ir al inicio" variant={v.suggestRepurchase ? "secondary" : "primary"} onPress={home} />
    </Screen>
  );
}

function Hero({ icon, title, tone }: { icon: string; title: string; tone: "success" | "info" | "warning" | "error" }) {
  const fg = { success: colors.success, info: colors.info, warning: colors.warning, error: colors.error }[tone];
  return (
    <View accessibilityRole="header" style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg }}>
      <Text style={{ fontSize: 64 }}>{icon}</Text>
      <H1 style={{ color: fg, textAlign: "center" }}>{title}</H1>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 26, fontWeight: "700", color: colors.brand }}>{value}</Text>
      <P muted>{label}</P>
    </View>
  );
}
