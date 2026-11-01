import { Body, Controller, Get, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { QueueModule } from '../queue/queue.module';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeModule } from '../youtube/youtube.module';
import { YoutubeService } from '../youtube/youtube.service';

class CreateRequestDto {
  @Matches(/^[\w-]{11}$/, { message: 'videoId invalido' }) videoId: string;
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(120) channel?: string;
  @IsOptional() @IsString() @MaxLength(500) thumbnail?: string;
  @IsOptional() @IsInt() @Min(0) @Max(36000) durationSec?: number;
}

/** Sin login: la mesa se identifica por el token del QR. */
@Controller('public/:token')
class PublicController {
  constructor(private q: QueueService, private prisma: PrismaService, private yt: YoutubeService) {}

  @Get('state')
  @Throttle({ default: { limit: 3000, ttl: 60_000 } })
  state(@Param('token') token: string) {
    return this.q.publicState(token);
  }

  /** Busqueda segun la configuracion del bar (solo karaoke o cualquier musica). */
  @Get('search')
  @Throttle({ default: { limit: 90, ttl: 60_000 } }) // varias mesas comparten la IP del wifi del bar
  async search(@Param('token') token: string, @Query('q') q = '') {
    const table = await this.prisma.table.findUnique({ where: { qrToken: token }, include: { business: { select: { searchMode: true, status: true } } } });
    if (!table || !table.active || table.business.status !== 'ACTIVE') throw new NotFoundException('Este codigo QR no es valido');
    return this.yt.searchSongs(q, table.business.searchMode);
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
