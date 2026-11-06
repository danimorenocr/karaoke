import { Body, Controller, Get, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { QueueModule } from '../queue/queue.module';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeModule } from '../youtube/youtube.module';
import { YoutubeService } from '../youtube/youtube.service';
import { EventsService } from '../stats/events.service';

class CreateRequestDto {
  @Matches(/^[\w-]{11}$/, { message: 'videoId invalido' }) videoId: string;
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(120) channel?: string;
  @IsOptional() @IsString() @MaxLength(500) thumbnail?: string;
  @IsOptional() @IsInt() @Min(0) @Max(36000) durationSec?: number;
  @IsOptional() @IsString() @MaxLength(40) clientId?: string;
}

class ScanDto {
  @IsOptional() @IsString() @MaxLength(40) clientId?: string;
}
class FeedbackDto {
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @MaxLength(300) comment?: string;
  @IsOptional() @IsString() @MaxLength(40) clientId?: string;
}

/** Sin login: la mesa se identifica por el token del QR. */
@Controller('public/:token')
class PublicController {
  constructor(private q: QueueService, private prisma: PrismaService, private yt: YoutubeService, private events: EventsService) {}

  @Get('state')
  @Throttle({ default: { limit: 3000, ttl: 60_000 } })
  state(@Param('token') token: string) {
    return this.q.publicState(token);
  }

  /** Busqueda segun la configuracion del bar (solo karaoke o cualquier musica). */
  @Get('search')
  @Throttle({ default: { limit: 90, ttl: 60_000 } }) // varias mesas comparten la IP del wifi del bar
  async search(@Param('token') token: string, @Query('q') q = '', @Query('mode') mode?: string) {
    const table = await this.prisma.table.findUnique({ where: { qrToken: token }, include: { business: { select: { searchMode: true, searchProvider: true, status: true } } } });
    if (!table || !table.active || table.business.status !== 'ACTIVE') throw new NotFoundException('Este codigo QR no es valido');
    this.events.record({ businessId: table.businessId, tableId: table.id, type: 'SEARCH_PERFORMED', metadata: { q: q.trim().toLowerCase().slice(0, 60) } });
    // El comensal elige karaoke o normal; si no manda nada, vale la configuracion del bar
    const m = mode === 'KARAOKE' || mode === 'ANY' ? mode : table.business.searchMode;
    return this.yt.searchSongs(q, m, table.business.searchProvider);
  }

  /** La pagina de la mesa avisa una vez por visita (no en cada refresco) para medir escaneos del QR. */
  @Post('scan')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async scan(@Param('token') token: string, @Body() dto: ScanDto) {
    const table = await this.prisma.table.findUnique({ where: { qrToken: token } });
    if (!table || !table.active) throw new NotFoundException('Este codigo QR no es valido');
    const session = await this.prisma.karaokeSession.findFirst({ where: { businessId: table.businessId, status: 'ACTIVE' }, select: { id: true } });
    this.events.record({ businessId: table.businessId, sessionId: session?.id, tableId: table.id, type: 'QR_SCANNED', metadata: { clientId: dto.clientId } });
    return { ok: true };
  }

  /** Valoracion opcional y breve (1 a 5). */
  @Post('feedback')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async feedback(@Param('token') token: string, @Body() dto: FeedbackDto) {
    const table = await this.prisma.table.findUnique({ where: { qrToken: token } });
    if (!table || !table.active) throw new NotFoundException('Este codigo QR no es valido');
    const session = await this.prisma.karaokeSession.findFirst({ where: { businessId: table.businessId, status: 'ACTIVE' }, select: { id: true } });
    this.events.record({
      businessId: table.businessId, sessionId: session?.id, tableId: table.id, type: 'FEEDBACK_SUBMITTED',
      metadata: { rating: dto.rating, comment: dto.comment?.trim() || undefined, clientId: dto.clientId },
    });
    return { ok: true };
  }

  @Post('requests')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  create(@Param('token') token: string, @Body() dto: CreateRequestDto) {
    return this.q.createRequest(token, dto);
  }

  @Post('requests/:id/cancel')
  cancel(@Param('token') token: string, @Param('id') id: string) {
    return this.q.cancelOwn(token, id);
  }
}

@Module({ imports: [QueueModule, YoutubeModule], controllers: [PublicController] })
export class PublicModule {}
