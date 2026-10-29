import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as scansPOST } from "@/app/v1/scans/route";
import { POST as treatmentsPOST, GET as treatmentsGET } from "@/app/v1/treatments/route";
import { PATCH as schedulePATCH } from "@/app/v1/treatments/[id]/schedule/route";
import { GET as pointsGET } from "@/app/v1/points/route";
import { db } from "@/lib/db";
import { closeDoses } from "@/lib/jobs";
import { releaseTag } from "@/lib/tag-release";
import { tx } from "@/lib/db";
import { call, closePool, json, makeUser, realTime, resetDb, seedCatalog, setNow, tagUrl } from "./helpers";

const UID = "04A1B2C3D4E5F6";

const scan = async (token: string, counter: number, extra: Record<string, unknown> = {}, uid = UID) =>
  json(await call(scansPOST, "POST", "/v1/scans", { token, body: { tag_url: tagUrl(uid, counter), ...extra } }));

async function activate(token: string, counter = 0, times?: string[]) {
  const s = await scan(token, counter);
  expect(s.body.result).toBe("activation_required");
  return json(await call(treatmentsPOST, "POST", "/v1/treatments", { token, body: { activation_token: s.body.activation_token, reminder_times: times } }));
}

const balance = async (token: string) => (await json(await call(pointsGET, "GET", "/v1/points", { token }))).body.balance;

beforeEach(async () => {
  realTime();
  await resetDb();
});
afterEach(() => realTime());
afterAll(closePool);

describe("lectura de un frasco: activación → dosis → racha", () => {
  it("recorre los cuatro controles y da puntos solo en ventana", async () => {
    await seedCatalog();
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z"); // 06:00 en Bogotá

    const act = await activate(ana.token);
    expect(act.status).toBe(201);
    expect(act.body.doses).toHaveLength(3);
    expect(await balance(ana.token)).toBe(20); // puntos de bienvenida

    // Ventana 07:00–09:00 locales = 12:00–14:00Z; aún no abre
    const early = await scan(ana.token, 1);
    expect(early.body).toMatchObject({ result: "too_early", opens_at: "2026-03-02T12:00:00.000Z" });

    setNow("2026-03-02T12:30:00Z");
    const d1 = await scan(ana.token, 2);
    expect(d1.body).toMatchObject({ result: "dose_recorded", points_earned: 10, bonus_points: 0, streak: 1, balance: 30 });

    const again = await scan(ana.token, 3);
    expect(again.body.result).toBe("no_pending_dose");

    setNow("2026-03-03T12:30:00Z");
    const d2 = await scan(ana.token, 4);
    expect(d2.body).toMatchObject({ result: "dose_recorded", points_earned: 10, bonus_points: 5, streak: 2, balance: 45 });

    // Dosis 3 sin lectura en ventana: lectura tardía, sin puntos, y el tratamiento termina
    setNow("2026-03-04T15:00:00Z");
    const late = await scan(ana.token, 5);
    expect(late.body).toMatchObject({ result: "late", points_earned: 0, balance: 45, treatment_completed: true });
    expect((await scan(ana.token, 6)).body.result).toBe("treatment_finished");

    const scans = await db.many("select result from scans order by server_time, id");
    expect(scans).toHaveLength(7); // toda lectura queda en SCANS
  });

  it("rechaza firmas inválidas, copias y tags de otra cuenta; y es idempotente", async () => {
    await seedCatalog();
    const ana = await makeUser();
    const bea = await makeUser("bea@example.com");
    setNow("2026-03-02T11:00:00Z");

    expect((await scan(ana.token, 0, { tag_url: "https://app.example.com/t?d=" + "A".repeat(32) + "&c=" + "B".repeat(16) })).body).toEqual({ result: "rejected", reason: "invalid_signature" });
    await activate(ana.token, 0);

    // Mismo enlace reenviado por la misma usuaria → mismo resultado guardado
    const first = await scan(ana.token, 1);
    const retry = await scan(ana.token, 1);
    expect(retry.body).toMatchObject({ ...first.body, idempotent_replay: true });
    // Otra cuenta con el mismo enlace, o un contador viejo → copia
    expect((await scan(bea.token, 1)).body).toEqual({ result: "rejected", reason: "replayed" });
    expect((await scan(ana.token, 5)).body.result).toBe("too_early");
    expect((await scan(ana.token, 3)).body).toEqual({ result: "rejected", reason: "replayed" });
    // Otra cuenta con un contador nuevo → el tag es de otra
    expect((await scan(bea.token, 9)).body).toEqual({ result: "rejected", reason: "owned_by_other" });
  });

  it("bloquear un tag o su lote rechaza la lectura y no reactiva el frasco", async () => {
    const cat = await seedCatalog({ tags: [UID, "04FFFFFFFFFFFF"] });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    await db.exec("update tag_batches set status = 'blocked' where id = $1", [cat.batchId]);
    expect((await scan(ana.token, 0)).body).toEqual({ result: "rejected", reason: "blocked" });
    await db.exec("update tag_batches set status = 'active' where id = $1", [cat.batchId]);
    await db.exec("update tags set status = 'blocked' where uid = $1", [UID]);
    expect((await scan(ana.token, 1)).body).toEqual({ result: "rejected", reason: "blocked" });
  });

  it("no permite activar el mismo frasco dos veces ni con token ajeno", async () => {
    await seedCatalog();
    const ana = await makeUser();
    const bea = await makeUser("bea@example.com");
    setNow("2026-03-02T11:00:00Z");
    const s = await scan(ana.token, 0);
    const mine = await json(await call(treatmentsPOST, "POST", "/v1/treatments", { token: ana.token, body: { activation_token: s.body.activation_token } }));
    expect(mine.status).toBe(201);
    // reintento idempotente de la misma usuaria
    const retry = await json(await call(treatmentsPOST, "POST", "/v1/treatments", { token: ana.token, body: { activation_token: s.body.activation_token } }));
    expect(retry.body.id).toBe(mine.body.id);
    expect(await balance(ana.token)).toBe(20); // bienvenida una sola vez
    const stolen = await json(await call(treatmentsPOST, "POST", "/v1/treatments", { token: bea.token, body: { activation_token: s.body.activation_token } }));
    expect(stolen.status).toBe(403);
  });
});

