import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ACCENT, Card, Empty } from './kit';

type Range = 'today' | 'yesterday' | 'day' | '7d' | '30d';
const RANGES: [Range, string][] = [['today', 'Hoy'], ['yesterday', 'Ayer'], ['7d', '7 días'], ['30d', '30 días']];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const secs = (s: number | null | undefined) => {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${s} s`;
  const m = s / 60;
  return m < 60 ? `${m.toFixed(1).replace('.0', '')} min` : `${(m / 60).toFixed(1)} h`;
};
const pctText = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`);

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-extrabold">{value}</div>
      {sub && <div className={`mt-1 text-xs ${tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-red-300' : 'text-slate-500'}`}>{sub}</div>}
    </div>
  );
}

/** Lista con barras horizontales proporcionales al maximo. */
function BarList({ items, empty }: { items: { label: string; n: number }[]; empty: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...items.map((i) => i.n));
  return (
    <div className="space-y-2.5">
      {items.map((i, idx) => (
        <div key={i.label + idx}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="shrink-0 text-slate-400">{i.n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div className="h-1.5 rounded-full" style={{ width: `${(i.n / max) * 100}%`, background: ACCENT }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function HourChart({ data }: { data: number[] }) {
  const first = data.findIndex((n) => n > 0);
  if (first === -1) return <Empty>Aún no hay solicitudes en este periodo.</Empty>;
  const last = data.length - 1 - [...data].reverse().findIndex((n) => n > 0);
  const slice = data.slice(Math.max(0, first - 1), Math.min(24, last + 2));
  const offset = Math.max(0, first - 1);
  const max = Math.max(...slice);
  const label = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {slice.map((n, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={`${label(offset + i)}: ${n} solicitudes`}>
            <div className="mb-1 text-center text-[10px] text-slate-400 opacity-0 group-hover:opacity-100">{n}</div>
            <div className="rounded-t-md" style={{ height: `${Math.max(2, (n / max) * 100)}%`, background: n === max ? ACCENT : ACCENT + '88' }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 text-[10px] text-slate-500">
        {slice.map((_, i) => (
          <div key={i} className="flex-1 text-center">{(offset + i) % 2 === 0 ? label(offset + i) : ''}</div>
        ))}
      </div>
    </div>
  );
}

/** `path`: endpoint de estadisticas (admin: /admin/stats; super admin: /super/stats/<id|all>). */
export default function StatsPanel({ path = '/admin/stats' }: { path?: string }) {
  const [range, setRange] = useState<Range>('today');
  const [day, setDay] = useState('');
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let dead = false;
    const load = () =>
      api('GET', `${path}?range=${range}&tz=${new Date().getTimezoneOffset()}${range === 'day' ? `&day=${day}` : ''}`)
        .then((d) => !dead && (setS(d), setError('')))
        .catch((e) => !dead && setError(e.message));
    setS(null);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60_000); // se refresca solo mientras el dueno mira el tablero (el servidor guarda el resumen 45 s)
    return () => { dead = true; clearInterval(t); };
  }, [range, path, day]);

  const p = s?.participation, m = s?.music, o = s?.operations, sat = s?.satisfaction;
  const change = s?.comparison?.changePct;
  const vs = range === 'today' || range === 'yesterday' || range === 'day' ? 'mismo día de la semana pasada' : 'periodo anterior';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {RANGES.map(([k, label]) => (
          <button key={k} onClick={() => { setRange(k); setDay(''); }} className="rounded-full border px-4 py-1.5 text-sm font-semibold"
            style={range === k ? { background: ACCENT, borderColor: ACCENT, color: '#04202a' } : { borderColor: 'rgba(255,255,255,.15)', color: '#cbd5e1' }}>
            {label}
          </button>
        ))}
        <label className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold" style={range === 'day' ? { background: ACCENT, borderColor: ACCENT, color: '#04202a' } : { borderColor: 'rgba(255,255,255,.15)', color: '#cbd5e1' }}>
          <span>Fecha</span>
          <input type="date" value={day} max={ymd(new Date())} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setRange('day'); } }} aria-label="Elegir fecha" className="bg-transparent outline-none [color-scheme:dark]" />
        </label>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!s ? (
        <Empty>Cargando estadísticas…</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi label="Solicitudes" value={String(p.requests)} sub={change === null ? `Sin datos del ${vs}` : `${change > 0 ? '+' : ''}${change}% vs. ${vs}`} tone={change === null ? undefined : change >= 0 ? 'up' : 'down'} />
            <Kpi label="Mesas participantes" value={String(p.tablesParticipating)} sub={`de ${p.tablesTotal} mesas`} />
            <Kpi label="Conversión QR" value={pctText(p.tableConversionPct)} sub={p.scannedTables ? `${p.scannedTables} mesas escanearon` : 'Sin escaneos aún'} />
            <Kpi label="Espera promedio" value={secs(o.avgWaitSeconds)} sub="Desde aprobación hasta sonar" />
            <Kpi label="Finalización" value={pctText(m.completionPct)} sub={`${m.completed} de ${m.played} reproducidas`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Card title="Solicitudes por hora">
              <HourChart data={o.requestsPerHour} />
            </Card>
            <Card title="Embudo de canciones">
              <BarList
                empty="Sin datos"
                items={[
                  { label: 'Solicitadas', n: m.requested },
                  { label: 'Aprobadas', n: m.approved },
                  { label: 'Reproducidas', n: m.played },
                  { label: 'Completadas', n: m.completed },
                  { label: 'Saltadas', n: m.skipped },
                  { label: 'Con error', n: m.failed },
                  { label: 'Rechazadas', n: m.rejected },
                ]}
              />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Canciones más pedidas"><BarList empty="Aún no hay canciones." items={m.topSongs.map((x: any) => ({ label: x.label, n: x.n }))} /></Card>
            <Card title="Artistas más pedidos">
              <BarList empty="Aún no hay artistas." items={m.topArtists.map((x: any) => ({ label: x.label, n: x.n }))} />
              <p className="mt-3 text-xs text-slate-500">El artista se deduce del título del video, así que es aproximado.</p>
            </Card>
            <Card title="Lo que más buscan"><BarList empty="Aún no hay búsquedas." items={m.topSearches.map((x: any) => ({ label: x.label, n: x.n }))} /></Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Participación">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Escaneos del QR', String(p.qrScans)],
                  ['Solicitudes por mesa', p.requestsPerTable ?? '—'],
                  ['Navegadores que pidieron', pctText(p.browserConversionPct)],
                  ['Tiempo hasta la 1.ª solicitud', secs(p.avgSecondsToFirstRequest)],
                  ['Navegadores recurrentes', `${p.recurringBrowsers} de ${p.totalBrowsers}`],
                  ['Búsquedas realizadas', String(m.searches)],
                ].map(([k, v]) => (
                  <div key={k as string}><dt className="text-slate-400">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-slate-500">Sin cuentas no se sabe cuántas personas hay en una mesa: se miden mesas y navegadores, no personas.</p>
            </Card>
            <Card title="Operación">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Tiempo de aprobación (manual)', secs(o.avgApprovalSeconds)],
                  ['Sesiones de karaoke', String(o.sessions)],
                  ['Duración promedio', o.avgSessionMinutes === null ? '—' : `${o.avgSessionMinutes} min`],
                  ['Valoración', sat.avgRating === null ? 'Sin respuestas' : `${sat.avgRating} / 5 (${sat.responses})`],
                ].map(([k, v]) => (
                  <div key={k as string}><dt className="text-slate-400">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
                ))}
              </dl>
              {o.rejectionReasons.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">Motivos de rechazo</div>
                  <BarList empty="" items={o.rejectionReasons.map((x: any) => ({ label: x.label, n: x.n }))} />
                </div>
              )}
              {sat.comments.length > 0 && (
                <div className="mt-4 space-y-1 text-sm text-slate-300">
                  <div className="text-xs uppercase tracking-wider text-slate-400">Comentarios recientes</div>
                  {sat.comments.map((c: string, i: number) => <div key={i}>“{c}”</div>)}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
