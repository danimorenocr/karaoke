import { KARAOKE_RE, YoutubeService } from '../youtube/youtube.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AutoDjMode, Prisma, RequestStatus, SongRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { allowedExperiences } from '../experiences';
import { RealtimeService } from '../realtime/realtime.gateway';
import { EventsService } from '../stats/events.service';

type Tx = Prisma.TransactionClient;

export interface NewRequestInput {
  videoId: string;
  title: string;
  channel?: string;
  thumbnail?: string;
  durationSec?: number;
  clientId?: string; // id anonimo del navegador (para medir recurrencia); no es un dato personal
}

const WAITING: RequestStatus[] = ['PENDING', 'APPROVED'];
// Ocupan cupo de la mesa: en espera o sonando. El cupo se libera al completarse (o cancelarse/rechazarse).
const HOLDING: RequestStatus[] = ['PENDING', 'APPROVED', 'PLAYING'];
/** Generos que el DJ puede elegir para el Auto-DJ (nombre = texto de busqueda en YouTube). */
export const AUTO_DJ_GENRES = [
  'Salsa', 'Vallenato', 'Reggaetón', 'Bachata', 'Merengue', 'Cumbia', 'Baladas románticas', 'Pop en español',
  'Rock en español', 'Rock clásico', 'Pop en inglés', 'Regional mexicano', 'Música popular', 'Tropical',
  'Urbano', 'Electrónica', 'Años 80', 'Años 90',
];
const GENRE_QUERIES = ['éxitos', 'las mejores canciones', 'clásicos', 'canciones más populares', 'hits'];
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const FINISHED: RequestStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED'];

/**
 * Toda la logica de sesion/cola/reproduccion. El backend decide que suena; la TV solo ejecuta.
 * Cada mutacion toma un lock por establecimiento, asi dos eventos simultaneos
 * (ej. "video termino" duplicado) se serializan y el segundo se ignora.
 */
@Injectable()
export class QueueService {
  constructor(private prisma: PrismaService, private rt: RealtimeService, private events: EventsService, private yt: YoutubeService) {}

  // ---------- helpers ----------

