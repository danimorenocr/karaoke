import { Body, Controller, Get, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard, AuthUser, CurrentUser, Roles } from '../auth/auth';
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
class RequestRefDto {
  @IsString() requestId: string;
}

const biz = (u: AuthUser) => u.businessId!;

/** Panel DJ (DJ y ADMIN del establecimiento; el businessId siempre sale del token, nunca del cliente). */
@Controller('dj')
@UseGuards(AuthGuard)
@Roles('DJ', 'ADMIN')
class DjController {
  constructor(private q: QueueService) {}

  @Get('queue') queue(@CurrentUser() u: AuthUser) { return this.q.djState(biz(u)); }
  @Post('session/start') start(@CurrentUser() u: AuthUser) { return this.q.startSession(biz(u)); }
  @Post('session/stop') stop(@CurrentUser() u: AuthUser) { return this.q.stopSession(biz(u)); }
  @Patch('session/requests-open') open(@CurrentUser() u: AuthUser, @Body() b: FlagDto) { return this.q.setRequestsOpen(biz(u), b.value); }
  @Patch('playback/paused') pause(@CurrentUser() u: AuthUser, @Body() b: FlagDto) { return this.q.setPaused(biz(u), b.value); }
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
  @Post('next') next(@CurrentUser() u: AuthUser) { return this.q.playerNext(biz(u)); }
  @Post('ended') ended(@CurrentUser() u: AuthUser, @Body() b: RequestRefDto) { return this.q.playerEnded(biz(u), b.requestId); }
  @Post('error') error(@CurrentUser() u: AuthUser, @Body() b: RequestRefDto) { return this.q.playerError(biz(u), b.requestId); }
}

@Module({ controllers: [DjController, PlayerController], providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
