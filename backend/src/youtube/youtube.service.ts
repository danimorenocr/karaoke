import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface SongSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  durationSec?: number;
}

/** Abstraccion para poder cambiar de proveedor sin tocar cola ni mesas. */
export interface MusicProvider {
  searchSongs(query: string): Promise<SongSearchResult[]>;
}

const VIDEO_ID = /^[\w-]{11}$/;
const TTL_MS = 60 * 60 * 1000;

function parseVideoId(q: string): string | null {
  const s = q.trim();
  if (VIDEO_ID.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function isoToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0);
}

@Injectable()
export class YoutubeService implements MusicProvider {
  private log = new Logger('Youtube');
  private cache = new Map<string, { at: number; data: SongSearchResult[] }>();
  private quotaBlockedUntil = 0;

  async searchSongs(query: string): Promise<SongSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) throw new BadRequestException('Escribe al menos 2 caracteres');
    const hit = this.cache.get(q);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

    // Pegar un link/ID no gasta cuota de search.list
    const id = parseVideoId(query);
    const data = id ? await this.byId(id) : await this.search(query.trim());
    this.cache.set(q, { at: Date.now(), data });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }

  private key() {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      throw new ServiceUnavailableException('Busqueda no configurada. Pega un link de YouTube mientras tanto.');
    }
    return key;
  }

  private async byId(id: string): Promise<SongSearchResult[]> {
    if (process.env.YOUTUBE_API_KEY) {
      const items = await this.videos([id]);
      if (items.length) return items;
    }
    // Sin API key: oEmbed (no requiere clave, sin duracion)
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!r.ok) throw new BadRequestException('Video no disponible o no se puede incrustar');
    const j: any = await r.json();
    return [{ videoId: id, title: j.title, channelTitle: j.author_name, thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` }];
  }

  private async videos(ids: string[]): Promise<SongSearchResult[]> {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.search = new URLSearchParams({ part: 'snippet,contentDetails,status', id: ids.join(','), key: this.key() }).toString();
    const j: any = await this.call(url);
    return (j.items ?? [])
      .filter((v: any) => v.status?.embeddable !== false)
      .map((v: any) => ({
        videoId: v.id,
        title: v.snippet.title,
        channelTitle: v.snippet.channelTitle,
        thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? '',
        durationSec: isoToSeconds(v.contentDetails.duration),
      }));
  }

  private async search(q: string): Promise<SongSearchResult[]> {
    if (Date.now() < this.quotaBlockedUntil) {
      throw new HttpException(
        'La busqueda esta temporalmente limitada. Intenta mas tarde o pega un link de YouTube.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: '10',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      q: `${q} karaoke`,
      key: this.key(),
    }).toString();
    const j: any = await this.call(url);
    const ids = (j.items ?? []).map((i: any) => i.id.videoId).filter(Boolean);
    return ids.length ? this.videos(ids) : [];
  }

  private async call(url: URL) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    const body: any = await r.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason;
    this.log.warn(`YouTube ${r.status} ${reason ?? ''}`);
    if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') {
      this.quotaBlockedUntil = Date.now() + 10 * 60 * 1000;
      throw new HttpException(
        'La busqueda esta temporalmente limitada (cuota de YouTube). Pega un link de YouTube.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new ServiceUnavailableException('YouTube no respondio correctamente');
  }
}
