import { router } from "expo-router";
import { Image } from "react-native";
import { useApp } from "../../src/app-context";
import { listProducts, formatPrice } from "../../src/store/storefront";
import { Banner, Button, Card, ErrorView, H2, Loading, P, Row, Screen } from "../../src/ui/components";
import { useLoad } from "../../src/ui/hooks";

export default function Store() {
  const { cart, setCart } = useApp();
  const q = useLoad(() => listProducts());
  const count = cart.reduce((n, l) => n + l.quantity, 0);

  const add = (variantId: string) =>
    setCart((c) => (c.some((l) => l.variantId === variantId) ? c.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + 1 } : l)) : [...c, { variantId, quantity: 1 }]));

  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {count > 0 && <Banner tone="success" onPress={() => router.push("/cart")}>🛒 {count} producto(s) en tu carrito. Toca para pagar.</Banner>}
      {q.loading && <Loading />}
      {q.error && !q.data && <ErrorView message={q.error} onRetry={q.reload} />}
      {q.data?.map((p) => (
        <Card key={p.id}>
          {p.image && <Image source={{ uri: p.image }} accessibilityLabel={p.title} style={{ width: "100%", height: 180, borderRadius: 10 }} resizeMode="cover" />}
          <H2>{p.title}</H2>
          {p.variants.map((v) => (
            <Row key={v.id}>
              <P style={{ flex: 1 }}>{v.title === "Default Title" ? "Presentación única" : v.title} · {formatPrice(v.price, v.currency)}</P>
              <Button title={v.available ? "Agregar" : "Agotado"} variant="secondary" disabled={!v.available} onPress={() => add(v.id)} />
            </Row>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
