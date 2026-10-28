import { router } from "expo-router";
import { useState } from "react";
import { Switch, View } from "react-native";
import { LoginCancelled } from "../src/auth/shopify";
import { useApp } from "../src/app-context";
import { Banner, Button, H1, P, Row, Screen } from "../src/ui/components";

export default function Login() {
  const { signIn } = useApp();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(consent);
    } catch (e) {
      if (!(e instanceof LoginCancelled)) setError((e as Error).message || "No pudimos iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ height: 40 }} />
      <H1>Bienvenida 🌿</H1>
      <P>Entra con la misma cuenta de la tienda. Te enviaremos un código por correo; no necesitas contraseña.</P>
      <Row style={{ alignItems: "flex-start" }}>
        <Switch accessibilityLabel="Autorizo el tratamiento de mis datos personales" value={consent} onValueChange={setConsent} />
        <P style={{ flex: 1 }}>
          Autorizo de forma expresa el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y la{" "}
          <P style={{ textDecorationLine: "underline" }} >política de tratamiento de datos</P>.
        </P>
      </Row>
      <Button title="Leer la política de datos" variant="secondary" onPress={() => router.push("/privacy")} />
      {error && <Banner tone="error">{error}</Banner>}
      <Button title="Continuar con mi cuenta de la tienda" onPress={go} disabled={!consent} loading={busy} />
      {!consent && <P muted>Para continuar debes autorizar el tratamiento de tus datos.</P>}
    </Screen>
  );
}
