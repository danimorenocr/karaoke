import { Controller, Get, Global, Module, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.gateway';
import { YoutubeModule } from '../youtube/youtube.module';
import { YoutubeService } from '../youtube/youtube.service';
import { EventsService } from './events.service';
import { MetricsService } from './metrics.service';
import { Range, StatsService } from './stats.service';

/** Estadisticas del establecimiento (dueno). El businessId sale del token, nunca del cliente. */
@Controller('admin/stats')
@UseGuards(AuthGuard)
@Roles('ADMIN')
class AdminStatsController {
  constructor(private stats: StatsService) {}

  @Get()
  get(@CurrentUser() u: AuthUser, @Query('range') range = 'today', @Query('tz') tz = '0') {
    const r: Range = range === '7d' || range === '30d' ? range : 'today';
    const offset = Math.max(-840, Math.min(840, Number(tz) || 0));
    return this.stats.compute(u.businessId!, r, offset);
  }
}

/** Estadisticas de cualquier establecimiento o de todos juntos (super admin). `all` = toda la plataforma. */
@Controller('super/stats')
@UseGuards(AuthGuard)
@Roles('SUPER_ADMIN')
class SuperStatsController {
  constructor(private stats: StatsService) {}

  @Get(':businessId')
  get(@Param('businessId') businessId: string, @Query('range') range = 'today', @Query('tz') tz = '0') {
    const r: Range = range === '7d' || range === '30d' ? range : 'today';
    const offset = Math.max(-840, Math.min(840, Number(tz) || 0));
    return this.stats.compute(businessId === 'all' ? undefined : businessId, r, offset);
  }
}

/** Salud tecnica de la plataforma (solo super admin). */
@Controller('super/metrics')
@UseGuards(AuthGuard)
@Roles('SUPER_ADMIN')
class SuperMetricsController {
  constructor(
    private metrics: MetricsService,
    private rt: RealtimeService,
    private yt: YoutubeService,
    private prisma: PrismaService,
  ) {}

  @Get()
  async get() {
    const t = Date.now();
    let db: { ok: boolean; ms: number } = { ok: true, ms: 0 };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db.ms = Date.now() - t;
    } catch {
      db = { ok: false, ms: Date.now() - t };
    }
    return {
      ...this.metrics.snapshot(),
      database: db,
      sockets: this.rt.stats(),
      youtube: this.yt.usage(),
    };
  }
}

@Global()
@Module({
  imports: [YoutubeModule],
  controllers: [AdminStatsController, SuperStatsController, SuperMetricsController],
  providers: [EventsService, MetricsService, StatsService],
  exports: [EventsService, MetricsService],
})
export class StatsModule {}
