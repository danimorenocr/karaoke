import { Injectable, Logger } from '@nestjs/common';
import { EventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EventInput {
  businessId: string;
  sessionId?: string | null;
  tableId?: string | null;
  type: EventType;
  metadata?: Record<string, unknown>;
}

/**
 * Registra eventos de negocio (escaneo QR, solicitud, reproduccion...). Las metricas se calculan despues a partir de ellos.
 * Es "dispara y olvida": no suma latencia a la accion del usuario y un fallo aqui nunca la rompe.
 */
@Injectable()
export class EventsService {
  private log = new Logger('Events');
  constructor(private prisma: PrismaService) {}

  record(e: EventInput): void {
    this.prisma.karaokeEvent
      .create({
        data: {
          businessId: e.businessId,
          sessionId: e.sessionId ?? null,
          tableId: e.tableId ?? null,
          type: e.type,
          metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      })
      .catch((err) => this.log.warn(`No se pudo guardar el evento ${e.type}: ${err.message}`));
  }
}
