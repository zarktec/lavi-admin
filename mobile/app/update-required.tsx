import { Linking, Platform } from "react-native";
import { useApp } from "../src/app-context";
import { Button, H1, P, Screen } from "../src/ui/components";

export default function UpdateRequired() {
  const { appConfig } = useApp();
  const url = Platform.OS === "ios" ? appConfig?.links.ios_store_url : appConfig?.links.android_store_url;
  return (
    <Screen scroll={false}>
      <H1 style={{ marginTop: 80 }}>Actualiza la app</H1>
      <P>Hay una versión nueva necesaria para seguir usando la app. Actualízala desde la tienda de aplicaciones.</P>
      <Button title="Ir a la tienda" onPress={() => url && Linking.openURL(url)} disabled={!url} />
    </Screen>
  );
}
