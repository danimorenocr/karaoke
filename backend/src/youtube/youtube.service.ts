import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface SongSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  durationSec?: number;
  viewCount?: number;
  isMusic?: boolean;
}

/** Abstraccion para poder cambiar de proveedor sin tocar cola ni mesas. */
export interface MusicProvider {
  searchSongs(query: string): Promise<SongSearchResult[]>;
}

const VIDEO_ID = /^[\w-]{11}$/;
// Pistas de que un video es musical (cuando YouTube no da la categoria)
const MUSIC_RE = /karaoke|lyrics?|letra|instrumental|official (audio|video|music)|(video|audio) oficial|m[uú]sica|music|cover|remix|en vivo|live|feat\.|ft\.|vevo|- topic|session|acoustic|ac[uú]stic/i;
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
  private use = { day: '', searches: 0, videos: 0 };

  /** Consumo estimado de cuota de hoy (en memoria; se reinicia al desplegar). search.list = 100 unidades, videos.list = 1. */
  usage() {
    this.rollDay();
    return {
      day: this.use.day,
      searchCalls: this.use.searches,
      videoCalls: this.use.videos,
      estimatedUnits: this.use.searches * 100 + this.use.videos,
      dailyQuota: 10_000,
      blocked: Date.now() < this.quotaBlockedUntil,
    };
  }

  private rollDay() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.use.day !== today) this.use = { day: today, searches: 0, videos: 0 };
  }

  /** mode KARAOKE: versiones karaoke. ANY: cualquier video de musica. */
  async searchSongs(query: string, mode: 'KARAOKE' | 'ANY' = 'KARAOKE'): Promise<SongSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) throw new BadRequestException('Escribe al menos 2 caracteres');
    const key = `${mode}:${q}`; // cada modo tiene su propia cache
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

    // Pegar un link/ID no gasta cuota de search.list
    const id = parseVideoId(query);
    const data = id ? await this.byId(id) : await this.search(query.trim(), mode);
    this.cache.set(key, { at: Date.now(), data });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }

  private embeddable = new Map<string, { at: number; ok: boolean; music: boolean; title?: string }>();

  /** Devuelve solo los ids que se pueden reproducir en un reproductor incrustado (disponibles y no restringidos). */
  async filterEmbeddable(rawIds: string[], musicOnly = false): Promise<{ ok: string[]; titles: Record<string, string> }> {
    const ids = [...new Set(rawIds.filter((i) => VIDEO_ID.test(i)))].slice(0, 20);
    const fresh = (id: string) => {
      const c = this.embeddable.get(id);
      return c && Date.now() - c.at < 6 * TTL_MS ? c : null;
    };
    const todo = ids.filter((id) => !fresh(id));
    if (todo.length) {
      let checked = false;
      if (process.env.YOUTUBE_API_KEY) {
        try {
          const vids = await this.videos(todo);
          const found = new Map(vids.map((v) => [v.videoId, v]));
          todo.forEach((id) => this.embeddable.set(id, { at: Date.now(), ok: found.has(id), music: !!found.get(id)?.isMusic, title: found.get(id)?.title }));
          checked = true;
        } catch {
          // cuota agotada: se comprueba con oEmbed
        }
      }
      if (!checked) {
        await Promise.all(
          todo.map(async (id) => {
            try {
              const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { signal: AbortSignal.timeout(4000) });
              // 401/404 = no incrustable o no existe. oEmbed no da categoria: se juzga por titulo y canal.
              const j: any = r.ok ? await r.json().catch(() => ({})) : {};
              this.embeddable.set(id, { at: Date.now(), ok: r.ok, music: MUSIC_RE.test(`${j.title ?? ''} ${j.author_name ?? ''}`), title: j.title });
            } catch {
              // sin respuesta: no se guarda, se deja pasar y se valida al pedirlo
              this.embeddable.set(id, { at: Date.now() - 6 * TTL_MS + 60_000, ok: true, music: true });
            }
          }),
        );
      }
    }
    const ok = ids.filter((id) => fresh(id)?.ok && (!musicOnly || fresh(id)?.music));
    const titles: Record<string, string> = {};
    ok.forEach((id) => { const t = fresh(id)?.title; if (t) titles[id] = t; });
    return { ok, titles };
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
      try {
        const items = await this.videos([id]);
        if (items.length) return items;
      } catch {
        // Cuota agotada u otro fallo de la API: se valida con oEmbed (no usa cuota)
      }
    }
    // Sin API key: oEmbed (no requiere clave, sin duracion)
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!r.ok) throw new BadRequestException('Video no disponible o no se puede incrustar');
    const j: any = await r.json();
    return [{ videoId: id, title: j.title, channelTitle: j.author_name, thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` }];
  }

  private async videos(ids: string[]): Promise<SongSearchResult[]> {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.search = new URLSearchParams({ part: 'snippet,contentDetails,status,statistics', id: ids.join(','), key: this.key() }).toString();
    const j: any = await this.call(url);
    return (j.items ?? [])
      .filter((v: any) => v.status?.embeddable !== false)
      .map((v: any) => ({
        videoId: v.id,
        title: v.snippet.title,
        channelTitle: v.snippet.channelTitle,
        thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? '',
        durationSec: isoToSeconds(v.contentDetails.duration),
        viewCount: Number(v.statistics?.viewCount) || undefined,
        // Categoria 10 = Musica; si no, se mira el titulo/canal
        isMusic: v.snippet.categoryId === '10' || MUSIC_RE.test(`${v.snippet.title} ${v.snippet.channelTitle}`),
      }));
  }

  private async search(q: string, mode: 'KARAOKE' | 'ANY'): Promise<SongSearchResult[]> {
    if (Date.now() < this.quotaBlockedUntil) {
      throw new HttpException(
        'La busqueda esta temporalmente limitada. Intenta mas tarde o pega un link de YouTube.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    const params: Record<string, string> = {
      part: 'snippet',
      type: 'video',
      maxResults: '15',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      q: mode === 'KARAOKE' ? `${q} karaoke` : q,
      key: this.key(),
    };
    if (mode === 'ANY') params.videoCategoryId = '10'; // categoria "Musica"
    url.search = new URLSearchParams(params).toString();
    const j: any = await this.call(url);
    const ids = (j.items ?? []).map((i: any) => i.id.videoId).filter(Boolean);
    if (!ids.length) return [];
    const items = await this.videos(ids);
    // Se conserva el orden de relevancia de YouTube; el orden por vistas lo aplica el cliente
    return ids.map((id: string) => items.find((i) => i.videoId === id)).filter(Boolean) as SongSearchResult[];
  }

  private async call(url: URL) {
    this.rollDay();
    if (url.pathname.endsWith('/search')) this.use.searches++;
    else this.use.videos++;
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
