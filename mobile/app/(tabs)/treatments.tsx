import { router } from "expo-router";
import { useApp } from "../../src/app-context";
import { fmtDay } from "../../src/lib/dates";
import { Card, Chip, ErrorView, H2, Loading, P, Progress, Row, Screen } from "../../src/ui/components";
import { useLoad } from "../../src/ui/hooks";

const statusLabel = { active: "Activo", finished: "Terminado", cancelled: "Cancelado" } as const;

export default function Treatments() {
  const { api } = useApp();
  const q = useLoad(() => api.listTreatments());
  const active = q.data?.filter((t) => t.status === "active") ?? [];
  const history = q.data?.filter((t) => t.status !== "active") ?? [];
  const render = (t: NonNullable<typeof q.data>[number]) => (
    <Card key={t.id} onPress={() => router.push(`/treatment/${t.id}`)} label={`${t.product.name} ${t.variant.name}`}>
      <Row>
        <H2>{t.product.name} · {t.variant.name}</H2>
        <Chip label={statusLabel[t.status]} tone={t.status === "active" ? "success" : "info"} />
      </Row>
      <Progress value={t.progress.on_time + t.progress.late + t.progress.missed} max={t.progress.total} />
      <P muted>{fmtDay(t.start_date)} → {fmtDay(t.end_date)} · {t.points_earned} puntos ganados</P>
    </Card>
  );
  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      {q.loading && <Loading />}
      {q.error && !q.data && <ErrorView message={q.error} onRetry={q.reload} />}
      {q.data && q.data.length === 0 && <P muted>Todavía no has activado ningún frasco.</P>}
      {active.length > 0 && <H2>Activos</H2>}
      {active.map(render)}
      {history.length > 0 && <H2>Historial</H2>}
      {history.map(render)}
    </Screen>
  );
}
