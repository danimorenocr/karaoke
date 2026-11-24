import { BadRequestException, Controller, Get, Global, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SongSearchResult } from '../youtube/youtube.service';

const LOCAL_ID = /^L[\w-]{10}$/;
const MAX_SONGS = 50_000;
// Icono de nota musical (SVG en data URL) para que las pantallas de las mesas tengan miniatura sin tocar su codigo
// (debe medir menos de 500 caracteres: es el maximo que se guarda de la miniatura de una solicitud)
const NOTE_THUMB =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 9'%3E%3Crect width='9' height='9' fill='%234338ca'/%3E" +
  "%3Cpath d='M4 6.5V3l3-.7v3.7' fill='none' stroke='%23fff' stroke-width='.6'/%3E%3Ccircle cx='3.3' cy='6.6' r='.9' fill='%23fff'/%3E%3Ccircle cx='6.1' cy='5.9' r='.9' fill='%23fff'/%3E%3C/svg%3E";

export interface LocalSong { id: string; name: string }
interface Entry { socketId: string; songs: (LocalSong & { n: string })[]; at: Date }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Indice de la biblioteca de cada bar, en memoria: el agente local lo envia al conectarse y cuando cambia la carpeta. */
@Injectable()
export class AgentService {
  private agents = new Map<string, Entry>();
  constructor(private plans: PlansService) {}

  /** Lo fija el gateway: envia un mensaje al socket del agente. */
  sender?: (socketId: string, event: string, payload: unknown) => void;
  private dlHandlers: ((businessId: string, kind: 'done' | 'failed' | 'progress', body: any) => void)[] = [];
  /** Quien quiera enterarse de las descargas del agente (terminadas o fallidas). */
  onDownload(fn: (businessId: string, kind: 'done' | 'failed' | 'progress', body: any) => void) { this.dlHandlers.push(fn); }
  downloadEvent(businessId: string, kind: 'done' | 'failed' | 'progress', body: any) { this.dlHandlers.forEach((fn) => fn(businessId, kind, body)); }
  /** Pide al agente del bar que baje un video de YouTube a su carpeta. false si no hay agente conectado. */
  requestDownload(businessId: string, payload: { requestId: string; videoId: string }) {
    const sid = this.socketOf(businessId);
    if (!sid || !this.sender) return false;
    this.sender(sid, 'agent.download', payload);
    return true;
  }

  attach(businessId: string, socketId: string) {
    this.agents.set(businessId, { socketId, songs: [], at: new Date() });
  }

  setIndex(businessId: string, socketId: string, raw: unknown) {
    const e = this.agents.get(businessId);
    if (!e || e.socketId !== socketId || !Array.isArray(raw)) return false;
    const songs: Entry['songs'] = [];
    for (const r of raw.slice(0, MAX_SONGS)) {
      if (typeof r?.id !== 'string' || !LOCAL_ID.test(r.id) || typeof r?.name !== 'string' || !r.name.trim()) continue;
      const name = r.name.trim().slice(0, 200);
      songs.push({ id: r.id, name, n: norm(name) });
    }
    this.agents.set(businessId, { socketId, songs, at: new Date() });
    return true;
  }

  /** Devuelve true si ese socket era el agente vigente del bar (y lo quita). */
  detach(businessId: string, socketId: string) {
    if (this.agents.get(businessId)?.socketId !== socketId) return false;
    this.agents.delete(businessId);
    return true;
  }

  socketOf(businessId: string) {
    return this.agents.get(businessId)?.socketId;
  }

  status(businessId: string) {
    const e = this.agents.get(businessId);
    return { connected: !!e, count: e?.songs.length ?? 0 };
  }

  /** Cancion de la biblioteca por id; null si el agente no esta conectado o ya no la tiene. */
  find(businessId: string, id: string) {
    const e = this.agents.get(businessId);
    return e?.songs.find((s) => s.id === id) ?? null;
  }

  /** Busca en la biblioteca del bar (todas las palabras deben aparecer). [] si la funcion esta apagada o no hay agente. */
  async search(businessId: string, query: string): Promise<SongSearchResult[]> {
    const e = this.agents.get(businessId);
    if (!e || !e.songs.length) return [];
    if (!(await this.plans.has(businessId, 'localLibrary'))) return [];
    const q = norm(query);
    if (q.length < 2) return [];
    const words = q.split(' ');
    return e.songs
      .filter((s) => words.every((w) => s.n.includes(w)))
      .map((s) => ({ s, score: (s.n.startsWith(q) ? 0 : s.n.includes(q) ? 1 : 2) * 1000 + s.n.length }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 25)
      .map(({ s }) => ({ videoId: s.id, title: s.name, channelTitle: 'En el bar', thumbnail: NOTE_THUMB, isMusic: true, source: 'LOCAL' as const }));
  }

  /** Valida una cancion LOCAL pedida y devuelve sus datos reales (el titulo sale del indice, no del cliente). */
  async resolve(businessId: string, videoId: string) {
    if (!(await this.plans.has(businessId, 'localLibrary'))) throw new BadRequestException('La biblioteca local no esta activa en tu plan');
    const s = this.find(businessId, videoId);
    if (!s) throw new BadRequestException('Esa cancion ya no esta disponible en el bar (el agente local esta desconectado o la quitaron)');
    return { title: s.name, channel: 'En el bar', thumbnail: NOTE_THUMB };
  }
}

/** Panel del administrador: emparejar el agente y ver su estado. */
@Controller('agent')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'DJ')
class AgentController {
  constructor(private agents: AgentService, private prisma: PrismaService, private plans: PlansService) {}

  @Get('status')
  async status(@CurrentUser() u: AuthUser) {
    const id = u.businessId!;
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id }, select: { agentToken: true } });
    return { enabled: await this.plans.has(id, 'localLibrary'), paired: !!b.agentToken, ...this.agents.status(id) };
  }

  /** Token para pegar en el agente local. Solo lo ve el ADMIN. */
  @Get('token')
  @Roles('ADMIN')
  async token(@CurrentUser() u: AuthUser) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: u.businessId! }, select: { agentToken: true } });
    return { token: b.agentToken };
  }

  /** Crea o regenera el token (el agente anterior deja de poder conectarse). */
  @Post('token')
  @Roles('ADMIN')
  async regenerate(@CurrentUser() u: AuthUser) {
    const token = randomBytes(24).toString('hex');
    await this.prisma.business.update({ where: { id: u.businessId! }, data: { agentToken: token } });
    return { token };
  }
}

@Global()
@Module({ controllers: [AgentController], providers: [AgentService], exports: [AgentService] })
export class AgentModule {}
