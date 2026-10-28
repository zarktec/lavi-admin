import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { ApiError, NetworkError } from "../src/api/client";
import type { Redemption, RedemptionOption } from "../src/api/types";
import { useApp } from "../src/app-context";
import { fmtDay } from "../src/lib/dates";
import { errorMessages } from "../src/lib/results";
import { Banner, Button, Card, Chip, ErrorView, H2, Loading, P, Row, Screen } from "../src/ui/components";
import { useLoad } from "../src/ui/hooks";

const rewardText = (o: Pick<RedemptionOption, "reward_type" | "reward_value">) =>
  o.reward_type === "fixed_amount" ? `${(o.reward_value ?? 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })} de descuento`
  : o.reward_type === "percentage" ? `${o.reward_value}% de descuento`
  : o.reward_type === "free_product" ? "Producto gratis"
  : "Envío gratis";

const statusChip: Record<Redemption["status"], { label: string; tone: "success" | "info" | "warning" | "error" }> = {
  issued: { label: "Disponible", tone: "success" },
  used: { label: "Usado", tone: "info" },
  expired: { label: "Vencido", tone: "warning" },
  pending: { label: "Procesando", tone: "warning" },
  failed: { label: "No se generó · puntos devueltos", tone: "error" },
};

export default function Redemptions() {
  const { api, bump } = useApp();
  const opts = useLoad(() => api.getRedemptionOptions());
  const mine = useLoad(() => api.listRedemptions());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // Una llave por intento: si se reintenta tras un corte de red, el backend no cobra dos veces
  const keys = useRef(new Map<string, string>());

  const redeem = (o: RedemptionOption) => {
    Alert.alert("Canjear puntos", `¿Canjear ${o.points_cost} puntos por ${o.name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Canjear",
        onPress: async () => {
          setBusy(o.id);
          setMsg(null);
          const key = keys.current.get(o.id) ?? Crypto.randomUUID();
          keys.current.set(o.id, key);
          try {
            const r = await api.redeem(o.id, key);
            keys.current.delete(o.id);
            setMsg({ tone: "success", text: `¡Listo! Tu código es ${r.code}. Lo encuentras abajo.` });
            bump();
            opts.reload();
            mine.reload();
          } catch (e) {
            if (e instanceof ApiError) keys.current.delete(o.id);
            const code = e instanceof ApiError ? e.code : "";
            setMsg({ tone: "error", text: e instanceof NetworkError ? "Sin conexión. Vuelve a intentarlo: no se cobrará dos veces." : errorMessages[code] ?? (e as Error).message });
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <Screen onRefresh={() => { opts.reload(); mine.reload(); }} refreshing={opts.refreshing}>
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      {opts.loading && <Loading />}
      {opts.error && !opts.data && <ErrorView message={opts.error} onRetry={opts.reload} />}
      {opts.data && (
        <>
          <H2>Tienes {opts.data.balance} puntos</H2>
          {opts.data.balance < opts.data.min_points_to_redeem && <P muted>El mínimo para redimir es {opts.data.min_points_to_redeem} puntos.</P>}
          {opts.data.options.length === 0 && <P muted>Por ahora no hay beneficios disponibles.</P>}
          {opts.data.options.map((o) => (
            <Card key={o.id}>
              <Row>
                <H2>{o.name}</H2>
                <P style={{ fontWeight: "700" }}>{o.points_cost} pts</P>
              </Row>
              <P muted>{rewardText(o)}</P>
              <Button title="Canjear" onPress={() => redeem(o)} disabled={!o.affordable} loading={busy === o.id} />
            </Card>
          ))}
        </>
      )}
      <H2>Mis códigos</H2>
      {mine.data?.length === 0 && <P muted>Aún no has canjeado puntos.</P>}
      {mine.data?.map((r) => (
        <Card key={r.id}>
          <Row>
            <P style={{ fontWeight: "600", flex: 1 }}>{r.option_name}</P>
            <Chip label={statusChip[r.status].label} tone={statusChip[r.status].tone} />
          </Row>
          {r.code && <H2>{r.code}</H2>}
          {r.expires_at && r.status === "issued" && <P muted>Vence el {fmtDay(r.expires_at.slice(0, 10))}</P>}
          {r.status === "issued" && r.code && (
            <Row>
              <Button title="Copiar" variant="secondary" style={{ flex: 1 }} onPress={async () => { await Clipboard.setStringAsync(r.code!); Alert.alert("Código copiado"); }} />
              <Button title="Usar en la tienda" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/cart", params: { code: r.code! } })} />
            </Row>
          )}
        </Card>
      ))}
    </Screen>
  );
}
