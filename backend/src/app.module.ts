import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.service';
import { PublicModule } from './public/public.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.gateway';
import { StatsModule } from './stats/stats.module';
import { YoutubeModule } from './youtube/youtube.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1200 }]),
    PrismaModule,
    AuthModule,
    RealtimeModule,
    QueueModule,
    PublicModule,
    AdminModule,
    YoutubeModule,
    StatsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
