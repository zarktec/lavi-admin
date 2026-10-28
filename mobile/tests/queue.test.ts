import { describe, expect, it } from "vitest";
import { ScanQueue, type KV } from "../src/lib/queue";

const memory = (): KV => {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
};
const item = (n: number) => ({ tag_url: `https://x/t?d=${n}`, device_time: `2026-03-02T12:0${n}:00Z` });
const ok = { kind: "sent" as const, response: { result: "no_pending_dose", next_dose: null } as const };

describe("ScanQueue", () => {
  it("guarda sin duplicar la misma URL y reenvía en orden con offline:true", async () => {
    const q = new ScanQueue(memory());
    await q.enqueue(item(1));
    await q.enqueue(item(2));
    await q.enqueue(item(1));
    expect(await q.list()).toHaveLength(2);
    const seen: any[] = [];
    const r = await q.flush(async (req) => (seen.push(req), ok));
    expect(seen.map((s) => s.tag_url)).toEqual([item(1).tag_url, item(2).tag_url]);
    expect(seen.every((s) => s.offline === true)).toBe(true);
    expect(r.sent).toHaveLength(2);
    expect(r.remaining).toBe(0);
    expect(await q.list()).toEqual([]);
  });

  it("se detiene en el primer reintento y conserva el resto", async () => {
    const q = new ScanQueue(memory());
    for (const n of [1, 2, 3]) await q.enqueue(item(n));
    let calls = 0;
    const r = await q.flush(async () => (++calls === 2 ? { kind: "retry" } : ok));
    expect(calls).toBe(2);
    expect(r.sent).toHaveLength(1);
    expect(r.remaining).toBe(2);
    expect((await q.list()).map((i) => i.tag_url)).toEqual([item(2).tag_url, item(3).tag_url]);
  });

  it("descarta las rechazadas por el servidor y no corre dos envíos a la vez", async () => {
    const q = new ScanQueue(memory());
    await q.enqueue(item(1));
    let calls = 0;
    const slow = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return { kind: "drop" as const };
    };
    const [a, b] = await Promise.all([q.flush(slow), q.flush(slow)]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    expect(a.dropped).toHaveLength(1);
  });

  it("limita el tamaño de la cola", async () => {
    const q = new ScanQueue(memory(), "k", 3);
    for (let i = 0; i < 6; i++) await q.enqueue({ tag_url: `u${i}`, device_time: "t" });
    expect((await q.list()).map((i) => i.tag_url)).toEqual(["u3", "u4", "u5"]);
  });
});
