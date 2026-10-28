import { router } from "expo-router";
import { useState } from "react";
import { ApiError } from "../src/api/client";
import { useApp } from "../src/app-context";
import { errorMessages } from "../src/lib/results";
import { requestNotificationPermission } from "../src/notifications/service";
import { Banner, Button, Card, H1, H2, P, Screen } from "../src/ui/components";
import { TimeField } from "../src/ui/TimeField";

export default function Activate() {
  const { api, scanOutcome, refreshReminders, registerPush, bump } = useApp();
  const act = scanOutcome?.kind === "response" && scanOutcome.response.result === "activation_required" ? scanOutcome.response : null;
  const [times, setTimes] = useState<string[]>(act?.suggested_times ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!act) return <Screen><P>La activación venció. Acerca de nuevo el teléfono al frasco.</P><Button title="Volver" onPress={() => router.replace("/(tabs)")} /></Screen>;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createTreatment({ activation_token: act.activation_token, reminder_times: times });
      bump();
      // Permiso contextual: justo cuando ya hay horarios que recordar
      if (await requestNotificationPermission()) registerPush();
      await refreshReminders();
      router.replace("/(tabs)");
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError(errorMessages[code] ?? (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const c = act.config;
  return (
    <Screen>
      <H1>{act.product.name}</H1>
      <P muted>{act.variant.name}{act.variant.volume_ml ? ` · ${act.variant.volume_ml} ml` : ""}</P>
      <Card>
        <P>{c.doses_per_day} aplicación(es) al día durante {c.duration_days} días.</P>
        <P>Ganas {c.points_per_dose} puntos por cada aplicación a tiempo{c.welcome_points > 0 ? ` y ${c.welcome_points} de bienvenida` : ""}.</P>
        <P muted>Tienes una ventana de {c.window_minutes_before} min antes y {c.window_minutes_after} min después de tu hora para acercar el teléfono al frasco.</P>
      </Card>
      <Card>
        <H2>¿A qué hora te aplicas?</H2>
        {times.map((v, i) => (
          <TimeField key={i} label={`Aplicación ${i + 1}`} value={v} onChange={(nv) => setTimes((a) => a.map((x, j) => (j === i ? nv : x)))} />
        ))}
        <P muted>Podrás cambiarlos después, con las reglas de anticipación y frecuencia del tratamiento.</P>
      </Card>
      {error && <Banner tone="error">{error}</Banner>}
      <Button title="Activar frasco" onPress={confirm} loading={busy} />
      <Button title="Ahora no" variant="secondary" onPress={() => router.replace("/(tabs)")} />
    </Screen>
  );
}
