import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ApiError } from "../../src/api/client";
import type { DoseStatus } from "../../src/api/types";
import { useApp } from "../../src/app-context";
import { fmtDate, fmtDay, fmtTime } from "../../src/lib/dates";
import { errorMessages } from "../../src/lib/results";
import { Banner, Button, Card, Chip, ErrorView, H1, H2, Loading, P, Progress, Row, Screen } from "../../src/ui/components";
import { useLoad } from "../../src/ui/hooks";
import { TimeField } from "../../src/ui/TimeField";

const doseLabel: Record<DoseStatus, { label: string; tone: "success" | "warning" | "error" | "info" }> = {
  on_time: { label: "A tiempo", tone: "success" },
  late: { label: "Tarde", tone: "warning" },
  missed: { label: "Perdida", tone: "error" },
  scheduled: { label: "Pendiente", tone: "info" },
};

export default function TreatmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, refreshReminders, bump } = useApp();
  const q = useLoad(() => api.getTreatment(id), [id]);
  const [times, setTimes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (q.data) setTimes(q.data.reminder_times);
  }, [q.data]);

  if (q.loading) return <Screen><Loading /></Screen>;
  if (!q.data) return <Screen><ErrorView message={q.error ?? "No encontrado"} onRetry={q.reload} /></Screen>;
  const t = q.data;
  const changed = times.join() !== t.reminder_times.join();
  const editable = t.status === "active";
  const doneCount = t.progress.on_time + t.progress.late + t.progress.missed;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.updateSchedule(t.id, times);
      setMsg({ tone: "success", text: "Horarios actualizados. Aplican a las dosis futuras." });
      bump();
      await refreshReminders();
      q.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setMsg({ tone: "error", text: errorMessages[code] ?? (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const byDay = new Map<string, typeof t.doses>();
  for (const d of t.doses) {
    const k = fmtDate(d.window_start);
    byDay.set(k, [...(byDay.get(k) ?? []), d]);
  }

  return (
    <Screen onRefresh={q.reload} refreshing={q.refreshing}>
      <H1>{t.product.name}</H1>
      <P muted>{t.variant.name} · {fmtDay(t.start_date)} → {fmtDay(t.end_date)}</P>
      <Card>
        <Progress value={doneCount} max={t.progress.total} />
        <P>A tiempo: {t.progress.on_time} · Tarde: {t.progress.late} · Perdidas: {t.progress.missed} · Total: {t.progress.total}</P>
        <P>⭐ {t.points_earned} puntos ganados con este frasco</P>
      </Card>

      {editable && (
        <Card>
          <H2>Mis horarios</H2>
          {times.map((v, i) => (
            <TimeField key={i} label={`Dosis ${i + 1}`} value={v} onChange={(nv) => setTimes((a) => a.map((x, j) => (j === i ? nv : x)))} />
          ))}
          <P muted>
            Puedes cambiar tus horarios {t.config.schedule_change_max_count} vez(veces) cada {t.config.schedule_change_period_days} días
            (te quedan {t.schedule_changes_left}). Solo cambian las dosis que empiezan en más de {t.config.schedule_change_min_notice_hours} h; las demás conservan su horario.
          </P>
          {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
          <Button title="Guardar horarios" onPress={save} disabled={!changed || t.schedule_changes_left <= 0} loading={saving} />
        </Card>
      )}

      <H2>Calendario de dosis</H2>
      {[...byDay.entries()].map(([day, ds]) => (
        <Card key={day}>
          <P style={{ fontWeight: "600" }}>{day}</P>
          {ds.map((d) => (
            <Row key={d.id}>
              <P>{fmtTime(d.window_start)} – {fmtTime(d.window_end)}</P>
              <Chip label={doseLabel[d.status].label} tone={doseLabel[d.status].tone} />
            </Row>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
