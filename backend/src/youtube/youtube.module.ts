import { Controller, Get, Module, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { YoutubeService } from './youtube.service';

@Controller('youtube')
class YoutubeController {
  constructor(private yt: YoutubeService) {}

  /** ?ids=a,b,c -> ids que si se pueden reproducir en la TV (para filtrar resultados antes de mostrarlos). */
  @Get('validate')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  async validate(@Query('ids') ids = '', @Query('music') music = '') {
    return this.yt.filterEmbeddable(ids.split(','), music === '1');
  }

  @Get('search')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@Query('q') q = '') {
    return this.yt.searchSongs(q);
  }
}

@Module({ controllers: [YoutubeController], providers: [YoutubeService], exports: [YoutubeService] })
export class YoutubeModule {}