describe("tope de puntos, racha repetible y penalización", () => {
  it("respeta max_points_per_treatment", async () => {
    await seedCatalog({ config: { max_points_per_treatment: 35, welcome_points: 20, points_per_dose: 10, streak_rules: [] } });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    await activate(ana.token);
    setNow("2026-03-02T12:30:00Z");
    expect((await scan(ana.token, 1)).body.points_earned).toBe(10);
    setNow("2026-03-03T12:30:00Z");
    expect((await scan(ana.token, 2)).body.points_earned).toBe(5); // solo caben 5 más
    setNow("2026-03-04T12:30:00Z");
    expect((await scan(ana.token, 3)).body.points_earned).toBe(0);
    expect(await balance(ana.token)).toBe(35);
  });

  it("el cierre de dosis marca perdida, resta penalización (sin pasar de cero) y corta la racha", async () => {
    await seedCatalog({ config: { welcome_points: 3, streak_rules: [{ streak_length: 2, bonus_points: 50, repeatable: false }] } });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    await activate(ana.token);
    expect(await balance(ana.token)).toBe(3);

    setNow("2026-03-02T14:30:00Z"); // venció la ventana del día 1 sin lectura
    expect(await closeDoses()).toEqual({ closed: 1 });
    expect(await balance(ana.token)).toBe(0); // penalización 5 acotada al saldo 3
    expect(await closeDoses()).toEqual({ closed: 0 }); // idempotente

    setNow("2026-03-03T12:30:00Z");
    const d = await scan(ana.token, 1);
    expect(d.body).toMatchObject({ result: "dose_recorded", streak: 1, bonus_points: 0 }); // la racha empezó de nuevo
  });

  it("una lectura tardía revierte la penalización si late_dose_avoids_penalty", async () => {
    await seedCatalog({ config: { late_dose_avoids_penalty: true, welcome_points: 50 } });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    await activate(ana.token);
    setNow("2026-03-02T14:30:00Z");
    await closeDoses();
    expect(await balance(ana.token)).toBe(45);
    const late = await scan(ana.token, 1);
    expect(late.body.result).toBe("late");
    expect(await balance(ana.token)).toBe(50);
  });
});

