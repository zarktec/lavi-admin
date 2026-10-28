import { router } from "expo-router";
import { H1, P, Button, Screen } from "../src/ui/components";

export default function NfcUnsupported() {
  return (
    <Screen>
      <H1>Tu teléfono no es compatible</H1>
      <P>Esta app funciona leyendo el tag NFC del frasco y tu teléfono no tiene NFC. Puedes seguir usando la tienda y consultar tus puntos, pero no podrás registrar aplicaciones.</P>
      <P muted>Si tienes otro teléfono con NFC, inicia sesión allí con la misma cuenta.</P>
      <Button title="Volver" onPress={() => router.back()} />
    </Screen>
  );
}
