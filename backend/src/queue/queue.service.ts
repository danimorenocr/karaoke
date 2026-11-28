import { KARAOKE_RE, YoutubeService } from '../youtube/youtube.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AutoDjMode, Business, Prisma, RequestStatus, SongRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { allowedExperiences } from '../experiences';
import { RealtimeService } from '../realtime/realtime.gateway';
import { EventsService } from '../stats/events.service';
import { PlansService } from '../plans/plans.service';
import { AgentService } from '../agent/agent.module';

type Tx = Prisma.TransactionClient;

export interface NewRequestInput {
  videoId: string;
  title: string;
  channel?: string;
  thumbnail?: string;
  durationSec?: number;
  /** LOCAL = video de la biblioteca del bar (se valida contra el indice del agente). */
  source?: 'LOCAL' | 'YOUTUBE';
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
const DEFAULT_COLOR = '#ec4899';
const NEXT_UP_SEC = 4;
const SCORE_SEC = 6; // modo acumulado por mesa: segundos que se muestra el marcador general tras la votacion // en modo competencia: segundos extra para anunciar la siguiente mesa tras la votacion
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const FINISHED: RequestStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED'];

/** Business sin las dos imagenes en base64 (logo y banner), que pesan mucho y casi nunca se necesitan al armar un estado. */
const BIZ_LITE = Object.fromEntries(Object.keys(Prisma.BusinessScalarFieldEnum).filter((k) => k !== 'logoUrl' && k !== 'tvBanner').map((k) => [k, true])) as Prisma.BusinessSelect;
type BizLite = Omit<Business, 'logoUrl' | 'tvBanner'> & { hasLogo: boolean; hasBanner: boolean };
/** Estado publico compartido por todas las mesas de un local: se arma una vez y se reutiliza hasta que algo cambie. */
const PUB_TTL = 5_000; // tope de antiguedad aunque nadie avise (suspensiones, cambios de plan, etc.)
interface Memo<T> { ver: number; at: number; p: Promise<T> }

/**
 * Toda la logica de sesion/cola/reproduccion. El backend decide que suena; la TV solo ejecuta.
 * Cada mutacion toma un lock por establecimiento, asi dos eventos simultaneos
 * (ej. "video termino" duplicado) se serializan y el segundo se ignora.
 */
@Injectable()
export class QueueService {
  /** Sube con cada cambio de cola/solicitudes/votos/ajustes (RealtimeService.queueUpdated): invalida los estados guardados. */
  private gver = 0;
  private log = new Logger('Queue');
  private pubShared = new Map<string, Memo<any>>();
  private pubTables = new Map<string, Memo<any>>();
  private logos = new Map<string, { v: number; mime: string; buf: Buffer }>();
  private static LOGO_CACHE_BYTES = 16 * 1024 * 1024; // tope total de logos en memoria

  constructor(private prisma: PrismaService, private rt: RealtimeService, private events: EventsService, private yt: YoutubeService, private plans: PlansService, private agents: AgentService) {
    this.rt.onChange(() => { this.gver++; });
    this.agents.onDownload((biz, kind, body) => { this.onAgentDownload(biz, kind, body).catch((e) => this.log.warn(`Descarga: ${e.message}`)); });
  }

  /** Una sola carga en vuelo por clave y reutilizada mientras no cambie nada. Los errores no se guardan. */
  private memo<T>(map: Map<string, Memo<T>>, key: string, load: () => Promise<T>): Promise<T> {
    const hit = map.get(key);
    if (hit && hit.ver === this.gver && Date.now() - hit.at < PUB_TTL) return hit.p;
    const e: Memo<T> = { ver: this.gver, at: Date.now(), p: load() };
    map.set(key, e);
    e.p.catch(() => { if (map.get(key) === e) map.delete(key); });
    if (map.size > 300) {
      for (const [k, v] of map) if (v.ver !== this.gver || Date.now() - v.at >= PUB_TTL) map.delete(k);
      // Tope duro: si aun asi hay demasiadas, se descartan las mas antiguas (el Map conserva el orden de insercion)
      for (const k of map.keys()) { if (map.size <= 300) break; map.delete(k); }
    }
    return e.p;
  }

