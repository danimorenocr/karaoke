import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthGuard } from '../auth/auth';
import { PrismaService } from '../prisma/prisma.service';

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
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private keepAlive?: NodeJS.Timeout;
  constructor(private prisma: PrismaService, private auth: AuthGuard) {}

  /**
   * Mientras haya alguien conectado, un SELECT 1 cada 3 min evita que Neon suspenda la BD
   * (la primera consulta tras una suspension tarda segundos). Sin clientes no consulta: no gasta horas de computo.
   */
  onModuleInit() {
    this.keepAlive = setInterval(() => {
      if ((this.server?.engine?.clientsCount ?? 0) > 0) {
        this.prisma.$queryRaw`SELECT 1`.catch((e) => new Logger('KeepAlive').warn(`BD no responde: ${e.message}`));
      }
    }, 3 * 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.keepAlive);
  }

  async handleConnection(socket: Socket) {
    try {
      const { token, tableToken, role } = socket.handshake.auth ?? {};
      let businessId: string | null = null;
      if (tableToken) {
        const t = await this.prisma.table.findUnique({ where: { qrToken: String(tableToken) } });
        if (t?.active) businessId = t.businessId;
      } else if (token) {
        const u = await this.auth.verify(String(token));
        businessId = u.businessId;
        if (businessId && role === 'tv') await socket.join(`tv:${businessId}`);
      }
      if (!businessId) return socket.disconnect(true);
      socket.data.businessId = businessId;
      await socket.join(`biz:${businessId}`);
      if (role === 'tv') this.emitTvStatus(businessId);
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const id = socket.data.businessId;
    if (id) setTimeout(() => this.emitTvStatus(id), 300);
  }

  tvCount(businessId: string) {
    return this.server.sockets.adapter.rooms.get(`tv:${businessId}`)?.size ?? 0;
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
  constructor(private gw: RealtimeGateway) {}
  /** Cambio en cola/solicitudes/sesion: los clientes vuelven a pedir el estado. */
  queueUpdated(businessId: string) {
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
}

@Global()
@Module({ providers: [RealtimeGateway, RealtimeService], exports: [RealtimeService] })
export class RealtimeModule {}
