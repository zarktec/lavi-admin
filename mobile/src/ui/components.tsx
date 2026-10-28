import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "./theme";
import type { Tone } from "../lib/results";

export function Screen({ children, scroll = true, onRefresh, refreshing = false, padded = true }: {
  children: React.ReactNode; scroll?: boolean; onRefresh?: () => void; refreshing?: boolean; padded?: boolean;
}) {
  const inner = padded ? styles.padded : undefined;
  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { gap: spacing.md }]} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, gap: spacing.md }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text accessibilityRole="header" style={[styles.h1, style]}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" style={styles.h2}>{children}</Text>;
}
export function P({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.p, muted && { color: colors.muted }, style]}>{children}</Text>;
}

export function Card({ children, style, onPress, label }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.8 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = "primary", disabled, loading, style }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === "primary" ? colors.brand : variant === "danger" ? colors.error : "transparent";
  const fg = variant === "secondary" ? colors.brand : colors.brandText;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: variant === "secondary" ? colors.brand : bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

const toneColors: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successBg },
  info: { fg: colors.info, bg: colors.infoBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  error: { fg: colors.error, bg: colors.errorBg },
};

export function Banner({ tone = "info", children, onPress }: { tone?: Tone; children: React.ReactNode; onPress?: () => void }) {
  const c = toneColors[tone];
  const body = <Text style={{ color: c.fg, fontSize: 15 }}>{children}</Text>;
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.banner, { backgroundColor: c.bg }]}>{body}</Pressable>
  ) : (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: c.bg }]}>{body}</View>
  );
}

export function Chip({ label, tone = "info" }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }} style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  );
}

export function Loading() {
  return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand} />;
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ gap: spacing.md }}>
      <Banner tone="error">{message}</Banner>
      {onRetry && <Button title="Reintentar" variant="secondary" onPress={onRetry} />}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { padding: spacing.md, paddingBottom: spacing.xl },
  h1: { fontSize: 26, fontWeight: "700", color: colors.text },
  h2: { fontSize: 18, fontWeight: "700", color: colors.text },
  p: { fontSize: 15, lineHeight: 22, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  button: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1.5 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  banner: { borderRadius: 12, padding: spacing.md },
  chip: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: colors.brand },
});