describe("lectura sin conexión", () => {
  it("acepta si la hora del dispositivo cae en la ventana y llega a tiempo", async () => {
    await seedCatalog();
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    await activate(ana.token);
    setNow("2026-03-02T20:00:00Z"); // la lectura llega 7,5 h después
    const r = await scan(ana.token, 1, { offline: true, device_time: "2026-03-02T12:30:00Z" });
    expect(r.body).toMatchObject({ result: "dose_recorded", points_earned: 10 });
  });

  it("rechaza si el dispositivo no está en ventana o excede el plazo", async () => {
    await seedCatalog();
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    await activate(ana.token);
    setNow("2026-03-02T20:00:00Z");
    expect((await scan(ana.token, 1, { offline: true, device_time: "2026-03-02T17:00:00Z" })).body).toEqual({ result: "rejected", reason: "offline_expired" });
    setNow("2026-03-10T20:00:00Z"); // más de 48 h
    expect((await scan(ana.token, 2, { offline: true, device_time: "2026-03-02T12:30:00Z" })).body).toEqual({ result: "rejected", reason: "offline_expired" });
  });

  it("una lectura sin conexión sobre una dosis ya cerrada como perdida revierte la penalización", async () => {
    await seedCatalog({ config: { welcome_points: 50 } });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    await activate(ana.token);
    setNow("2026-03-02T14:20:00Z");
    await closeDoses();
    expect(await balance(ana.token)).toBe(45);
    const r = await scan(ana.token, 1, { offline: true, device_time: "2026-03-02T13:50:00Z" });
    expect(r.body).toMatchObject({ result: "dose_recorded", points_earned: 10 });
    expect(await balance(ana.token)).toBe(60); // 45 + 5 de reversa + 10 de la dosis
  });
});

describe("cambio de horarios", () => {
  it("regenera solo las dosis futuras y aplica el límite de cambios", async () => {
    await seedCatalog({ config: { schedule_change_max_count: 1, schedule_change_min_notice_hours: 2 } });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    const act = await activate(ana.token);
    const id = act.body.id;
    const before = (await db.many("select window_start from doses where treatment_id = $1 order by window_start", [id])).map((d) => d.window_start.toISOString());
    expect(before[0]).toBe("2026-03-02T12:00:00.000Z");

    // Hoy 12:00Z abre en 1 h (< 2 h de anticipación) → se conserva; mañana y pasado cambian a 20:00 local
    const ch = await json(await call(schedulePATCH, "PATCH", `/v1/treatments/${id}/schedule`, { token: ana.token, params: { id }, body: { reminder_times: ["20:00"] } }));
    expect(ch.status).toBe(200);
    const after = (await db.many("select window_start from doses where treatment_id = $1 order by window_start", [id])).map((d) => d.window_start.toISOString());
    expect(after[0]).toBe("2026-03-02T12:00:00.000Z");
    expect(after.slice(1).every((s) => s.endsWith("T00:00:00.000Z"))).toBe(true); // 19:00 local = 00:00Z
    expect(after).toHaveLength(3);

    const limit = await json(await call(schedulePATCH, "PATCH", `/v1/treatments/${id}/schedule`, { token: ana.token, params: { id }, body: { reminder_times: ["21:00"] } }));
    expect(limit.status).toBe(409);
    expect(limit.body.error.code).toBe("schedule_change_limit");
    expect(await db.one("select count(*)::int as n from schedule_changes")).toMatchObject({ n: 1 });
  });

  it("valida horarios y cantidad", async () => {
    await seedCatalog();
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    const act = await activate(ana.token);
    const bad = await json(await call(schedulePATCH, "PATCH", `/v1/treatments/${act.body.id}/schedule`, { token: ana.token, params: { id: act.body.id }, body: { reminder_times: ["07:00", "09:00"] } }));
    expect(bad.status).toBe(400);
    const list = await json(await call(treatmentsGET, "GET", "/v1/treatments", { token: ana.token }));
    expect(list.body.treatments[0].progress.total).toBe(3);
  });
});