  /** Local sin logo ni banner en memoria; hasLogo/hasBanner salen de una consulta minima (no se lee el base64). */
  private async bizLite(businessId: string): Promise<BizLite> {
    const [b, flags] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: BIZ_LITE }),
      this.prisma.$queryRaw<{ l: boolean; b: boolean }[]>`SELECT ("logoUrl" IS NOT NULL) AS l, ("tvBanner" IS NOT NULL) AS b FROM "Business" WHERE id = ${businessId}`,
    ]);
    return { ...(b as unknown as Omit<Business, 'logoUrl' | 'tvBanner'>), hasLogo: !!flags[0]?.l, hasBanner: !!flags[0]?.b };
  }

  /** Logo decodificado y guardado por version (logoAt): se lee de la BD una vez, no en cada estado. */
  private async logoOf(businessId: string, logoAt: Date | null) {
    const v = logoAt?.getTime() ?? 0;
    const hit = this.logos.get(businessId);
    if (hit && hit.v === v) return hit;
    const b = await this.prisma.business.findUnique({ where: { id: businessId }, select: { logoUrl: true } });
    const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.*)$/s.exec(b?.logoUrl ?? '');
    if (!m) return null;
    const entry = { v, mime: m[1], buf: Buffer.from(m[2], 'base64') };
    this.logos.delete(businessId);
    this.logos.set(businessId, entry);
    let total = 0;
    for (const e of this.logos.values()) total += e.buf.length;
    for (const k of this.logos.keys()) { if (total <= QueueService.LOGO_CACHE_BYTES || this.logos.size <= 1) break; total -= this.logos.get(k)!.buf.length; this.logos.delete(k); }
    return entry;
  }

  /** Un video LOCAL se valida contra el indice del agente y toma su titulo real; el resto queda como YouTube. */
  private async prepare(businessId: string, input: NewRequestInput): Promise<NewRequestInput> {
    if (input.source !== 'LOCAL') return { ...input, source: 'YOUTUBE' };
    const s = await this.agents.resolve(businessId, input.videoId);
    return { ...input, source: 'LOCAL', title: s.title, channel: s.channel, thumbnail: s.thumbnail, durationSec: undefined };
  }

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
  /** Coloca una cancion en la cola justo despues de la ultima de su misma mesa (si la mesa ya tiene canciones en cola). Reutiliza las mismas posiciones y respeta el orden manual del resto. */
  private async placeWithTable(tx: Tx, sessionId: string, id: string) {
    const rows = await tx.songRequest.findMany({
      where: { sessionId, status: 'APPROVED', auto: false },
      orderBy: [{ position: 'asc' }, { requestedAt: 'asc' }],
    });
    const me = rows.find((r) => r.id === id);
    if (!me || !me.tableId) return;
    const others = rows.filter((r) => r.id !== id);
    let at = -1;
    others.forEach((r, i) => { if (r.tableId === me.tableId) at = i; });
    if (at === -1) return; // la mesa no tiene mas canciones en cola: se queda donde esta
    const sorted = [...others.slice(0, at + 1), me, ...others.slice(at + 1)];
    const slots = rows.map((r) => r.position).sort((x, y) => x - y);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].position !== slots[i]) await tx.songRequest.update({ where: { id: sorted[i].id }, data: { position: slots[i] } });
    }
  }

  private async promote(tx: Tx, sessionId: string, force = false) {
    const session = await tx.karaokeSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (!session.tvStarted || session.status !== 'ACTIVE') return;
    await this.topUpAuto(tx, session.businessId, sessionId);
    const playing = await tx.songRequest.findFirst({ where: { sessionId, status: 'PLAYING' } });
    if (playing) return;
    const next = await tx.songRequest.findFirst({
      // Las que el agente local aun esta bajando se saltan hasta que esten listas
      where: { sessionId, status: 'APPROVED', ...(this.downloading.size ? { id: { notIn: [...this.downloading.keys()] } } : {}) },
      orderBy: [{ auto: 'asc' }, { position: 'asc' }, { requestedAt: 'asc' }],
    });
    if (next) {
      // Cola en espera: se acabo la musica y ya paso la cuenta regresiva (queueResumeSec);
      // las canciones nuevas no suenan solas hasta que el DJ pulse "Reanudar cola" (force).
      if (!force && session.queueEmptyAt) {
        const biz = await tx.business.findUniqueOrThrow({ where: { id: session.businessId }, select: { queueResumeSec: true } });
        if (Date.now() - session.queueEmptyAt.getTime() >= biz.queueResumeSec * 1000) return;
      }
      await tx.songRequest.update({ where: { id: next.id }, data: { status: 'PLAYING', startedAt: new Date() } });
      await tx.karaokeSession.update({ where: { id: sessionId }, data: { positionSec: 0, queueEmptyAt: null } }); // cancion nueva: empieza desde 0
      this.events.record({ businessId: next.businessId, sessionId, tableId: next.tableId, type: 'PLAYBACK_STARTED', metadata: { requestId: next.id, videoId: next.videoId, auto: next.auto } });
      await this.topUpAuto(tx, session.businessId, sessionId); // repone la cola automatica
    } else if (!session.queueEmptyAt) {
      // Se acabo la cola: arranca la cuenta regresiva; al terminar se activa el boton del DJ
      await tx.karaokeSession.update({ where: { id: sessionId }, data: { queueEmptyAt: new Date() } });
    }
  }

  /** El DJ reanuda la cola en espera (la cuenta regresiva de cola vacia ya termino): suena ya la siguiente. */
  resumeQueue(businessId: string) {
    return this.locked(businessId, async (tx) => {
      const s = await this.requireActiveSession(tx, businessId);
      await tx.karaokeSession.update({ where: { id: s.id }, data: { queueEmptyAt: null } });
      await this.promote(tx, s.id, true);
      return { ok: true };
    });
  }

  /** Auto-DJ activo: mantiene ya elegidas las proximas canciones normales (cola automatica), separadas de las solicitudes. */
  private async topUpAuto(tx: Tx, businessId: string, sessionId: string, want = 3) {
    const biz = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { autoDjMode: true, autoDjGenres: true } });
    if (biz.autoDjMode !== 'AUTO' || !(await this.plans.has(businessId, 'autoDj'))) return;
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
  async setAutoDj(businessId: string, mode?: AutoDjMode, genres?: string[]) {
    await this.plans.require(businessId, 'autoDj');
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
      source: r.source,
      title: r.title,
      channel: r.channel,
      thumbnail: r.thumbnail,
      durationSec: r.durationSec,
      status: r.status,
      position: r.position,
      tableId: r.tableId,
      tableName: r.auto ? 'Auto-DJ' : r.table?.name,
      auto: r.auto,
      rejectionReason: r.rejectionReason,
      requestedAt: r.requestedAt,
    };
  }

  /** Datos del local que ven el panel DJ y la TV (la TV usa las marcas de version para pedir logo y banner solo si cambian). */
  private businessView(business: BizLite, f: Set<string>) {
    return { name: business.name, autoApprove: business.autoApprove && f.has('autoApprove'), searchMode: f.has('searchAny') ? business.searchMode : 'KARAOKE', autoDjMode: f.has('autoDj') ? business.autoDjMode : 'OFF', autoDjGenres: business.autoDjGenres, autoDjCatalog: AUTO_DJ_GENRES, tvBannerAt: f.has('tvBanner') && business.hasBanner ? (business.tvBannerAt ?? new Date(0)) : null, primaryColor: f.has('branding') ? business.primaryColor : null, logoAt: f.has('branding') && business.hasLogo ? (business.logoAt ?? new Date(0)) : null, tvInterludeSec: Math.max(f.has('tvBanner') ? business.tvInterludeSec : 0, business.voteMode && f.has('voting') ? business.voteSec + (business.voteScope === 'TABLE' ? SCORE_SEC : 0) + NEXT_UP_SEC : 0), voteMode: business.voteMode && f.has('voting'), voteSec: business.voteMode && f.has('voting') ? business.voteSec : null, voteScope: business.voteScope, queueResumeSec: business.queueResumeSec ?? 15, scoreSec: business.voteMode && f.has('voting') && business.voteScope === 'TABLE' ? SCORE_SEC : 0, features: [...f] };
  }

  // ---------- estados (lectura) ----------

  async djState(businessId: string) {
    const session = await this.activeSession(this.prisma, businessId);
    const business = await this.bizLite(businessId);
    // TV conectada = socket abierto en esta instancia O latido reciente guardado en BD (sirve tras reinicios o con varias instancias)
    const tvConnected = this.rt.tvCount(businessId) > 0 || (!!session?.tvLastSeenAt && Date.now() - session.tvLastSeenAt.getTime() < 20_000);
    // tvArmed: la TV ya pulso "Iniciar karaoke" y sigue enviando latidos (la pagina esta abierta Y reproduciendo)
    const tvArmed = !!session?.tvLastSeenAt && Date.now() - session.tvLastSeenAt.getTime() < 20_000;
    const f = await this.plans.of(businessId);
    const base = { business: this.businessView(business, f), tvConnected, tvArmed };
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
      // Cola vacia hace un rato: el panel muestra la cuenta regresiva y, al acabar, el boton "Reanudar cola"
      queueHold: !current && session.queueEmptyAt
        ? { emptyAt: session.queueEmptyAt, resumeSec: business.queueResumeSec ?? 15, waiting: queue.length + autoQueue.length }
        : null,
      queue: this.withProbe(queue.map((r) => this.view(r))),
      autoQueue: this.withProbe(autoQueue.map((r) => this.view(r))),
      pending: this.withProbe(pending.map((r) => this.view(r))),
      history: history.map((r) => this.view(r)),
      // Mesas con canciones en espera primero (para poder desvincularlas)
      tables: tableRows
        .map((t) => ({ id: t.id, name: t.name, waiting: active.find((a) => a.tableId === t.id)?._count._all ?? 0 }))
        .sort((a, b) => b.waiting - a.waiting),
    };
  }

  /** Estado para la TV: lo minimo para reproducir (cancion actual, siguiente y las proximas 5), sin armar el panel completo del DJ. */
  async playerState(businessId: string) {
    const [session, business, f] = await Promise.all([this.activeSession(this.prisma, businessId), this.bizLite(businessId), this.plans.of(businessId)]);
    const view = this.businessView(business, f);
    const vote = await this.lastVote(business, f);
    if (!session) return { vote, business: view, session: null, current: null, next: null, upcoming: [] };
    const include = { table: { select: { name: true } } };
    const [current, queue, autoQueue] = await Promise.all([
      this.prisma.songRequest.findFirst({ where: { sessionId: session.id, status: 'PLAYING' }, include }),
      this.prisma.songRequest.findMany({ where: { sessionId: session.id, status: 'APPROVED', auto: false }, include, orderBy: [{ position: 'asc' }, { requestedAt: 'asc' }], take: 5 }),
      this.prisma.songRequest.findMany({ where: { sessionId: session.id, status: 'APPROVED', auto: true }, include, orderBy: { position: 'asc' }, take: 5 }),
    ]);
    const upcoming = [...queue, ...autoQueue].slice(0, 5).map((r) => this.view(r));
    return {
      vote,
      business: view,
      session: { id: session.id, requestsOpen: session.requestsOpen, paused: session.paused, tvStarted: session.tvStarted, positionSec: session.positionSec, startedAt: session.startedAt },
      current: current && this.view(current),
      next: upcoming[0] ?? null,
      upcoming,
    };
  }

  async tvBanner(businessId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { tvBanner: true } });
    return { banner: (await this.plans.has(businessId, 'tvBanner')) ? b.tvBanner : null };
  }

  async tvLogo(businessId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { logoUrl: true } });
    return { logo: (await this.plans.has(businessId, 'branding')) ? b.logoUrl : null };
  }

  /** Parte del estado publico igual para todas las mesas de un local. */
  private sharedPublic(businessId: string) {
    return this.memo(this.pubShared, businessId, async () => {
      const [b, f, session] = await Promise.all([this.bizLite(businessId), this.plans.of(businessId), this.activeSession(this.prisma, businessId)]);
      let current: any = null;
      let queue: any[] = [];
      if (session) {
        const include = { table: { select: { name: true } } };
        const [c, q] = await Promise.all([
          this.prisma.songRequest.findFirst({ where: { sessionId: session.id, status: 'PLAYING' }, include }),
          this.prisma.songRequest.findMany({ where: { sessionId: session.id, status: 'APPROVED', auto: false }, include, orderBy: [{ position: 'asc' }, { requestedAt: 'asc' }] }),
        ]);
        current = c && this.view(c);
        queue = q.map((r) => this.view(r));
      }
      const vote = await this.lastVoteRaw(b, f);
      const branding = f.has('branding');
      return {
        b, session: session ? { id: session.id, open: session.requestsOpen } : null, current, queue, vote,
        name: b.name, color: branding ? b.primaryColor : DEFAULT_COLOR, logoAt: branding && b.hasLogo ? b.logoAt : null, hasLogo: branding && b.hasLogo,
        searchMode: f.has('searchAny') ? b.searchMode : 'KARAOKE', designs: f.has('designs'), maxPending: b.maxPendingPerTable,
      };
    });
  }

  /** Mesa por QR y lo que pidio (por mesa; se comparte entre los celulares de la misma mesa). */
  private tablePublic(tableToken: string) {
    return this.memo(this.pubTables, tableToken, async () => {
      const table = await this.prisma.table.findUnique({ where: { qrToken: tableToken }, include: { business: { select: { id: true, status: true } } } });
      if (!table || !table.active || table.business.status !== 'ACTIVE') throw new NotFoundException('Este codigo QR no es valido');
      const sh = await this.sharedPublic(table.businessId);
      let mine: any[] = [];
      if (sh.session) {
        const rows = await this.prisma.songRequest.findMany({
          // Tras "desvincular", la mesa empieza de cero: no ve lo pedido antes
          where: { sessionId: sh.session.id, tableId: table.id, ...(table.historyClearedAt ? { requestedAt: { gt: table.historyClearedAt } } : {}) },
          include: { table: { select: { name: true } } },
          orderBy: { requestedAt: 'desc' },
          take: 20,
        });
        mine = rows.map((r) => this.view(r));
      }
      return { table: { id: table.id, name: table.name, experienceId: table.experienceId, businessId: table.businessId }, mine };
    });
  }

  /** `imgAsUrl`: el logo va como direccion versionada (/public/:token/logo?v=) en vez de incrustado en cada respuesta. */
  async publicState(tableToken: string, imgAsUrl = false) {
    const t = await this.tablePublic(tableToken);
    let sh = await this.sharedPublic(t.table.businessId);
    // La votacion tiene vigencia propia: pasada, se recalcula sin esperar a otro cambio
    if (sh.vote && Date.now() >= sh.vote.end) {
      this.pubShared.delete(t.table.businessId);
      sh = await this.sharedPublic(t.table.businessId);
    }
    let logoUrl: string | null = null;
    if (sh.hasLogo) {
      if (imgAsUrl) logoUrl = `/public/${tableToken}/logo?v=${sh.logoAt?.getTime() ?? 0}`;
      else { const lg = await this.logoOf(t.table.businessId, sh.logoAt); logoUrl = lg ? `data:${lg.mime};base64,${lg.buf.toString('base64')}` : null; }
    }
    const exp = sh.designs && allowedExperiences(sh.b.allowedExperiences).includes(t.table.experienceId) ? t.table.experienceId : 'classic';
    const v = sh.vote;
    return {
      business: { name: sh.name, logoUrl, primaryColor: sh.color, searchMode: sh.searchMode },
      table: { name: t.table.name, experienceId: exp },
      session: sh.session ? { open: sh.session.open } : null,
      maxPending: sh.maxPending,
      current: sh.current,
      // Con la cola oculta el cliente solo ve lo que suena y la cancion que sigue
      queue: sh.b.showQueue ? sh.queue : sh.queue.slice(0, 1),
      queueHidden: !sh.b.showQueue,
      mine: t.mine,
      vote: v ? { ...v.out, mine: v.tableId === t.table.id, leftMs: Math.max(0, v.end - Date.now()) } : null,
    };
  }

  /** Logo publico de la mesa (para <img>): cacheable un anio porque la direccion lleva la version. */
  async publicLogo(tableToken: string) {
    const t = await this.tablePublic(tableToken);
    const sh = await this.sharedPublic(t.table.businessId);
    const logo = sh.hasLogo ? await this.logoOf(t.table.businessId, sh.logoAt) : null;
    if (!logo) throw new NotFoundException('Sin logo');
    return { mime: logo.mime, buf: logo.buf, v: logo.v };
  }

  // ---------- votacion ----------

  /** Ventana en la que se puede votar una cancion tras terminar: lo que dura el aviso de la TV mas un margen. */
  private voteWindowMs(voteSec: number) {
    return voteSec * 1000 + 1500; // la TV pasa al aviso de la siguiente mesa justo despues
  }

  /** Resultado de la votacion de la ultima cancion terminada, mientras siga abierta (null si el modo esta apagado o no hay). */
  async lastVote(b: { id: string; voteMode: boolean; voteSec: number; voteScope: string }, feats: Set<string>, tableId?: string) {
    const v = await this.lastVoteRaw(b, feats);
    return v && { ...v.out, mine: !!tableId && v.tableId === tableId, leftMs: Math.max(0, v.end - Date.now()) };
  }

  /** Igual para todos los espectadores: `end` (hora de cierre) y `tableId` (mesa que canto) permiten calcular mine/leftMs despues. */
  async lastVoteRaw(b: { id: string; voteMode: boolean; voteSec: number; voteScope: string }, feats: Set<string>) {
    if (!b.voteMode || !feats.has('voting')) return null;
    const r = await this.prisma.songRequest.findFirst({
      where: { businessId: b.id, status: 'COMPLETED', auto: false, completedAt: { gte: new Date(Date.now() - this.voteWindowMs(b.voteSec)) } },
      orderBy: { completedAt: 'desc' },
      include: { table: { select: { name: true } } },
    });
    if (!r) return null;
    const groups = await this.prisma.songVote.groupBy({ by: ['rating'], where: { requestId: r.id }, _count: { _all: true } });
    const dist = [1, 2, 3, 4, 5].map((n) => groups.find((g) => g.rating === n)?._count._all ?? 0);
    const count = dist.reduce((a, c) => a + c, 0);
    const avg = count ? Math.round((dist.reduce((a, c, i) => a + c * (i + 1), 0) / count) * 10) / 10 : null;
    // Acumulado por mesa: puntos (suma de estrellas) de todas las actuaciones de la sesion, de mayor a menor
    let ranking: { tableName: string; points: number; votes: number; avg: number; songs: number; current: boolean }[] | null = null;
    if (b.voteScope === 'TABLE' && !r.auto) {
      const votes = await this.prisma.songVote.findMany({ where: { request: { sessionId: r.sessionId, auto: false, tableId: { not: null } } }, select: { rating: true, request: { select: { id: true, tableId: true } } } });
      const perTable = new Map<string, { points: number; votes: number; songs: Set<string> }>();
      for (const v of votes) {
        const id = v.request.tableId!;
        const t = perTable.get(id) ?? { points: 0, votes: 0, songs: new Set<string>() };
        t.points += v.rating; t.votes += 1; t.songs.add(v.request.id);
        perTable.set(id, t);
      }
      if (r.tableId && !perTable.has(r.tableId)) perTable.set(r.tableId, { points: 0, votes: 0, songs: new Set() }); // la que acaba de cantar siempre aparece
      const names = new Map((await this.prisma.table.findMany({ where: { businessId: b.id }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
      ranking = [...perTable.entries()]
        .map(([id, t]) => ({ tableName: names.get(id) ?? '—', points: t.points, votes: t.votes, avg: t.votes ? Math.round((t.points / t.votes) * 10) / 10 : 0, songs: t.songs.size, current: id === r.tableId }))
        .sort((x, y) => y.points - x.points || y.avg - x.avg);
    }
    return { tableId: r.tableId, end: r.completedAt!.getTime() + this.voteWindowMs(b.voteSec), out: { scope: b.voteScope, ranking, id: r.id, title: r.title, tableName: r.auto || !r.table ? null : r.table.name, auto: r.auto, count, avg, dist, sec: b.voteSec } };
  }

  /** Un asistente vota (1-5) la cancion que acaba de sonar. Un voto por navegador: votar de nuevo lo cambia. */
  async castVote(tableToken: string, requestId: string, rating: number, clientId: string) {
    const table = await this.prisma.table.findUnique({ where: { qrToken: tableToken }, include: { business: true } });
    if (!table || !table.active || table.business.status !== 'ACTIVE') throw new ForbiddenException('Este codigo QR no es valido');
    const b = table.business;
    if (!b.voteMode || !(await this.plans.has(b.id, 'voting'))) throw new ConflictException('La votacion no esta activa');
    const r = await this.prisma.songRequest.findFirst({ where: { id: requestId, businessId: b.id } });
    if (!r || r.status !== 'COMPLETED' || !r.completedAt || Date.now() - r.completedAt.getTime() > this.voteWindowMs(b.voteSec)) {
      throw new ConflictException('La votacion de esta actuacion ya cerro');
    }
    if (r.tableId === table.id) throw new ForbiddenException('No puedes votar la actuacion de tu propia mesa');
    await this.prisma.songVote.upsert({
      where: { requestId_clientId: { requestId, clientId } },
      create: { businessId: b.id, requestId, clientId, rating },
      update: { rating },
    });
    this.rt.queueUpdated(b.id);
    return { ok: true };
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
  /** Reinicia la cancion actual desde 0 (la TV retoma donde iba solo cuando se recarga la pagina por un fallo). */
  async reloadCurrent(businessId: string) {
    await this.locked(businessId, async (tx) => {
      const s = await this.activeSession(tx, businessId);
      if (s) await tx.karaokeSession.update({ where: { id: s.id }, data: { positionSec: 0 } });
    });
    this.rt.playback(businessId, 'playback.reload');
    return { ok: true };
  }

  // ---------- solicitudes (cliente) ----------

  async createRequest(tableToken: string, rawInput: NewRequestInput) {
    const table = await this.prisma.table.findUnique({ where: { qrToken: tableToken }, include: { business: true } });
    if (!table || !table.active || table.business.status !== 'ACTIVE') throw new ForbiddenException('Este codigo QR no es valido');
    const business = table.business;
    const input = await this.prepare(business.id, rawInput);
    const autoApprove = business.autoApprove && (await this.plans.has(business.id, 'autoApprove'));

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
          source: input.source === 'LOCAL' ? 'LOCAL' : 'YOUTUBE',
          title: input.title.slice(0, 200),
          channel: input.channel?.slice(0, 120),
          thumbnail: input.thumbnail?.slice(0, 500),
          durationSec: input.durationSec,
          position: (last._max.position ?? 0) + 1,
          status: autoApprove ? 'APPROVED' : 'PENDING',
          approvedAt: autoApprove ? new Date() : null,
        },
        include: { table: { select: { name: true } } },
      });
      this.events.record({
        businessId: business.id, sessionId: session.id, tableId: table.id, type: 'REQUEST_CREATED',
        metadata: { requestId: created.id, videoId: input.videoId, title: created.title, channel: created.channel, source: 'client', clientId: input.clientId, autoApproved: autoApprove },
      });
      if (autoApprove) {
        this.events.record({ businessId: business.id, sessionId: session.id, tableId: table.id, type: 'REQUEST_APPROVED', metadata: { requestId: created.id, auto: true } });
        await this.placeWithTable(tx, session.id, created.id);
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
      await this.placeWithTable(tx, r.sessionId, id);
      await this.promote(tx, r.sessionId);
      return { ok: true };
    });
  }

  /** Cambia la mesa a la que esta asociada una cancion en espera y reagrupa la cola. */
  reassignTable(businessId: string, id: string, tableId: string) {
    return this.locked(businessId, async (tx) => {
      const r = await this.getOwned(tx, businessId, id);
      if (r.auto) throw new ConflictException('Las canciones del Auto-DJ no tienen mesa');
      if (!WAITING.includes(r.status)) throw new ConflictException('La solicitud ya no esta en espera');
      const table = await tx.table.findFirst({ where: { id: tableId, businessId, active: true } });
      if (!table) throw new NotFoundException('Mesa no encontrada');
      if (r.tableId !== table.id) await tx.songRequest.update({ where: { id }, data: { tableId: table.id } });
      if (r.status === 'APPROVED') await this.placeWithTable(tx, r.sessionId, id);
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
  async djAddRequest(businessId: string, tableId: string, rawInput: NewRequestInput) {
    const input = await this.prepare(businessId, rawInput);
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
          source: input.source === 'LOCAL' ? 'LOCAL' : 'YOUTUBE',
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
      await this.placeWithTable(tx, session.id, created.id);
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

  // ---------- prueba en vivo (panel DJ) ----------

  /** Solicitudes ya probadas por el reproductor oculto del panel DJ (en memoria; tras un despliegue se prueban de nuevo una vez). */
  private probed = new Set<string>();
  /** Solicitudes cuya prueba confirmo que YouTube las bloquea: quedan en la cola marcadas "va a fallar" y el DJ decide. */
  private willFail = new Set<string>();

  /** Marca en las listas del panel cuales solicitudes de YouTube aun no pasan la prueba en vivo y cuales ya se sabe que fallaran. */
  private withProbe<T extends { id: string; source: string }>(rows: T[]): (T & { needsProbe: boolean; willFail: boolean; downloading: boolean; downloadPct: number })[] {
    return rows.map((r) => ({ ...r, needsProbe: r.source === 'YOUTUBE' && !this.probed.has(r.id), willFail: this.willFail.has(r.id), downloading: this.downloading.has(r.id), downloadPct: this.dlPct.get(r.id) ?? 0 }));
  }

  /** Solicitudes que el agente local esta bajando de YouTube (requestId -> businessId); no se reproducen hasta que terminan. */
  private downloading = new Map<string, string>();
  private dlPct = new Map<string, number>(); // avance (0-100) de cada descarga en curso
  /** Solicitudes cuya descarga ya fallo una vez: no se vuelve a intentar (evita bucles). */
  private dlFailed = new Set<string>();

  /**
   * Si el video no se puede incrustar (101/150) y el bar tiene el agente local conectado, le pide bajarlo a su carpeta.
   * Cuando termina, la solicitud pasa a ser un video local con su mesa y su puesto. false = no aplica (se sigue como antes).
   */
  private async startDownload(businessId: string, r: { id: string; videoId: string; source: string }) {
    if (r.source === 'LOCAL' || this.dlFailed.has(r.id) || !/^[\w-]{11}$/.test(r.videoId)) return false;
    if (this.downloading.has(r.id)) return true;
    if (!(await this.plans.has(businessId, 'localLibrary'))) return false;
    const biz = await this.prisma.business.findUnique({ where: { id: businessId }, select: { autoDownload: true } });
    if (!biz?.autoDownload) return false; // el bar la apago en Configuracion
    if (!this.agents.requestDownload(businessId, { requestId: r.id, videoId: r.videoId })) return false;
    this.downloading.set(r.id, businessId);
    // Si el agente no responde en 10 min se da por perdida y se sigue como antes
    setTimeout(() => {
      if (this.downloading.delete(r.id)) { this.dlPct.delete(r.id); this.dlFailed.add(r.id); this.rt.queueUpdated(businessId); }
    }, 10 * 60_000).unref?.();
    this.log.log(`Descarga pedida al agente: ${r.videoId}`);
    return true;
  }

  private async onAgentDownload(businessId: string, kind: 'done' | 'failed' | 'progress', body: { requestId: string; id?: string; reason?: string; percent?: number }) {
    if (this.downloading.get(body.requestId) !== businessId) return; // ya no se esperaba (cambiada, quitada o vencida)
    if (kind === 'progress') {
      const pct = Math.max(0, Math.min(100, Math.round(Number(body.percent) || 0)));
      const prev = this.dlPct.get(body.requestId);
      this.dlPct.set(body.requestId, pct);
      if (prev === undefined || Math.floor(pct / 25) !== Math.floor(prev / 25)) this.log.log(`Descarga ${body.requestId.slice(-6)}: ${pct}%`);
      this.rt.downloadProgress(businessId, body.requestId, pct);
      return;
    }
    this.downloading.delete(body.requestId);
    this.dlPct.delete(body.requestId);
    if (kind === 'failed') {
      this.dlFailed.add(body.requestId);
      this.log.warn(`El agente no pudo bajar el video: ${String(body.reason ?? '').slice(0, 200)}`);
      this.rt.queueUpdated(businessId);
      return;
    }
    if (!body.id || !/^L[\w-]{10}$/.test(body.id)) { this.dlFailed.add(body.requestId); this.rt.queueUpdated(businessId); return; }
    await this.locked(businessId, async (tx) => {
      const r = await tx.songRequest.findFirst({ where: { id: body.requestId, businessId, status: { in: ['PENDING', 'APPROVED'] } } });
      if (!r) return;
      await tx.songRequest.update({ where: { id: r.id }, data: { videoId: body.id!, source: 'LOCAL', channel: 'En el bar' } });
      this.probed.delete(r.id);
      this.willFail.delete(r.id);
      await this.promote(tx, r.sessionId);
    });
  }

  /** La TV no pudo reproducir la cancion actual pero el agente la esta bajando: vuelve a la cola (sin perder mesa ni puesto) y sigue la siguiente. */
  private deferCurrent(businessId: string, requestId: string) {
    return this.locked(businessId, async (tx) => {
      const s = await this.activeSession(tx, businessId);
      if (!s) return { ok: true, ignored: true };
      const cur = await tx.songRequest.findFirst({ where: { sessionId: s.id, status: 'PLAYING' } });
      if (!cur || cur.id !== requestId) return { ok: true, ignored: true };
      await tx.songRequest.update({ where: { id: cur.id }, data: { status: 'APPROVED', startedAt: null } });
      await tx.karaokeSession.update({ where: { id: s.id }, data: { paused: false, positionSec: 0 } });
      await this.promote(tx, s.id);
      return { ok: true, deferred: true };
    });
  }

  /**
   * Resultado de la prueba en vivo del panel DJ: un reproductor oculto carga el video antes de que llegue a la TV.
   * Nada se rechaza ni se salta solo: si YouTube confirma el bloqueo (100 no existe/privado, 101/150 el dueno no
   * permite incrustarlo), la solicitud QUEDA en la cola marcada "va a fallar" y el DJ decide si la quita o la deja.
   * Ademas el video se recuerda para no volver a ofrecerse en las busquedas. Si se reprodujo, dio otro codigo
   * (puede ser pasajero o del entorno, como el 153) o no se pudo comprobar, sigue su curso normal:
   * la TV es la ultima palabra y la saltaria como hasta ahora.
   */
  async probeResult(businessId: string, requestId: string, outcome: 'ok' | 'error' | 'timeout', code?: number) {
    const r = await this.prisma.songRequest.findFirst({
      where: { id: requestId, businessId },
      select: { id: true, status: true, videoId: true, source: true },
    });
    if (!r) throw new NotFoundException('Solicitud no encontrada');
    if (r.source === 'LOCAL' || !['PENDING', 'APPROVED'].includes(r.status)) return { ok: true, ignored: true };
    this.probed.add(r.id);
    if (this.probed.size > 3000) this.probed = new Set([...this.probed].slice(-1500));
    if (outcome !== 'error' || !(code === 100 || code === 101 || code === 150)) return { ok: true };
    this.willFail.add(r.id);
    if (this.willFail.size > 3000) this.willFail = new Set([...this.willFail].slice(-1500));
    await this.yt.markBlocked(r.videoId); // no se vuelve a ofrecer en las busquedas
    if ((code === 101 || code === 150) && (await this.startDownload(businessId, r))) { /* el agente la baja: el panel muestra "Descargando" */ }
    this.rt.queueUpdated(businessId); // el panel abierto ve la marca al instante
    return { ok: true, willFail: true };
  }

  /** Versiones de YouTube ya intentadas para una solicitud (en memoria): no se vuelven a ofrecer como alternativa. */
  private tried = new Map<string, Set<string>>();

  /**
   * Otras subidas del mismo tema para una cancion marcada "va a fallar": la misma busqueda y el mismo modo
   * del bar (solo pasa el filtro de incrustables de la capa 1), sin la bloqueada ni las ya intentadas.
   * Si YouTube no responde o no hay cuota, devuelve lista vacia (el DJ reintenta o quita la cancion).
   */
  async alternatives(businessId: string, requestId: string) {
    const r = await this.prisma.songRequest.findFirst({
      where: { id: requestId, businessId },
      select: { id: true, status: true, videoId: true, title: true, source: true },
    });
    if (!r) throw new NotFoundException('Solicitud no encontrada');
    if (r.source === 'LOCAL' || !['PENDING', 'APPROVED'].includes(r.status)) return { items: [] };
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { searchMode: true } });
    const mode = (await this.plans.has(businessId, 'searchAny')) ? b.searchMode : 'KARAOKE';
    const skip = new Set([r.videoId, ...(this.tried.get(r.id) ?? [])]);
    // El titulo del video trae ruido ("Karaoke Version", corchetes, "Official"...): se limpia para buscar la cancion, no esa subida
    const clean = r.title
      .replace(/[\[(][^\])]*[\])]/g, ' ')
      .replace(/(^|[^\p{L}\d])(karaoke|instrumental|version|versi[oó]n|official|oficial|lyrics?|letra|video|audio|hd|4k|con letra|pista|sing[- ]?along|with lyrics)(?![\p{L}\d])/giu, ' ')
      .replace(/[|"“”]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || r.title;
    type Found = Awaited<ReturnType<YoutubeService['searchSongs']>>;
    const seen = new Set(skip);
    const items: Found = [];
    let failedWith: 'quota' | 'error' | null = null;
    // Varias formulas de busqueda hasta reunir 5; la ultima (cualquier version) solo si no hay nada mejor
    const attempts: [string, 'KARAOKE' | 'ANY'][] = [[clean, mode], [`${clean} pista instrumental`, mode], [`${clean} letra`, 'ANY']];
    for (const [text, m] of attempts) {
      if (items.length >= 5) break;
      if (m === 'ANY' && mode === 'KARAOKE' && items.length > 0) break;
      try {
        const found = await this.yt.searchSongs(text, m);
        for (const v of found) {
          if (seen.has(v.videoId)) continue;
          seen.add(v.videoId);
          items.push(v);
        }
      } catch (e: any) {
        failedWith = e?.getStatus?.() === 429 ? 'quota' : 'error';
        if (failedWith === 'quota') break;
      }
    }
    // Primero las que no son de sello discografico (suelen estar bloqueadas para incrustar)
    items.sort((x, y) => Number(!!x.risky) - Number(!!y.risky));
    const out = items.slice(0, 5).map((v) => ({ videoId: v.videoId, title: v.title, channel: v.channelTitle, thumbnail: v.thumbnail, durationSec: v.durationSec }));
    return { items: out, reason: out.length ? undefined : failedWith };
  }

  /**
   * Cambia la cancion por otra version de YouTube elegida por el DJ. La nueva se valida por la capa 1
   * (incrustable, sin bloqueo conocido) y la solicitud conserva mesa, estado y puesto en la cola;
   * la prueba en vivo del panel la vuelve a comprobar sola (needsProbe) y si tambien falla,
   * reaparece la marca y las alternativas ya no incluyen las intentadas.
   */
  async swap(businessId: string, requestId: string, videoId: string) {
    const r = await this.prisma.songRequest.findFirst({
      where: { id: requestId, businessId },
      select: { id: true, status: true, videoId: true, source: true },
    });
    if (!r) throw new NotFoundException('Solicitud no encontrada');
    if (r.source === 'LOCAL' || !['PENDING', 'APPROVED'].includes(r.status)) return { ok: true, ignored: true };
    if (!/^[\w-]{11}$/.test(videoId) || videoId === r.videoId || (this.tried.get(r.id)?.has(videoId) ?? false)) {
      throw new BadRequestException('Esa version no vale para esta cancion');
    }
    // Un ID/link no gasta cuota de busqueda: valida bloqueo conocido y trae titulo y duracion reales
    const [v] = await this.yt.searchSongs(videoId, 'ANY');
    if (!v) throw new BadRequestException('Esa version no se puede reproducir en la TV');
    const tried = this.tried.get(r.id) ?? new Set<string>();
    tried.add(r.videoId);
    this.tried.set(r.id, tried);
    if (this.tried.size > 1000) this.tried.delete(this.tried.keys().next().value!);
    await this.prisma.songRequest.update({
      where: { id: r.id },
      data: {
        videoId: v.videoId,
        title: v.title.slice(0, 200),
        channel: (v.channelTitle ?? '').slice(0, 120),
        thumbnail: (v.thumbnail ?? '').slice(0, 500),
        durationSec: v.durationSec ?? null,
      },
    });
    this.downloading.delete(r.id); this.dlPct.delete(r.id); // eligio otra version: ya no se espera la descarga
    this.probed.delete(r.id); // vuelve a necesitar la prueba en vivo
    this.willFail.delete(r.id);
    this.rt.queueUpdated(businessId);
    return { ok: true, title: v.title };
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
  async playerHeartbeat(businessId: string, requestId?: string, positionSec?: number, durationSec?: number) {
    const s = await this.activeSession(this.prisma, businessId);
    if (!s) return { ok: true };
    const data: { tvLastSeenAt: Date; positionSec?: number } = { tvLastSeenAt: new Date() };
    if (requestId && (positionSec !== undefined || durationSec !== undefined)) {
      const cur = await this.prisma.songRequest.findFirst({ where: { sessionId: s.id, status: 'PLAYING' }, select: { id: true, durationSec: true } });
      if (cur?.id === requestId) {
        if (positionSec !== undefined) data.positionSec = Math.max(0, Math.floor(positionSec));
        // La duracion real la conoce el reproductor (YouTube getDuration / video local): si difiere de la
        // que trajo la busqueda (o si no habia), se corrige la ficha de la cancion. Solo escribe cuando cambia.
        const dur = durationSec && durationSec > 0 ? Math.floor(durationSec) : null;
        if (dur && cur.durationSec !== dur) await this.prisma.songRequest.update({ where: { id: cur.id }, data: { durationSec: dur } }).catch(() => {});
      }
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
    // 100 no existe/privado, 101/150 el dueno bloqueo la reproduccion incrustada: es permanente, se recuerda.
    // El 153 (referencia del reproductor) no se memoriza: no es del video, afectaria a todos por igual.
    if (code === 100 || code === 101 || code === 150) {
      const cur = await this.prisma.songRequest.findFirst({ where: { id: requestId, status: 'PLAYING' }, select: { videoId: true, source: true } });
      if (cur && cur.source !== 'LOCAL') await this.yt.markBlocked(cur.videoId);
      // 101/150: si el agente local puede bajarla, no se descarta: espera en la cola mientras se descarga
      if (cur && cur.source !== 'LOCAL' && (code === 101 || code === 150) && (await this.startDownload(businessId, { id: requestId, videoId: cur.videoId, source: cur.source }))) {
        return this.deferCurrent(businessId, requestId);
      }
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
