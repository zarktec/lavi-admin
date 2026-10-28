import type { ScanRequest, ScanResponse } from "../api/types";

export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface QueuedScan {
  tag_url: string;
  device_time: string;
}

/** Qué hacer con una lectura tras intentar enviarla. */
export type SendOutcome = { kind: "sent"; response: ScanResponse } | { kind: "retry" } | { kind: "drop" };

export interface FlushResult {
  sent: { item: QueuedScan; response: ScanResponse }[];
  dropped: QueuedScan[];
  remaining: number;
}

/** Cola de lecturas hechas sin conexión. El backend decide el resultado; aquí solo se guarda y se reenvía en orden. */
export class ScanQueue {
  private flushing: Promise<FlushResult> | null = null;

  constructor(private kv: KV, private key = "scan_queue_v1", private max = 50) {}

  async list(): Promise<QueuedScan[]> {
    const raw = await this.kv.getItem(this.key);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private save(items: QueuedScan[]) {
    return items.length ? this.kv.setItem(this.key, JSON.stringify(items)) : this.kv.removeItem(this.key);
  }

  /** Guarda la lectura; la misma URL no se encola dos veces. */
  async enqueue(item: QueuedScan): Promise<number> {
    const items = await this.list();
    if (!items.some((i) => i.tag_url === item.tag_url)) items.push(item);
    const trimmed = items.slice(-this.max);
    await this.save(trimmed);
    return trimmed.length;
  }

  /** Envía en orden (el contador del tag exige orden); se detiene en el primer "retry". */
  flush(send: (req: ScanRequest) => Promise<SendOutcome>): Promise<FlushResult> {
    this.flushing ??= this.doFlush(send).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(send: (req: ScanRequest) => Promise<SendOutcome>): Promise<FlushResult> {
    const items = await this.list();
    const result: FlushResult = { sent: [], dropped: [], remaining: items.length };
    let i = 0;
    for (; i < items.length; i++) {
      const outcome = await send({ ...items[i], offline: true });
      if (outcome.kind === "retry") break;
      if (outcome.kind === "sent") result.sent.push({ item: items[i], response: outcome.response });
      else result.dropped.push(items[i]);
    }
    const rest = items.slice(i);
    await this.save(rest);
    result.remaining = rest.length;
    return result;
  }
}
