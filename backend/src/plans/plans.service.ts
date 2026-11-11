import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Funcionalidades que el super admin puede encender/apagar por plan. */
export const FEATURES = [
  { id: 'stats', label: 'Estadísticas', hint: 'Dashboard con métricas de las noches' },
  { id: 'history', label: 'Historial de canciones', hint: 'Pestaña Historial del administrador' },
  { id: 'staff', label: 'Cuentas de DJ', hint: 'Crear y gestionar DJs del equipo' },
  { id: 'branding', label: 'Logo y color del local', hint: 'Identidad visual en la app de las mesas y la TV' },
  { id: 'tvBanner', label: 'Banner de la TV', hint: 'Imagen y pausa entre canciones en la pantalla' },
  { id: 'designs', label: 'Diseños por mesa', hint: 'Elegir un diseño distinto al clásico para cada mesa' },
  { id: 'autoApprove', label: 'Aprobación automática', hint: 'Las canciones entran a la cola sin que el DJ las apruebe' },
  { id: 'searchAny', label: 'Buscar cualquier música', hint: 'Además del modo solo karaoke' },
  { id: 'voting', label: 'Modo competencia (votación)', hint: 'Cada actuación la califica el público desde el celular y el puntaje sale en vivo en la TV' },
  { id: 'autoDj', label: 'Auto-DJ', hint: 'Cola automática por géneros cuando no hay pedidos' },
] as const;
export type FeatureId = (typeof FEATURES)[number]['id'];
export const FEATURE_IDS: string[] = FEATURES.map((f) => f.id);

const TTL = 10_000;

@Injectable()
export class PlansService {
  private cache = new Map<string, { at: number; set: Set<string> }>();
  constructor(private prisma: PrismaService) {}

  /** Funcionalidades activas de un establecimiento. Sin plan (o plan inexistente) = todas. */
  async of(businessId: string): Promise<Set<string>> {
    const hit = this.cache.get(businessId);
    if (hit && Date.now() - hit.at < TTL) return hit.set;
    const b = await this.prisma.business.findUnique({ where: { id: businessId }, select: { plan: true } });
    const plan = b?.plan ? await this.prisma.plan.findUnique({ where: { id: b.plan }, select: { perks: true } }) : null;
    const set = new Set<string>(plan ? plan.perks : FEATURE_IDS);
    this.cache.set(businessId, { at: Date.now(), set });
    return set;
  }

  async has(businessId: string, f: FeatureId) {
    return (await this.of(businessId)).has(f);
  }

  async require(businessId: string, f: FeatureId) {
    if (!(await this.has(businessId, f))) {
      const label = FEATURES.find((x) => x.id === f)!.label;
      throw new ForbiddenException(`Tu plan no incluye: ${label}`);
    }
  }

  invalidate() {
    this.cache.clear();
  }
}

@Global()
@Module({ providers: [PlansService], exports: [PlansService] })
export class PlansModule {}
