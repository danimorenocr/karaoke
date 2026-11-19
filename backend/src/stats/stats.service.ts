import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Range = 'today' | 'yesterday' | 'day' | '7d' | '30d';
const DAY = 86_400_000;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const top = <T extends string>(map: Map<T, { n: number; label: string }>, k: number) =>
  [...map.values()].sort((a, b) => b.n - a.n).slice(0, k);

function bump(map: Map<string, { n: number; label: string }>, key: string, label: string) {
  const cur = map.get(key);
  if (cur) cur.n++;
  else map.set(key, { n: 1, label });
}

/** "Artista - Cancion (Karaoke)" -> "Artista". Heuristica: si no hay guion se usa el canal. */
function artistOf(title: string, channel?: string | null): string {
  const first = title.includes(' - ') ? title.split(' - ')[0] : channel ?? title;
  return first.replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(title: string): string {
  return title.replace(/\s*[\(\[][^)\]]*(karaoke|official|oficial|lyric|letra|video|audio)[^)\]]*[\)\]]/gi, '').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  /** Resumenes ya calculados por local/rango/zona/dia: los mira mucha gente o el mismo panel cada minuto, y recalcular lee hasta 50.000 eventos. */
  private cache = new Map<string, { at: number; ttl: number; p: Promise<Awaited<ReturnType<StatsService['computeFresh']>>> }>();

  /** Dias ya cerrados no cambian (5 min por si se corrige algo); los que incluyen "ahora" duran 45 s. */
  compute(businessId: string | undefined, range: Range, tzOffsetMin: number, day?: string) {
    const key = `${businessId ?? 'all'}|${range}|${tzOffsetMin}|${range === 'day' ? day ?? '' : ''}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.p;
    const e = { at: Date.now(), ttl: 45_000, p: this.computeFresh(businessId, range, tzOffsetMin, day) };
    this.cache.set(key, e);
    e.p.then((r) => { e.ttl = r.to && r.to.getTime() <= Date.now() ? 300_000 : 45_000; }, () => { if (this.cache.get(key) === e) this.cache.delete(key); });
    if (this.cache.size > 100) {
      for (const [k, v] of this.cache) if (Date.now() - v.at >= v.ttl) this.cache.delete(k);
      for (const k of this.cache.keys()) { if (this.cache.size <= 100) break; this.cache.delete(k); }
    }
    return e.p;
  }

  /** `tzOffsetMin` = new Date().getTimezoneOffset() del navegador (Colombia: 300). */
  /** `businessId` indefinido = todos los establecimientos (super admin). */
  async computeFresh(businessId: string | undefined, range: Range, tzOffsetMin: number, day?: string) {
    const now = Date.now();
    const localNow = now - tzOffsetMin * 60_000;
    const localMidnight = Math.floor(localNow / DAY) * DAY;
    const startOfToday = localMidnight + tzOffsetMin * 60_000;

    // Dia suelto: ayer, o una fecha (YYYY-MM-DD) elegida en el calendario. Si la fecha no es valida se usa hoy.
    let dayStart: number | null = null;
    if (range === 'yesterday') dayStart = startOfToday - DAY;
    else if (range === 'day') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
      if (m) dayStart = Date.UTC(+m[1], +m[2] - 1, +m[3]) + tzOffsetMin * 60_000;
    }
    const single = dayStart !== null || range === 'today';
    const span = single ? null : range === '7d' ? 7 : 30;
    const base = dayStart ?? startOfToday;
    const from = new Date(span ? startOfToday - (span - 1) * DAY : base);
    const to = single && dayStart !== null ? new Date(base + DAY) : undefined;
    // Comparacion: un dia vs el mismo dia de la semana anterior; 7d/30d vs el periodo anterior de igual largo
    const prevFrom = new Date(span ? from.getTime() - span * DAY : base - 7 * DAY);
    const prevTo = new Date(span ? from.getTime() : base - 7 * DAY + DAY);

    const [events, rows, sessions, tablesTotal, prevRequests] = await Promise.all([
      this.prisma.karaokeEvent.findMany({
        where: { businessId, occurredAt: { gte: from, lt: to } },
        select: { type: true, occurredAt: true, sessionId: true, tableId: true, metadata: true },
        orderBy: { occurredAt: 'asc' },
        take: 50_000,
      }),
      this.prisma.songRequest.findMany({
        where: { businessId, requestedAt: { gte: from, lt: to } },
        select: { videoId: true, title: true, channel: true, status: true, requestedAt: true, approvedAt: true, startedAt: true, rejectionReason: true },
      }),
      this.prisma.karaokeSession.findMany({ where: { businessId, startedAt: { gte: from, lt: to } }, select: { startedAt: true, endedAt: true } }),
      this.prisma.table.count({ where: { businessId, active: true } }),
      this.prisma.songRequest.count({ where: { businessId, requestedAt: { gte: prevFrom, lt: prevTo } } }),
    ]);

    const meta = (e: { metadata: unknown }) => (e.metadata ?? {}) as Record<string, any>;
    const of = (type: string) => events.filter((e) => e.type === type);

    // ---- Participacion ----
    const scans = of('QR_SCANNED');
    const created = of('REQUEST_CREATED');
    const clientCreated = created.filter((e) => meta(e).source !== 'dj');
    const scannedTables = new Set(scans.map((e) => e.tableId).filter(Boolean));
    const requestingTables = new Set(clientCreated.map((e) => e.tableId).filter(Boolean));
    const convertedTables = [...scannedTables].filter((t) => requestingTables.has(t));

    const scanClients = new Set(scans.map((e) => meta(e).clientId).filter(Boolean));
    const requestClients = new Set(clientCreated.map((e) => meta(e).clientId).filter(Boolean));
    const convertedClients = [...scanClients].filter((c) => requestClients.has(c));

    // Tiempo desde el primer escaneo hasta la primera solicitud de cada navegador
    const firstScan = new Map<string, number>();
    scans.forEach((e) => { const c = meta(e).clientId; if (c && !firstScan.has(c)) firstScan.set(c, e.occurredAt.getTime()); });
    const firstReq = new Map<string, number>();
    clientCreated.forEach((e) => { const c = meta(e).clientId; if (c && !firstReq.has(c)) firstReq.set(c, e.occurredAt.getTime()); });
    const toFirst = [...firstReq].map(([c, t]) => (firstScan.has(c) ? (t - firstScan.get(c)!) / 1000 : NaN)).filter((x) => x >= 0);

    // Recurrencia aproximada: navegadores con actividad en 2+ sesiones de karaoke
    const clientSessions = new Map<string, Set<string>>();
    events.forEach((e) => {
      const c = meta(e).clientId;
      if (c && e.sessionId) (clientSessions.get(c) ?? clientSessions.set(c, new Set()).get(c)!).add(e.sessionId);
    });
    const recurring = [...clientSessions.values()].filter((s) => s.size >= 2).length;

    // ---- Musica ----
    const started = of('PLAYBACK_STARTED').length;
    const completed = of('PLAYBACK_COMPLETED').length;
    const skipped = of('PLAYBACK_SKIPPED').length;
    const failed = of('PLAYBACK_FAILED').length;

    const songs = new Map<string, { n: number; label: string }>();
    const artists = new Map<string, { n: number; label: string }>();
    const rejections = new Map<string, { n: number; label: string }>();
    rows.forEach((r) => {
      bump(songs, r.videoId, cleanTitle(r.title));
      const a = artistOf(r.title, r.channel);
      if (a) bump(artists, a.toLowerCase(), a);
      if (r.status === 'REJECTED') bump(rejections, (r.rejectionReason ?? 'Sin motivo').toLowerCase(), r.rejectionReason ?? 'Sin motivo');
    });

    const searches = of('SEARCH_PERFORMED');
    const queries = new Map<string, { n: number; label: string }>();
    searches.forEach((e) => { const q = String(meta(e).q ?? '').trim().toLowerCase(); if (q) bump(queries, q, q); });

    // ---- Operacion ----
    const manualApprovals = rows.filter((r) => r.approvedAt && r.approvedAt.getTime() - r.requestedAt.getTime() > 2000).map((r) => (r.approvedAt!.getTime() - r.requestedAt.getTime()) / 1000);
    const waits = rows.filter((r) => r.startedAt && r.approvedAt).map((r) => Math.max(0, (r.startedAt!.getTime() - r.approvedAt!.getTime()) / 1000));

    const perHour = Array(24).fill(0) as number[];
    created.forEach((e) => { perHour[new Date(e.occurredAt.getTime() - tzOffsetMin * 60_000).getUTCHours()]++; });

    const sessionMins = sessions.map((s) => ((s.endedAt?.getTime() ?? now) - s.startedAt.getTime()) / 60_000);

    // ---- Satisfaccion ----
    const feedback = of('FEEDBACK_SUBMITTED');
    const ratings = feedback.map((e) => Number(meta(e).rating)).filter((n) => n >= 1 && n <= 5);

    const requests = rows.length;
    return {
      range,
      from,
      to,
      comparison: { previousRequests: prevRequests, changePct: prevRequests > 0 ? Math.round(((requests - prevRequests) / prevRequests) * 100) : null },
      participation: {
        requests,
        tablesTotal,
        tablesParticipating: requestingTables.size,
        qrScans: scans.length,
        scannedTables: scannedTables.size,
        tableConversionPct: pct(convertedTables.length, scannedTables.size),
        browserConversionPct: pct(convertedClients.length, scanClients.size),
        requestsPerTable: requestingTables.size ? Math.round((clientCreated.length / requestingTables.size) * 10) / 10 : null,
        avgSecondsToFirstRequest: avg(toFirst) === null ? null : Math.round(avg(toFirst)!),
        recurringBrowsers: recurring,
        totalBrowsers: clientSessions.size,
      },
      music: {
        requested: requests,
        approved: of('REQUEST_APPROVED').length,
        rejected: of('REQUEST_REJECTED').length,
        played: started,
        completed,
        skipped,
        failed,
        completionPct: pct(completed, started),
        topSongs: top(songs, 10),
        topArtists: top(artists, 8),
        topSearches: top(queries, 8),
        searches: searches.length,
      },
      operations: {
        avgApprovalSeconds: avg(manualApprovals) === null ? null : Math.round(avg(manualApprovals)!),
        avgWaitSeconds: avg(waits) === null ? null : Math.round(avg(waits)!),
        requestsPerHour: perHour,
        rejectionReasons: top(rejections, 6),
        sessions: sessions.length,
        avgSessionMinutes: avg(sessionMins) === null ? null : Math.round(avg(sessionMins)!),
      },
      satisfaction: {
        responses: ratings.length,
        avgRating: ratings.length ? Math.round(avg(ratings)! * 10) / 10 : null,
        comments: feedback
          .map((e) => String(meta(e).comment ?? '').trim())
          .filter(Boolean)
          .slice(-5)
          .reverse(),
      },
    };
  }
}
