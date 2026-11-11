import { Body, Controller, Get, Module, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeModule } from '../youtube/youtube.module';
import { YoutubeService } from '../youtube/youtube.service';
import { QueueService } from './queue.service';

class ReorderDto {
  @IsArray() @IsString({ each: true }) ids: string[];
}
class ReasonDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
class FlagDto {
  @IsBoolean() value: boolean;
}
class DjAddDto {
  @IsString() tableId: string;
  @Matches(/^[\w-]{11}$/, { message: 'videoId invalido' }) videoId: string;
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(120) channel?: string;
  @IsOptional() @IsString() @MaxLength(500) thumbnail?: string;
  @IsOptional() @IsInt() @Min(0) @Max(36000) durationSec?: number;
}
class AutoDjDto {
  @IsOptional() @IsIn(['OFF', 'AUTO']) mode?: 'OFF' | 'AUTO';
  @IsOptional() @IsArray() @IsString({ each: true }) genres?: string[];
}
class HeartbeatDto {
  @IsOptional() @IsString() requestId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(36000) positionSec?: number;
}
class RequestRefDto {
  @IsString() requestId: string;
  /** Codigo de error del reproductor de YouTube (solo en /player/error). */
  @IsOptional() @IsInt() code?: number;
}

import { PlansService } from '../plans/plans.service';
const biz = (u: AuthUser) => u.businessId!;

/** Panel DJ (DJ y ADMIN del establecimiento; el businessId siempre sale del token, nunca del cliente). */
@Controller('dj')
@UseGuards(AuthGuard)
@Roles('DJ', 'ADMIN')
class DjController {
  constructor(private q: QueueService, private prisma: PrismaService, private yt: YoutubeService, private plans: PlansService) {}

  /** Busqueda del DJ, segun la configuracion del bar (solo karaoke / cualquier musica). */
  @Get('search') async search(@CurrentUser() u: AuthUser, @Query('q') q = '') {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: biz(u) }, select: { searchMode: true, searchProvider: true } });
    return this.yt.searchSongs(q, (await this.plans.has(biz(u), 'searchAny')) ? b.searchMode : 'KARAOKE', b.searchProvider);
  }
  @Post('requests') add(@CurrentUser() u: AuthUser, @Body() d: DjAddDto) {
    const { tableId, ...song } = d;
    return this.q.djAddRequest(biz(u), tableId, song);
  }


  @Get('queue') queue(@CurrentUser() u: AuthUser) { return this.q.djState(biz(u)); }
  @Post('session/start') start(@CurrentUser() u: AuthUser) { return this.q.startSession(biz(u)); }
  @Post('session/stop') stop(@CurrentUser() u: AuthUser) { return this.q.stopSession(biz(u)); }
  @Patch('session/requests-open') open(@CurrentUser() u: AuthUser, @Body() b: FlagDto) { return this.q.setRequestsOpen(biz(u), b.value); }
  @Patch('playback/paused') pause(@CurrentUser() u: AuthUser, @Body() b: FlagDto) { return this.q.setPaused(biz(u), b.value); }
  @Patch('autodj') autodj(@CurrentUser() u: AuthUser, @Body() b: AutoDjDto) { return this.q.setAutoDj(biz(u), b.mode, b.genres); }
  @Post('playback/skip') skip(@CurrentUser() u: AuthUser) { return this.q.skip(biz(u)); }
  @Post('playback/reload') reload(@CurrentUser() u: AuthUser) { return this.q.reloadCurrent(biz(u)); }
  @Patch('requests/:id/approve') approve(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.q.approve(biz(u), id); }
  @Patch('requests/:id/reject') reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: ReasonDto) { return this.q.reject(biz(u), id, b.reason); }
  @Patch('requests/:id/retry') retry(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.q.retry(biz(u), id); }
  @Post('tables/:id/unlink') unlink(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.q.unlinkTable(biz(u), id); }
  @Patch('queue/reorder') reorder(@CurrentUser() u: AuthUser, @Body() b: ReorderDto) { return this.q.reorder(biz(u), b.ids); }
}

/** Pantalla TV (inicia sesion con una cuenta DJ/ADMIN). */
@Controller('player')
@UseGuards(AuthGuard)
@Roles('DJ', 'ADMIN')
class PlayerController {
  constructor(private q: QueueService) {}

  @Get('state') state(@CurrentUser() u: AuthUser) { return this.q.playerState(biz(u)); }
  @Get('banner') banner(@CurrentUser() u: AuthUser) { return this.q.tvBanner(biz(u)); }
  @Get('logo') logo(@CurrentUser() u: AuthUser) { return this.q.tvLogo(biz(u)); }
  @Post('heartbeat') heartbeat(@CurrentUser() u: AuthUser, @Body() b: HeartbeatDto) { return this.q.playerHeartbeat(biz(u), b.requestId, b.positionSec); }
  @Post('next') next(@CurrentUser() u: AuthUser) { return this.q.playerNext(biz(u)); }
  @Post('ended') ended(@CurrentUser() u: AuthUser, @Body() b: RequestRefDto) { return this.q.playerEnded(biz(u), b.requestId); }
  @Post('error') error(@CurrentUser() u: AuthUser, @Body() b: RequestRefDto) { return this.q.playerError(biz(u), b.requestId, b.code); }
}

@Module({ imports: [YoutubeModule], controllers: [DjController, PlayerController], providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
