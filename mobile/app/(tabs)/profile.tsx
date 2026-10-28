import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking } from "react-native";
import { useApp } from "../../src/app-context";
import { permissionState, requestNotificationPermission } from "../../src/notifications/service";
import { Banner, Button, Card, ErrorView, H1, H2, Loading, P, Screen } from "../../src/ui/components";
import { useLoad } from "../../src/ui/hooks";

export default function Profile() {
  const { api, signOut, deleteAccount, refreshReminders, registerPush } = useApp();
  const q = useLoad(() => api.getMe());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const confirmDelete = () =>
    Alert.alert(
      "Eliminar cuenta",
      "Se eliminarán tus datos personales, se cancelarán tus tratamientos activos y perderás tus puntos. Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar definitivamente",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await deleteAccount();
            } catch (e) {
              setMsg((e as Error).message);
              setBusy(false);
            }
          },
        },
      ],
    );

  const notifications = async () => {
    if ((await permissionState()) === "denied") return Linking.openSettings();
    if (await requestNotificationPermission()) {
      await refreshReminders();
      registerPush();
      Alert.alert("Recordatorios activados");
    }
  };

  return (
    <Screen>
      <H1>Perfil</H1>
      {q.loading && <Loading />}
      {q.error && !q.data && <ErrorView message={q.error} onRetry={q.reload} />}
      {q.data && (
        <Card>
          <H2>{q.data.name ?? "Mi cuenta"}</H2>
          <P muted>{q.data.email}</P>
          <P muted>Zona horaria: {q.data.timezone}</P>
        </Card>
      )}
      {msg && <Banner tone="error">{msg}</Banner>}
      <Button title="🔔  Recordatorios y notificaciones" variant="secondary" onPress={notifications} />
      <Button title="Política de tratamiento de datos" variant="secondary" onPress={() => router.push("/privacy")} />
      <Button title="Cerrar sesión" variant="secondary" onPress={() => signOut()} />
      <Button title="Eliminar mi cuenta" variant="danger" onPress={confirmDelete} loading={busy} />
      <P muted style={{ textAlign: "center" }}>Versión {Constants.expoConfig?.version}</P>
    </Screen>
  );
}
