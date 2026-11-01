import { Controller, Get, Module, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { YoutubeService } from './youtube.service';

@Controller('youtube')
class YoutubeController {
  constructor(private yt: YoutubeService) {}

  @Get('search')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  search(@Query('q') q = '') {
    return this.yt.searchSongs(q);
  }
}

@Module({ controllers: [YoutubeController], providers: [YoutubeService], exports: [YoutubeService] })
export class YoutubeModule {}
