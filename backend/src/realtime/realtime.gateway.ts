import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AgentService } from '../agent/agent.module';
import { AuthGuard } from '../auth/auth';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../stats/metrics.service';

const origins = () => (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim());

/**
 * Salas: `biz:<id>` (todos los clientes del bar) y `tv:<id>` (pantallas TV).
 * Los eventos solo avisan; la fuente de verdad es el backend via REST.
 */
@WebSocketGateway({
  cors: { origin: origins(), credentials: true },
  // Latidos: el servidor hace ping cada 10 s y si no hay respuesta en 8 s da la conexion por perdida
  // (asi la TV caida se detecta en ~18 s y no en minutos).
  pingInterval: 10_000,
  pingTimeout: 8_000,
  // El agente local envia el indice de su biblioteca (miles de nombres) en un solo mensaje
  maxHttpBufferSize: 8e6,
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private keepAlive?: NodeJS.Timeout;
  constructor(private prisma: PrismaService, private auth: AuthGuard, private metrics: MetricsService, private agents: AgentService) {}

  /**
   * Mientras haya alguien conectado, un SELECT 1 cada 3 min evita que Neon suspenda la BD
   * (la primera consulta tras una suspension tarda segundos). Sin clientes no consulta: no gasta horas de computo.
   */
  onModuleInit() {
    this.agents.sender = (socketId, event, payload) => { this.server.to(socketId).emit(event, payload); };
    this.keepAlive = setInterval(() => {
      if ((this.server?.engine?.clientsCount ?? 0) > 0) {
        this.prisma.$queryRaw`SELECT 1`.catch((e) => new Logger('KeepAlive').warn(`BD no responde: ${e.message}`));
      }
    }, 3 * 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.keepAlive);
  }

  /** El cliente puede emitir mensajes antes de que termine la validacion del token (consulta a la BD): se espera a `ready`. */
  handleConnection(socket: Socket) {
    socket.data.ready = this.setup(socket);
    return socket.data.ready;
  }

  private async setup(socket: Socket) {
    try {
      const { token, tableToken, role, agentToken } = socket.handshake.auth ?? {};
      // Agente local del bar: no entra a las salas del karaoke, solo envia el indice de su biblioteca
      if (agentToken) {
        const b = await this.prisma.business.findUnique({ where: { agentToken: String(agentToken) }, select: { id: true } });
        if (!b) return socket.disconnect(true);
        const prev = this.agents.socketOf(b.id);
        if (prev && prev !== socket.id) (await this.server.in(prev).fetchSockets()).forEach((s) => { s.data.agentBiz = undefined; s.disconnect(true); });
        socket.data.agentBiz = b.id;
        this.agents.attach(b.id, socket.id);
        this.emitAgentStatus(b.id);
        return;
      }
      let businessId: string | null = null;
      if (tableToken) {
        const t = await this.prisma.table.findUnique({ where: { qrToken: String(tableToken) } });
        if (t?.active) businessId = t.businessId;
      } else if (token) {
        const u = await this.auth.verify(String(token));
        businessId = u.businessId;
        // La sala de TV ya no se une al conectar: se une al pulsar "Iniciar karaoke" (evento tv.claim)
      }
      if (!businessId) return socket.disconnect(true);
      socket.data.businessId = businessId;
      this.metrics.socketConnected();
      await socket.join(`biz:${businessId}`);
      if (role === 'tv') this.emitTvStatus(businessId);
    } catch {
      socket.disconnect(true);
    }
  }

  /**
   * La pantalla que pulsa "Iniciar karaoke" toma el control: las demas TV del bar se desconectan y se detienen.
   * Asi nunca suenan dos reproductores a la vez (ni el DJ puede dejar la TV muda abriendo otra pestaña sin iniciarla).
   */
  @SubscribeMessage('tv.claim')
  async claimTv(@ConnectedSocket() socket: Socket) {
    const businessId = socket.data.businessId as string | undefined;
    if (!businessId) return;
    const room = `tv:${businessId}`;
    const others = (await this.server.in(room).fetchSockets()).filter((s) => s.id !== socket.id);
    others.forEach((s) => { s.emit('tv.replaced'); s.disconnect(true); });
    await socket.join(room);
    this.emitTvStatus(businessId);
  }

  /** El agente envia (o reenvia) la lista de videos de su carpeta: [{ id, name }]. */
  @SubscribeMessage('agent.index')
  async agentIndex(@ConnectedSocket() socket: Socket, @MessageBody() body: { songs?: unknown }) {
    await socket.data.ready;
    const biz = socket.data.agentBiz as string | undefined;
    if (!biz || !this.agents.setIndex(biz, socket.id, body?.songs)) return { ok: false };
    this.emitAgentStatus(biz);
    return { ok: true, count: this.agents.status(biz).count };
  }

  /** El agente avisa que termino de bajar un video: { requestId, id } (id = id del archivo en su indice). */
  @SubscribeMessage('agent.download.done')
  async agentDownloadDone(@ConnectedSocket() socket: Socket, @MessageBody() body: { requestId?: unknown; id?: unknown }) {
    await socket.data.ready;
    const biz = socket.data.agentBiz as string | undefined;
    if (biz && typeof body?.requestId === 'string' && typeof body?.id === 'string') this.agents.downloadEvent(biz, 'done', body);
    return { ok: true };
  }

  @SubscribeMessage('agent.download.failed')
  async agentDownloadFailed(@ConnectedSocket() socket: Socket, @MessageBody() body: { requestId?: unknown; reason?: unknown }) {
    await socket.data.ready;
    const biz = socket.data.agentBiz as string | undefined;
    if (biz && typeof body?.requestId === 'string') this.agents.downloadEvent(biz, 'failed', body);
    return { ok: true };
  }

  private emitAgentStatus(businessId: string) {
    this.server.to(`biz:${businessId}`).emit('agent.status', this.agents.status(businessId));
  }

  handleDisconnect(socket: Socket) {
    const agentBiz = socket.data.agentBiz as string | undefined;
    if (agentBiz) {
      if (this.agents.detach(agentBiz, socket.id)) this.emitAgentStatus(agentBiz);
      return;
    }
    const id = socket.data.businessId;
    if (id) this.metrics.socketDisconnected();
    if (id) setTimeout(() => this.emitTvStatus(id), 300);
  }

  tvCount(businessId: string) {
    return this.server.sockets.adapter.rooms.get(`tv:${businessId}`)?.size ?? 0;
  }

  /** Conexiones abiertas ahora mismo (todas las salas). */
  stats() {
    const rooms = this.server.sockets.adapter.rooms;
    let tvScreens = 0;
    rooms.forEach((set, name) => { if (name.startsWith('tv:')) tvScreens += set.size; });
    return { connected: this.server.engine?.clientsCount ?? 0, tvScreens };
  }

  private emitTvStatus(businessId: string) {
    this.server.to(`biz:${businessId}`).emit('tv.status', { connected: this.tvCount(businessId) > 0 });
  }

  emit(businessId: string, event: string, payload?: unknown) {
    this.server.to(`biz:${businessId}`).emit(event, payload);
  }
}

@Injectable()
export class RealtimeService {
  private listeners: ((businessId: string) => void)[] = [];
  constructor(private gw: RealtimeGateway) {}
  /** Quien guarda estados en memoria se entera de cada cambio antes de que los clientes vuelvan a pedirlos. */
  onChange(fn: (businessId: string) => void) {
    this.listeners.push(fn);
  }
  /** Cambio en cola/solicitudes/sesion: los clientes vuelven a pedir el estado. */
  queueUpdated(businessId: string) {
    this.listeners.forEach((fn) => fn(businessId));
    this.gw.emit(businessId, 'queue.updated');
  }
  /** Control de reproduccion para la TV (pausa/reanudar/recargar el video actual). */
  playback(businessId: string, event: 'playback.paused' | 'playback.resumed' | 'playback.reload') {
    this.gw.emit(businessId, event);
    this.gw.emit(businessId, 'queue.updated');
  }
  tvCount(businessId: string) {
    return this.gw.tvCount(businessId);
  }
  stats() {
    return this.gw.stats();
  }
}

@Global()
@Module({ providers: [RealtimeGateway, RealtimeService], exports: [RealtimeService] })
export class RealtimeModule {}