describe("integridad del libro de puntos", () => {
  it("no permite editar ni borrar movimientos ni configuraciones publicadas", async () => {
    const cat = await seedCatalog();
    const ana = await makeUser();
    await db.exec("insert into points_ledger (user_id, amount, reason) values ($1, 10, 'x')", [ana.id]);
    await expect(db.exec("update points_ledger set amount = 99")).rejects.toThrow(/inmutable/);
    await expect(db.exec("delete from points_ledger")).rejects.toThrow(/inmutable/);
    await expect(db.exec("update variant_configs set points_per_dose = 99 where id = $1", [cat.configId])).rejects.toThrow(/inmutable/);
  });

  it("una dosis da puntos una sola vez (índice único)", async () => {
    const ana = await makeUser();
    await db.exec("insert into points_ledger (user_id, amount, reason, reference_type, reference_id) values ($1, 10, 'dose', 'dose', 'd1')", [ana.id]);
    await expect(db.exec("insert into points_ledger (user_id, amount, reason, reference_type, reference_id) values ($1, 10, 'dose', 'dose', 'd1')", [ana.id])).rejects.toThrow(/duplicate/);
  });
});

describe("modo de pruebas con tags sin SUN (NTAG215)", () => {
  const urlFor = (uid: string) => `https://app.example.com/t?uid=${uid}`;
  const test = (token: string, uid = "048D34B22E6180") => scan(token, 0, { tag_url: urlFor(uid) }, uid);
  afterEach(() => {
    delete process.env.NFC_INSECURE_TEST_MODE;
    delete process.env.NFC_INSECURE_TEST_MODE_ALLOW_PRODUCTION;
    delete process.env.VERCEL_ENV;
  });

  it("está apagado por defecto: la URL sin firma se rechaza", async () => {
    await seedCatalog({ tags: ["048D34B22E6180"] });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    expect((await test(ana.token)).body).toEqual({ result: "rejected", reason: "invalid_signature" });
  });

  it("activo, permite activar y registrar dosis; la misma lectura es idempotente", async () => {
    process.env.NFC_INSECURE_TEST_MODE = "1";
    await seedCatalog({ tags: ["048D34B22E6180"] });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    const first = await test(ana.token);
    expect(first.body.result).toBe("activation_required");
    expect((await test(ana.token)).body).toMatchObject({ result: "activation_required", idempotent_replay: true });
    const t = await json(await call(treatmentsPOST, "POST", "/v1/treatments", { token: ana.token, body: { activation_token: first.body.activation_token } }));
    expect(t.status).toBe(201);
    setNow("2026-03-02T12:30:00Z");
    expect((await test(ana.token)).body).toMatchObject({ result: "dose_recorded", points_earned: 10 });
  });

  it("en producción solo funciona con la excepción explícita NFC_INSECURE_TEST_MODE_ALLOW_PRODUCTION", async () => {
    process.env.NFC_INSECURE_TEST_MODE = "1";
    process.env.NFC_INSECURE_TEST_MODE_ALLOW_PRODUCTION = "1";
    process.env.VERCEL_ENV = "production";
    await seedCatalog({ tags: ["048D34B22E6180"] });
    const ana = await makeUser();
    setNow("2026-03-02T11:00:00Z");
    expect((await test(ana.token)).body.result).toBe("activation_required");
  });

  it("por defecto no funciona en el entorno de producción de Vercel", async () => {
    process.env.NFC_INSECURE_TEST_MODE = "1";
    process.env.VERCEL_ENV = "production";
    await seedCatalog({ tags: ["048D34B22E6180"] });
    const ana = await makeUser();
    expect((await test(ana.token)).body).toEqual({ result: "rejected", reason: "invalid_signature" });
  });
});

