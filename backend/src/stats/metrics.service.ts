import { Injectable } from '@nestjs/common';

interface Sample {
  at: number;
  ms: number;
  status: number;
}

const WINDOW_MS = 15 * 60_000;

/** Metricas tecnicas en memoria (se reinician con cada despliegue). Para vigilar la plataforma, no para el dueno del bar. */
@Injectable()
export class MetricsService {
  readonly startedAt = Date.now();
  private samples: Sample[] = [];
  private socketConnects = 0;
  private socketDisconnects = 0;

  recordRequest(ms: number, status: number) {
    const now = Date.now();
    this.samples.push({ at: now, ms, status });
    if (this.samples.length > 5000) this.samples.splice(0, this.samples.length - 5000);
  }

  socketConnected() {
    this.socketConnects++;
  }
  socketDisconnected() {
    this.socketDisconnects++;
  }

  snapshot() {
    const from = Date.now() - WINDOW_MS;
    const recent = this.samples.filter((s) => s.at >= from);
    const sorted = recent.map((s) => s.ms).sort((a, b) => a - b);
    const pct = (p: number) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]) : 0);
    return {
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      windowMin: WINDOW_MS / 60_000,
      requests: recent.length,
      errors4xx: recent.filter((s) => s.status >= 400 && s.status < 500).length,
      errors5xx: recent.filter((s) => s.status >= 500).length,
      latencyMs: { p50: pct(50), p95: pct(95), p99: pct(99) },
      socket: { connectsSinceStart: this.socketConnects, disconnectsSinceStart: this.socketDisconnects },
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
  }
}
