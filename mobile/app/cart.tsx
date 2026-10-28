import { useShopifyCheckoutSheet } from "@shopify/checkout-sheet-kit";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useApp } from "../src/app-context";
import { createCheckout, formatPrice, listProducts } from "../src/store/storefront";
import { Banner, Button, Card, Chip, ErrorView, H2, Loading, P, Row, Screen } from "../src/ui/components";
import { useLoad } from "../src/ui/hooks";

export default function Cart() {
  const { api, cart, setCart, bump } = useApp();
  const params = useLocalSearchParams<{ code?: string }>();
  const checkout = useShopifyCheckoutSheet();
  const products = useLoad(() => listProducts());
  const codes = useLoad(() => api.listRedemptions());
  const [code, setCode] = useState<string | null>(params.code ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(null);

  useEffect(() => {
    const sub = checkout.addEventListener("completed", () => {
      setCart(() => []);
      bump();
      router.replace("/(tabs)");
    });
    return () => sub?.remove();
  }, [checkout, setCart, bump]);

  const variants = new Map(products.data?.flatMap((p) => p.variants.map((v) => [v.id, { ...v, product: p.title }] as const)) ?? []);
  const total = cart.reduce((s, l) => s + Number(variants.get(l.variantId)?.price ?? 0) * l.quantity, 0);
  const available = codes.data?.filter((c) => c.status === "issued" && c.code) ?? [];

  const pay = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const me = await api.getMe();
      const { checkoutUrl, discountApplied } = await createCheckout(cart, { email: me.email, phone: me.phone }, code);
      if (code && discountApplied === false) {
        setMsg({ tone: "warning", text: `El código ${code} no aplica a este carrito. Puedes intentar ingresarlo en el pago o cambiar los productos.` });
      }
      checkout.present(checkoutUrl);
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const change = (id: string, d: number) => setCart((c) => c.map((l) => (l.variantId === id ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));

  if (products.loading) return <Screen><Loading /></Screen>;
  if (cart.length === 0) return <Screen><P muted>Tu carrito está vacío.</P><Button title="Ir a la tienda" onPress={() => router.replace("/(tabs)/store")} /></Screen>;

  return (
    <Screen>
      {products.error && <ErrorView message={products.error} onRetry={products.reload} />}
      {cart.map((l) => {
        const v = variants.get(l.variantId);
        return (
          <Card key={l.variantId}>
            <H2>{v?.product ?? "Producto"}</H2>
            <P muted>{v && v.title !== "Default Title" ? v.title : ""}</P>
            <Row>
              <Row>
                <Button title="−" variant="secondary" onPress={() => change(l.variantId, -1)} />
                <P style={{ fontWeight: "700" }}>{l.quantity}</P>
                <Button title="+" variant="secondary" onPress={() => change(l.variantId, 1)} />
              </Row>
              {v && <P>{formatPrice(String(Number(v.price) * l.quantity), v.currency)}</P>}
            </Row>
          </Card>
        );
      })}
      <Card>
        <H2>Código de canje</H2>
        {available.length === 0 && <P muted>No tienes códigos disponibles.</P>}
        {available.map((c) => (
          <Row key={c.id}>
            <P style={{ flex: 1 }}>{c.option_name} · {c.code}</P>
            {code === c.code ? <Chip label="Aplicado" tone="success" /> : <Button title="Usar" variant="secondary" onPress={() => setCode(c.code)} />}
          </Row>
        ))}
        {code && <Button title="Quitar código" variant="secondary" onPress={() => setCode(null)} />}
      </Card>
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      <H2>Subtotal: {formatPrice(String(total), [...variants.values()][0]?.currency ?? "COP")}</H2>
      <Button title="Pagar" onPress={pay} loading={busy} />
    </Screen>
  );
}
