import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { colors, spacing } from "./theme";

const toDate = (hhmm: string) => {
  const d = new Date();
  d.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)), 0, 0);
  return d;
};
const toHHmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const formatHHmm = (hhmm: string) => toDate(hhmm).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });

/** Selector de hora "HH:mm". En Android abre el diálogo del sistema; en iOS muestra el selector compacto. */
export function TimeField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
      <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
      {Platform.OS === "ios" ? (
        <DateTimePicker mode="time" display="compact" value={toDate(value)} disabled={disabled} onChange={(_, d) => d && onChange(toHHmm(d))} />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${formatHHmm(value)}. Cambiar hora`}
            disabled={disabled}
            onPress={() => setOpen(true)}
            style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.line }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600" }}>{formatHHmm(value)}</Text>
          </Pressable>
          {open && (
            <DateTimePicker
              mode="time"
              display="default"
              value={toDate(value)}
              onChange={(e, d) => {
                setOpen(false);
                if (e.type === "set" && d) onChange(toHHmm(d));
              }}
            />
          )}
        </>
      )}
    </View>
  );
}