  private async locked<T>(businessId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId}))`;
        return fn(tx);
      },
      { timeout: 15_000 },
    );
    this.rt.queueUpdated(businessId);
    return result;
  }

  private activeSession(tx: Tx | PrismaService, businessId: string) {
    return tx.karaokeSession.findFirst({ where: { businessId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } });
  }

  private async requireActiveSession(tx: Tx, businessId: string) {
    const s = await this.activeSession(tx, businessId);
    if (!s) throw new ConflictException('No hay una sesion de karaoke activa');
    return s;
  }

  /** Si nada suena y la TV ya fue iniciada, sube la siguiente aprobada (las solicitudes siempre antes que el Auto-DJ). */
  private async promote(tx: Tx, sessionId: string) {
    const session = await tx.karaokeSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (!session.tvStarted || session.status !== 'ACTIVE') return;
    await this.topUpAuto(tx, session.businessId, sessionId);
    const playing = await tx.songRequest.findFirst({ where: { sessionId, status: 'PLAYING' } });
    if (playing) return;
    const next = await tx.songRequest.findFirst({
      where: { sessionId, status: 'APPROVED' },
      orderBy: [{ auto: 'asc' }, { position: 'asc' }, { requestedAt: 'asc' }],
    });
    if (next) {
      await tx.songRequest.update({ where: { id: next.id }, data: { status: 'PLAYING', startedAt: new Date() } });
      await tx.karaokeSession.update({ where: { id: sessionId }, data: { positionSec: 0 } }); // cancion nueva: empieza desde 0
      this.events.record({ businessId: next.businessId, sessionId, tableId: next.tableId, type: 'PLAYBACK_STARTED', metadata: { requestId: next.id, videoId: next.videoId, auto: next.auto } });
      await this.topUpAuto(tx, session.businessId, sessionId); // repone la cola automatica
    }
  }

  /** Auto-DJ activo: mantiene ya elegidas las proximas canciones normales (cola automatica), separadas de las solicitudes. */
  private async topUpAuto(tx: Tx, businessId: string, sessionId: string, want = 3) {
    const biz = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { autoDjMode: true, autoDjGenres: true } });
    if (biz.autoDjMode !== 'AUTO') return;
    const have = await tx.songRequest.count({ where: { sessionId, status: 'APPROVED', auto: true } });
    for (let i = have; i < want; i++) {
      const song = await this.pickAuto(tx, businessId, biz.autoDjGenres).catch(() => null);
      if (!song) break;
      const last = await tx.songRequest.aggregate({ where: { sessionId }, _max: { position: true } });
      await tx.songRequest.create({
        data: {
          businessId, sessionId, tableId: null, auto: true,
          videoId: song.videoId, title: song.title.slice(0, 200), channel: song.channelTitle?.slice(0, 120), thumbnail: (song.thumbnail || ytThumb(song.videoId)).slice(0, 500), durationSec: song.durationSec,
          position: (last._max.position ?? 0) + 1, status: 'APPROVED', approvedAt: new Date(),
        },
      });
    }
  }

  /** Quita de un titulo lo que lo marca como karaoke para buscar la version normal. */
  private cleanTitle(t: string) {
    return t
      .replace(/[\(\[][^\)\]]*(karaoke|instrumental|pista|sing[- ]?along|letra|lyrics?)[^\)\]]*[\)\]]/gi, ' ')
      .replace(/karaoke|instrumental|pista|sing[- ]?along|con letra|lyrics?|letra|versi[oó]n/gi, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /**
   * Elige la proxima cancion NORMAL (nunca karaoke): sale de lo mas pedido en este establecimiento
   * (y, si no hay historial, de lo mas pedido en toda la plataforma), sin repetir lo sonado en las ultimas horas.
   */
  private async pickAuto(tx: Tx, businessId: string, genres: string[] = []) {
    const since = new Date(Date.now() - 6 * 3600_000);
    const recentRows = await tx.songRequest.findMany({
      where: { businessId, requestedAt: { gt: since }, status: { in: ['APPROVED', 'PLAYING', 'COMPLETED', 'FAILED', 'CANCELLED'] } },
      select: { videoId: true, title: true },
    });
    const norm = (t: string) => this.cleanTitle(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const recentIds = new Set(recentRows.map((r) => r.videoId));
    const recentTitles = new Set(recentRows.map((r) => norm(r.title)));

    const popular = async (scope: Prisma.SongRequestWhereInput) => {
      const rows = await tx.songRequest.groupBy({
        by: ['videoId', 'title'],
        where: { ...scope, auto: false, status: { in: ['APPROVED', 'PLAYING', 'COMPLETED'] } },
        _count: { _all: true },
        orderBy: { _count: { videoId: 'desc' } },
        take: 40,
      });
      // Sorteo ponderado por veces pedida entre las que no sonaron hace poco
      const pool = rows.filter((r) => !recentIds.has(r.videoId) && !recentTitles.has(norm(r.title)));
      const picks: typeof pool = [];
      while (pool.length && picks.length < 4) {
        const total = pool.reduce((a, r) => a + r._count._all, 0);
        let x = Math.random() * total;
        const i = pool.findIndex((r) => (x -= r._count._all) < 0);
        picks.push(...pool.splice(i < 0 ? 0 : i, 1));
      }
      return picks;
    };

    // Con generos elegidos por el DJ: se busca musica de esos generos (normal, no karaoke)
    const chosen = genres.filter((g) => AUTO_DJ_GENRES.includes(g));
    for (let attempt = 0; chosen.length && attempt < 3; attempt++) {
      const g = chosen[Math.floor(Math.random() * chosen.length)];
      const q = `${g} ${GENRE_QUERIES[Math.floor(Math.random() * GENRE_QUERIES.length)]}`;
      const found = await this.yt.searchSongs(q, 'ANY').catch(() => []);
      const ok = found.filter((f: any) =>
        !KARAOKE_RE.test(`${f.title} ${f.channelTitle}`) && !f.risky && f.isMusic !== false &&
        !recentIds.has(f.videoId) && !recentTitles.has(norm(f.title)) &&
        (!f.durationSec || (f.durationSec >= 90 && f.durationSec <= 600)),
      );
      if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
    }

    for (const scope of [{ businessId }, {}] as Prisma.SongRequestWhereInput[]) {
      for (const c of await popular(scope)) {
        if (!KARAOKE_RE.test(c.title)) return { videoId: c.videoId, title: c.title, channelTitle: undefined as string | undefined, thumbnail: undefined as string | undefined, durationSec: undefined as number | undefined };
        // Lo pedido era una version karaoke: se busca la version normal de la misma cancion
        const found = await this.yt.searchSongs(this.cleanTitle(c.title), 'ANY').catch(() => []);
        const v = found.find((f: any) => !KARAOKE_RE.test(`${f.title} ${f.channelTitle}`) && !f.risky && !recentIds.has(f.videoId) && !recentTitles.has(norm(f.title)));
        if (v) return v;
      }
    }
    return null;
  }

  /** El DJ activa/desactiva el Auto-DJ y/o cambia sus generos; la cola automatica se rehace con lo nuevo. */
  setAutoDj(businessId: string, mode?: AutoDjMode, genres?: string[]) {
    return this.locked(businessId, async (tx) => {
      const data: Prisma.BusinessUpdateInput = {};
      if (mode) data.autoDjMode = mode;
      if (genres) data.autoDjGenres = genres.filter((g) => AUTO_DJ_GENRES.includes(g));
      await tx.business.update({ where: { id: businessId }, data });
      const s = await this.activeSession(tx, businessId);
      if (s && (mode === 'OFF' || genres)) {
        await tx.songRequest.updateMany({ where: { sessionId: s.id, auto: true, status: 'APPROVED' }, data: { status: 'CANCELLED', completedAt: new Date() } });
      }
      if (s) await this.promote(tx, s.id);
      return { ok: true };
    });
  }

  private async getOwned(tx: Tx, businessId: string, id: string) {
    const r = await tx.songRequest.findFirst({ where: { id, businessId } });
    if (!r) throw new NotFoundException('Solicitud no encontrada');
    return r;
  }

  private view(r: SongRequest & { table?: { name: string } | null }) {
    return {
      id: r.id,
      videoId: r.videoId,
      title: r.title,
      channel: r.channel,
      thumbnail: r.thumbnail,
      durationSec: r.durationSec,
      status: r.status,
      position: r.position,
      tableName: r.auto ? 'Auto-DJ' : r.table?.name,
      auto: r.auto,
      rejectionReason: r.rejectionReason,
      requestedAt: r.requestedAt,
    };
  }

  // ---------- estados (lectura) ----------

  async djState(businessId: string) {
    const session = await this.activeSession(this.prisma, businessId);
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    // TV conectada = socket abierto en esta instancia O latido reciente guardado en BD (sirve tras reinicios o con varias instancias)
    const tvConnected = this.rt.tvCount(businessId) > 0 || (!!session?.tvLastSeenAt && Date.now() - session.tvLastSeenAt.getTime() < 20_000);
    // tvArmed: la TV ya pulso "Iniciar karaoke" y sigue enviando latidos (la pagina esta abierta Y reproduciendo)
    const tvArmed = !!session?.tvLastSeenAt && Date.now() - session.tvLastSeenAt.getTime() < 20_000;
    const base = { business: { name: business.name, autoApprove: business.autoApprove, searchMode: business.searchMode, autoDjMode: business.autoDjMode, autoDjGenres: business.autoDjGenres, autoDjCatalog: AUTO_DJ_GENRES, tvBannerAt: business.tvBannerAt, tvInterludeSec: business.tvInterludeSec }, tvConnected, tvArmed };
    if (!session) return { ...base, session: null, current: null, queue: [], autoQueue: [], pending: [], history: [], tables: [] };

    const include = { table: { select: { name: true } } };
    const [tableRows, active, current, queue, autoQueue, pending, history] = await Promise.all([
      this.prisma.table.findMany({ where: { businessId, active: true }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.songRequest.groupBy({
        by: ['tableId'],
        where: { sessionId: session.id, status: { in: ['PENDING', 'APPROVED'] } },
        _count: { _all: true },
      }),
      this.prisma.songRequest.findFirst({ where: { sessionId: session.id, status: 'PLAYING' }, include }),
      this.prisma.songRequest.findMany({ where: { sessionId: session.id, status: 'APPROVED', auto: false }, include, orderBy: [{ position: 'asc' }, { requestedAt: 'asc' }] }),
      this.prisma.songRequest.findMany({ where: { sessionId: session.id, status: 'APPROVED', auto: true }, include, orderBy: { position: 'asc' } }),
      this.prisma.songRequest.findMany({ where: { sessionId: session.id, status: 'PENDING' }, include, orderBy: { position: 'asc' } }),
      this.prisma.songRequest.findMany({ where: { sessionId: session.id, status: { in: FINISHED } }, include, orderBy: { requestedAt: 'desc' }, take: 20 }),
    ]);
    return {
      ...base,
      session: {
        id: session.id,
        requestsOpen: session.requestsOpen,
        paused: session.paused,
        tvStarted: session.tvStarted,
        positionSec: session.positionSec,
        startedAt: session.startedAt,
      },
      current: current && this.view(current),
      queue: queue.map((r) => this.view(r)),
      autoQueue: autoQueue.map((r) => this.view(r)),
      pending: pending.map((r) => this.view(r)),
      history: history.map((r) => this.view(r)),
      // Mesas con canciones en espera primero (para poder desvincularlas)
      tables: tableRows
        .map((t) => ({ id: t.id, name: t.name, waiting: active.find((a) => a.tableId === t.id)?._count._all ?? 0 }))
        .sort((a, b) => b.waiting - a.waiting),
    };
  }

  /** Estado para la TV: lo minimo para reproducir. */
  async playerState(businessId: string) {
    const s = await this.djState(businessId);
    return {
      business: s.business,
      session: s.session,
      current: s.current,
      next: s.queue[0] ?? s.autoQueue[0] ?? null,
      upcoming: [...s.queue, ...s.autoQueue].slice(0, 5),
    };
  }

  async tvBanner(businessId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { tvBanner: true } });
    return { banner: b.tvBanner };
  }

  async publicState(tableToken: string) {
    const table = await this.prisma.table.findUnique({ where: { qrToken: tableToken }, include: { business: true } });
    if (!table || !table.active || table.business.status !== 'ACTIVE') {
      throw new NotFoundException('Este codigo QR no es valido');
    }
    const b = table.business;
    const session = await this.activeSession(this.prisma, b.id);
    const out = {
      business: { name: b.name, logoUrl: b.logoUrl, primaryColor: b.primaryColor, searchMode: b.searchMode },
      table: { name: table.name, experienceId: allowedExperiences(b.allowedExperiences).includes(table.experienceId) ? table.experienceId : 'classic' },
      session: session ? { open: session.requestsOpen } : null,
      maxPending: b.maxPendingPerTable,
      current: null as any,
      queue: [] as any[],
      mine: [] as any[],
    };
    if (!session) return out;
    const include = { table: { select: { name: true } } };
    const [current, queue, mine] = await Promise.all([
      this.prisma.songRequest.findFirst({ where: { sessionId: session.id, status: 'PLAYING' }, include }),
      this.prisma.songRequest.findMany({ where: { sessionId: session.id, status: 'APPROVED', auto: false }, include, orderBy: [{ position: 'asc' }, { requestedAt: 'asc' }] }),
      this.prisma.songRequest.findMany({
        // Tras "desvincular", la mesa empieza de cero: no ve lo pedido antes
        where: { sessionId: session.id, tableId: table.id, ...(table.historyClearedAt ? { requestedAt: { gt: table.historyClearedAt } } : {}) },
        include,
        orderBy: { requestedAt: 'desc' },
        take: 20,
      }),
    ]);
    // El cliente no necesita saber la razon interna ni ids de otras mesas; solo nombre de mesa.
    out.current = current && this.view(current);
    out.queue = queue.map((r) => this.view(r));
    out.mine = mine.map((r) => this.view(r));
    return out;
  }

  // ---------- sesion ----------

  startSession(businessId: string) {
    return this.locked(businessId, async (tx) => {
      const existing = await this.activeSession(tx, businessId);
      if (existing) return existing;
      return tx.karaokeSession.create({ data: { businessId } });
    });
  }

  stopSession(businessId: string) {
    return this.locked(businessId, async (tx) => {
      const s = await this.requireActiveSession(tx, businessId);
      await tx.songRequest.updateMany({
        where: { sessionId: s.id, status: { in: ['PENDING', 'APPROVED', 'PLAYING'] } },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      await tx.karaokeSession.update({ where: { id: s.id }, data: { status: 'ENDED', endedAt: new Date() } });
      return { ok: true };
    });
  }

  setRequestsOpen(businessId: string, open: boolean) {
    return this.locked(businessId, async (tx) => {
      const s = await this.requireActiveSession(tx, businessId);
      await tx.karaokeSession.update({ where: { id: s.id }, data: { requestsOpen: open } });
      return { ok: true };
    });
  }

  /** Una sola escritura, sin transaccion ni lock; el evento sale tras guardar. */
  async setPaused(businessId: string, paused: boolean) {
    const r = await this.prisma.karaokeSession.updateMany({ where: { businessId, status: 'ACTIVE' }, data: { paused } });
    if (!r.count) throw new ConflictException('No hay una sesion de karaoke activa');
    this.rt.playback(businessId, paused ? 'playback.paused' : 'playback.resumed');
    return { ok: true };
  }

  /** Reintenta el video actual en la TV (p.ej. se quedo congelado). */
  async reloadCurrent(businessId: string) {
    this.rt.playback(businessId, 'playback.reload');
    return { ok: true };
  }

  // ---------- solicitudes (cliente) ----------

  async createRequest(tableToken: string, input: NewRequestInput) {
    const table = await this.prisma.table.findUnique({ where: { qrToken: tableToken }, include: { business: true } });
    if (!table || !table.active || table.business.status !== 'ACTIVE') throw new ForbiddenException('Este codigo QR no es valido');
    const business = table.business;

    return this.locked(business.id, async (tx) => {
      const session = await this.activeSession(tx, business.id);
      if (!session) throw new ConflictException('El karaoke aun no ha comenzado');
      if (!session.requestsOpen) throw new ConflictException('Las solicitudes estan cerradas por ahora');

      // El conteo ocurre dentro del lock del establecimiento: dos clientes simultaneos no pueden pasar el limite.
      // Tras "desvincular" la mesa empieza de cero: solo cuentan las pedidas despues
      const waiting = await tx.songRequest.count({
        where: {
          tableId: table.id,
          sessionId: session.id,
          status: { in: HOLDING },
          ...(table.historyClearedAt ? { requestedAt: { gt: table.historyClearedAt } } : {}),
        },
      });
      if (waiting >= business.maxPendingPerTable) {
        throw new ConflictException(`Tu mesa ya tiene ${waiting} canciones pedidas sin terminar (maximo ${business.maxPendingPerTable})`);
      }
      const last = await tx.songRequest.aggregate({ where: { sessionId: session.id }, _max: { position: true } });
      const created = await tx.songRequest.create({
        data: {
          businessId: business.id,
          tableId: table.id,
          sessionId: session.id,
          videoId: input.videoId,
          title: input.title.slice(0, 200),
          channel: input.channel?.slice(0, 120),
          thumbnail: input.thumbnail?.slice(0, 500),
          durationSec: input.durationSec,
          position: (last._max.position ?? 0) + 1,
          status: business.autoApprove ? 'APPROVED' : 'PENDING',
          approvedAt: business.autoApprove ? new Date() : null,
        },
        include: { table: { select: { name: true } } },
      });
      this.events.record({
        businessId: business.id, sessionId: session.id, tableId: table.id, type: 'REQUEST_CREATED',
        metadata: { requestId: created.id, videoId: input.videoId, title: created.title, channel: created.channel, source: 'client', clientId: input.clientId, autoApproved: business.autoApprove },
      });
      if (business.autoApprove) {
        this.events.record({ businessId: business.id, sessionId: session.id, tableId: table.id, type: 'REQUEST_APPROVED', metadata: { requestId: created.id, auto: true } });
        await this.promote(tx, session.id);
      }
      return this.view(created);
    });
  }

  cancelOwn(tableToken: string, requestId: string) {
    return this.prisma.table.findUnique({ where: { qrToken: tableToken } }).then((table) => {
      if (!table) throw new NotFoundException();
      return this.locked(table.businessId, async (tx) => {
        const r = await tx.songRequest.findFirst({ where: { id: requestId, tableId: table.id } });
        if (!r) throw new NotFoundException('Solicitud no encontrada');
        if (!WAITING.includes(r.status)) throw new ConflictException('Esta solicitud ya no se puede cancelar');
        await tx.songRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED', completedAt: new Date() } });
        return { ok: true };
      });
    });
  }

  // ---------- DJ ----------

  /** Desvincula una mesa: cancela sus canciones en espera (pendientes y en cola). La que suena ahora no se corta. */
  unlinkTable(businessId: string, tableId: string) {
    return this.locked(businessId, async (tx) => {
      const table = await tx.table.findFirst({ where: { id: tableId, businessId } });
      if (!table) throw new NotFoundException('Mesa no encontrada');
      const s = await this.activeSession(tx, businessId);
      await tx.table.update({ where: { id: tableId }, data: { historyClearedAt: new Date() } });
      if (!s) return { removed: 0 };
      const r = await tx.songRequest.updateMany({
        where: { sessionId: s.id, tableId, status: { in: WAITING } },
        data: { status: 'CANCELLED', rejectionReason: 'Mesa desvinculada', completedAt: new Date() },
      });
      return { removed: r.count };
    });
  }

  approve(businessId: string, id: string) {
    return this.locked(businessId, async (tx) => {
      const r = await this.getOwned(tx, businessId, id);
      if (r.status !== 'PENDING') throw new ConflictException('La solicitud no esta pendiente');
      await tx.songRequest.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
      this.events.record({ businessId, sessionId: r.sessionId, tableId: r.tableId, type: 'REQUEST_APPROVED', metadata: { requestId: id } });
      await this.promote(tx, r.sessionId);
      return { ok: true };
    });
  }

  reject(businessId: string, id: string, reason?: string) {
    return this.locked(businessId, async (tx) => {
      const r = await this.getOwned(tx, businessId, id);
      if (!WAITING.includes(r.status)) throw new ConflictException('La solicitud ya no esta en espera');
      await tx.songRequest.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason?.slice(0, 200), completedAt: new Date() } });
      this.events.record({ businessId, sessionId: r.sessionId, tableId: r.tableId, type: 'REQUEST_REJECTED', metadata: { requestId: id, reason: reason?.slice(0, 200) } });
      return { ok: true };
    });
  }

  /** Reordena las APPROVED reutilizando sus mismas posiciones; el cliente solo propone el orden de ids. */
  reorder(businessId: string, ids: string[]) {
    return this.locked(businessId, async (tx) => {
      const session = await this.requireActiveSession(tx, businessId);
      const approved = await tx.songRequest.findMany({ where: { sessionId: session.id, status: 'APPROVED', auto: false } });
      const byId = new Map(approved.map((r) => [r.id, r]));
      if (ids.length !== approved.length || ids.some((i) => !byId.has(i)) || new Set(ids).size !== ids.length) {
        throw new BadRequestException('La cola cambio, recarga e intenta de nuevo');
      }
      const slots = approved.map((r) => r.position).sort((a, b) => a - b);
      for (let i = 0; i < ids.length; i++) {
        await tx.songRequest.update({ where: { id: ids[i] }, data: { position: slots[i] } });
      }
      return { ok: true };
    });
  }

  /** El DJ agrega una cancion directo a la cola (aprobada, sin limite por mesa ni revision). */
  djAddRequest(businessId: string, tableId: string, input: NewRequestInput) {
    return this.locked(businessId, async (tx) => {
      const session = await this.requireActiveSession(tx, businessId);
      const table = await tx.table.findFirst({ where: { id: tableId, businessId } });
      if (!table) throw new NotFoundException('Mesa no encontrada');
      const last = await tx.songRequest.aggregate({ where: { sessionId: session.id }, _max: { position: true } });
      const created = await tx.songRequest.create({
        data: {
          businessId,
          tableId: table.id,
          sessionId: session.id,
          videoId: input.videoId,
          title: input.title.slice(0, 200),
          channel: input.channel?.slice(0, 120),
          thumbnail: input.thumbnail?.slice(0, 500),
          durationSec: input.durationSec,
          position: (last._max.position ?? 0) + 1,
          status: 'APPROVED',
          approvedAt: new Date(),
        },
        include: { table: { select: { name: true } } },
      });
      this.events.record({
        businessId, sessionId: session.id, tableId: table.id, type: 'REQUEST_CREATED',
        metadata: { requestId: created.id, videoId: input.videoId, title: created.title, channel: created.channel, source: 'dj' },
      });
      await this.promote(tx, session.id);
      return this.view(created);
    });
  }

  /** Saltar la cancion actual. */
  skip(businessId: string) {
    return this.locked(businessId, async (tx) => {
      const s = await this.requireActiveSession(tx, businessId);
      const cur = await tx.songRequest.findFirst({ where: { sessionId: s.id, status: 'PLAYING' } });
      if (cur) {
        await tx.songRequest.update({ where: { id: cur.id }, data: { status: 'CANCELLED', completedAt: new Date() } });
        this.events.record({ businessId, sessionId: s.id, tableId: cur.tableId, type: 'PLAYBACK_SKIPPED', metadata: { requestId: cur.id, videoId: cur.videoId, atSec: s.positionSec } });
      }
      await tx.karaokeSession.update({ where: { id: s.id }, data: { paused: false } });
      await this.promote(tx, s.id);
      return { ok: true };
    });
  }

  /** Vuelve a poner al frente una cancion fallida/saltada/completada. */
  retry(businessId: string, id: string) {
    return this.locked(businessId, async (tx) => {
      const r = await this.getOwned(tx, businessId, id);
      if (!['FAILED', 'CANCELLED', 'COMPLETED'].includes(r.status)) throw new ConflictException('Solo se pueden reintentar canciones finalizadas');
      const s = await this.requireActiveSession(tx, businessId);
      if (r.sessionId !== s.id) throw new ConflictException('Pertenece a otra sesion');
      const min = await tx.songRequest.aggregate({ where: { sessionId: s.id, status: { in: ['APPROVED', 'PLAYING'] } }, _min: { position: true } });
      await tx.songRequest.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date(), position: (min._min.position ?? 1) - 1, startedAt: null, completedAt: null },
      });
      await this.promote(tx, s.id);
      return { ok: true };
    });
  }

  // ---------- TV / reproductor ----------

  /** La TV pulso "Iniciar karaoke" (o pide la siguiente). Idempotente. */
  playerNext(businessId: string) {
    return this.locked(businessId, async (tx) => {
      const s = await this.requireActiveSession(tx, businessId);
      if (!s.tvStarted) await tx.karaokeSession.update({ where: { id: s.id }, data: { tvStarted: true } });
      await this.promote(tx, s.id);
      return { ok: true };
    });
  }

  /**
   * Latido de la TV cada ~5 s: marca que sigue viva y guarda en que segundo va la cancion.
   * Sin lock ni transaccion (es muy frecuente); solo guarda la posicion si requestId es la que suena ahora.
   */
  async playerHeartbeat(businessId: string, requestId?: string, positionSec?: number) {
    const s = await this.activeSession(this.prisma, businessId);
    if (!s) return { ok: true };
    const data: { tvLastSeenAt: Date; positionSec?: number } = { tvLastSeenAt: new Date() };
    if (requestId && positionSec !== undefined) {
      const cur = await this.prisma.songRequest.findFirst({ where: { sessionId: s.id, status: 'PLAYING' }, select: { id: true } });
      if (cur?.id === requestId) data.positionSec = Math.max(0, Math.floor(positionSec));
    }
    const wasDown = !s.tvLastSeenAt || Date.now() - s.tvLastSeenAt.getTime() > 20_000;
    await this.prisma.karaokeSession.update({ where: { id: s.id }, data });
    if (wasDown) this.rt.queueUpdated(businessId); // la TV acaba de volver: que el DJ lo vea ya
    return { ok: true };
  }

  playerEnded(businessId: string, requestId: string) {
    return this.finishCurrent(businessId, requestId, 'COMPLETED');
  }

  async playerError(businessId: string, requestId: string, code?: number) {
    // 100 no existe/privado, 101/150 el dueno bloqueo la reproduccion incrustada: es permanente, se recuerda
    if (code === 100 || code === 101 || code === 150) {
      const cur = await this.prisma.songRequest.findFirst({ where: { id: requestId, status: 'PLAYING' }, select: { videoId: true } });
      if (cur) await this.yt.markBlocked(cur.videoId);
    }
    return this.finishCurrent(businessId, requestId, 'FAILED');
  }

  /** Solo avanza si requestId es la cancion que suena AHORA; un evento repetido no hace nada. */
  private finishCurrent(businessId: string, requestId: string, status: 'COMPLETED' | 'FAILED') {
    return this.locked(businessId, async (tx) => {
      const s = await this.activeSession(tx, businessId);
      if (!s) return { ok: true, ignored: true };
      const cur = await tx.songRequest.findFirst({ where: { sessionId: s.id, status: 'PLAYING' } });
      if (!cur || cur.id !== requestId) return { ok: true, ignored: true };
      await tx.songRequest.update({ where: { id: cur.id }, data: { status, completedAt: new Date() } });
      this.events.record({ businessId, sessionId: s.id, tableId: cur.tableId, type: status === 'COMPLETED' ? 'PLAYBACK_COMPLETED' : 'PLAYBACK_FAILED', metadata: { requestId: cur.id, videoId: cur.videoId } });
      await tx.karaokeSession.update({ where: { id: s.id }, data: { paused: false } });
      await this.promote(tx, s.id);
      return { ok: true };
    });
  }
}
