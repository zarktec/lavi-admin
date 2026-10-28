import { router } from "expo-router";
import { useState } from "react";
import { useEffect } from "react";
import { useApp } from "../../src/app-context";
import { displayStreak, fmtDateTime } from "../../src/lib/dates";
import { permissionState, requestNotificationPermission } from "../../src/notifications/service";
import { Banner, Button, Card, ErrorView, H1, H2, Loading, P, Progress, Row, Screen } from "../../src/ui/components";
import { useLoad } from "../../src/ui/hooks";

export default function Home() {
  const { api, queued, refreshReminders, registerPush } = useApp();
  const [perm, setPerm] = useState<string>("granted");
  useEffect(() => {
    permissionState().then(setPerm);
  }, []);

  const q = useLoad(async () => {
    const [points, list] = await Promise.all([api.getPoints(), api.listTreatments()]);
    const active = list.filter((t) => t.status === "active");
    const details = await Promise.all(active.map((t) => api.getTreatment(t.id)));
    return { points, active: details };
  });

  const enableNotifications = async () => {
    const ok = await requestNotificationPermission();
    setPerm(ok ? "granted" : "denied");
    if (ok) {
      await refreshReminders();
      registerPush();
    }
  };

  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      <H1>Hola 👋</H1>
      {queued > 0 && <Banner tone="warning">Tienes {queued} lectura(s) guardada(s). Se validarán cuando vuelva la conexión.</Banner>}
      {perm === "undetermined" && q.data?.active.length ? (
        <Banner tone="info" onPress={enableNotifications}>Activa los recordatorios para no olvidar tu aplicación. Toca aquí.</Banner>
      ) : null}
      {q.loading && <Loading />}
      {q.error && !q.data && <ErrorView message={q.error} onRetry={q.reload} />}
      {q.data && (
        <>
          <Card onPress={() => router.push("/(tabs)/points")} label="Ver puntos">
            <P muted>Tus puntos</P>
            <H1>{q.data.points.balance}</H1>
            <P muted>≈ {q.data.points.value_cop.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</P>
          </Card>
          <Button title="📲  Registrar aplicación" onPress={() => router.push("/scan")} />
          {q.data.active.length === 0 && (
            <Card>
              <H2>Aún no tienes un tratamiento activo</H2>
              <P muted>Acerca tu teléfono al tag de tu frasco para activarlo y empezar a sumar puntos.</P>
            </Card>
          )}
          {q.data.active.map((t) => {
            const next = t.doses.find((d) => d.status === "scheduled" && new Date(d.window_end) > new Date());
            const streak = displayStreak(t.doses.map((d) => d.status));
            const done = t.progress.on_time + t.progress.late + t.progress.missed;
            return (
              <Card key={t.id} onPress={() => router.push(`/treatment/${t.id}`)} label={`Tratamiento ${t.product.name}`}>
                <Row>
                  <H2>{t.product.name}</H2>
                  <P muted>{t.variant.name}</P>
                </Row>
                <Progress value={done} max={t.progress.total} />
                <P muted>
                  {done} de {t.progress.total} dosis · quedan {t.days_left} día(s)
                </P>
                <P>🔥 Racha: {streak}</P>
                {next && <P>Próxima dosis: {fmtDateTime(next.window_start)}</P>}
                {t.repurchase_suggested && (
                  <Banner tone="warning" onPress={() => router.push("/(tabs)/store")}>Tu tratamiento está por terminar. Reordena a tiempo.</Banner>
                )}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
