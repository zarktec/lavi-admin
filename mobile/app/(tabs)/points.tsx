import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import type { LedgerEntry } from "../../src/api/types";
import { useApp } from "../../src/app-context";
import { fmtDateTime, fmtDay } from "../../src/lib/dates";
import { Button, Card, ErrorView, H1, H2, Loading, P, Row, Screen } from "../../src/ui/components";
import { useLoad } from "../../src/ui/hooks";
import { colors } from "../../src/ui/theme";
import { Text } from "react-native";

export const reasonLabels: Record<string, string> = {
  dose_on_time: "Dosis a tiempo",
  welcome: "Bienvenida",
  streak_bonus: "Bono por racha",
  missed_dose: "Dosis perdida",
  late_dose_penalty_reversal: "Penalización revertida",
  penalty_reversal: "Penalización revertida",
  redemption: "Canje de puntos",
  redemption_reversal: "Devolución de canje",
  redemption_expired_refund: "Código vencido: puntos devueltos",
  expiration: "Puntos vencidos",
  manual_adjustment: "Ajuste de soporte",
};

export default function Points() {
  const { api, dataVersion } = useApp();
  const q = useLoad(() => api.getPoints());
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    try {
      const p = await api.getLedger();
      setEntries(p.entries);
      setNext(p.next_before);
      setLedgerError(null);
    } catch (e: any) {
      setLedgerError(e.message);
    }
  }, [api]);
  useEffect(() => {
    loadFirst();
  }, [loadFirst, dataVersion]);

  const more = async () => {
    if (next == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const p = await api.getLedger(next);
      setEntries((e) => [...e, ...p.entries]);
      setNext(p.next_before);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Screen onRefresh={() => { q.reload(); loadFirst(); }} refreshing={q.refreshing}>
      {q.loading && <Loading />}
      {q.error && !q.data && <ErrorView message={q.error} onRetry={q.reload} />}
      {q.data && (
        <>
          <Card>
            <P muted>Saldo</P>
            <H1>{q.data.balance} puntos</H1>
            <P muted>≈ {q.data.value_cop.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</P>
            <Button title="Canjear puntos" onPress={() => router.push("/redemptions")} />
          </Card>
          {q.data.upcoming_expirations.length > 0 && (
            <Card>
              <H2>Próximos vencimientos</H2>
              {q.data.upcoming_expirations.slice(0, 5).map((e) => (
                <Row key={e.date}>
                  <P>{fmtDay(e.date)}</P>
                  <P style={{ fontWeight: "600" }}>{e.amount} pts</P>
                </Row>
              ))}
            </Card>
          )}
        </>
      )}
      <H2>Movimientos</H2>
      {ledgerError && <ErrorView message={ledgerError} onRetry={loadFirst} />}
      {entries.length === 0 && !ledgerError && <P muted>Aún no tienes movimientos.</P>}
      {entries.map((e) => (
        <Card key={e.id}>
          <Row>
            <P style={{ flex: 1 }}>{reasonLabels[e.reason] ?? e.reason}</P>
            <Text style={{ fontWeight: "700", fontSize: 16, color: e.amount > 0 ? colors.success : colors.error }}>{e.amount > 0 ? "+" : ""}{e.amount}</Text>
          </Row>
          <P muted>{fmtDateTime(e.created_at)}{e.expires_at ? ` · vence ${fmtDay(e.expires_at.slice(0, 10))}` : ""}</P>
        </Card>
      ))}
      {next != null && <Button title="Ver más" variant="secondary" onPress={more} loading={loadingMore} />}
    </Screen>
  );
}