describe("liberar un tag reclamado", () => {
  const adminId = null as unknown as string; // la bitácora admite null; aquí no hace falta un administrador real

  it("lo deja sin reclamar, borra el tratamiento, conserva puntos y lecturas, y permite reactivarlo", async () => {
    await seedCatalog();
    const ana = await makeUser("ana@example.com");
    const beto = await makeUser("beto@example.com");
    setNow("2026-03-02T11:00:00Z");
    expect((await activate(ana.token)).status).toBe(201);
    setNow("2026-03-02T12:30:00Z");
    expect((await scan(ana.token, 1)).body.result).toBe("dose_recorded");
    const pointsBefore = await balance(ana.token);
    expect(pointsBefore).toBeGreaterThan(0);

    // Otra clienta no puede usarlo mientras es de Ana
    expect((await scan(beto.token, 2)).body).toEqual({ result: "rejected", reason: "owned_by_other" });

    const out = await tx((t) => releaseTag(t, adminId, UID.toLowerCase(), "Frasco asignado por error"));
    expect(out).toMatchObject({ uid: UID, status: "unclaimed", treatment_removed: true });

    const tag = await db.one<any>("select status, claimed_by, claimed_at, last_counter from tags where uid = $1", [UID]);
    expect(tag).toMatchObject({ status: "unclaimed", claimed_by: null, claimed_at: null });
    expect(tag.last_counter).toBeGreaterThanOrEqual(2); // el contador se conserva (anti-repetición)
    expect(Number((await db.one<any>("select count(*) as n from treatments where tag_uid = $1", [UID]))!.n)).toBe(0);
    expect(Number((await db.one<any>("select count(*) as n from doses", []))!.n)).toBe(0);
    expect(Number((await db.one<any>("select count(*) as n from scans where tag_uid = $1 and dose_id is not null", [UID]))!.n)).toBe(0);
    expect(Number((await db.one<any>("select count(*) as n from scans where tag_uid = $1", [UID]))!.n)).toBeGreaterThanOrEqual(3);
    expect(await balance(ana.token)).toBe(pointsBefore);
    const log = await db.one<any>("select action, entity_id, before, after from audit_log where action = 'tag.release'");
    expect(log).toMatchObject({ entity_id: UID });
    expect(log.before.treatment.doses).toBeTruthy();

    // Ahora Beto lo puede activar
    const act = await scan(beto.token, 3);
    expect(act.body.result).toBe("activation_required");
    const t2 = await json(await call(treatmentsPOST, "POST", "/v1/treatments", { token: beto.token, body: { activation_token: act.body.activation_token } }));
    expect(t2.status).toBe(201);
  });

  it("libera también un tag bloqueado con dueña, y rechaza uno sin reclamar", async () => {
    await seedCatalog({ tags: [UID, "048D34B22E6180"] });
    await expect(tx((t) => releaseTag(t, adminId, "048D34B22E6180", "motivo de prueba"))).rejects.toMatchObject({ code: "tag_not_claimed" });

    const ana = await makeUser("ana@example.com");
    setNow("2026-03-02T11:00:00Z");
    expect((await activate(ana.token)).status).toBe(201);
    await db.exec("update tags set status = 'blocked', blocked_reason = 'x' where uid = $1", [UID]);
    const out = await tx((t) => releaseTag(t, adminId, UID, "Liberar tag bloqueado"));
    expect(out.status).toBe("unclaimed");
    expect((await db.one<any>("select blocked_reason from tags where uid = $1", [UID]))!.blocked_reason).toBeNull();
  });

  it("un tag inexistente responde tag_not_found", async () => {
    await seedCatalog();
    await expect(tx((t) => releaseTag(t, adminId, "AAAAAAAAAAAAAA", "motivo de prueba"))).rejects.toMatchObject({ code: "tag_not_found" });
  });
});
