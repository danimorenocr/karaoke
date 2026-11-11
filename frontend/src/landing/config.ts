/** Datos comerciales de la landing y del pago del registro. */
export const WHATSAPP = '573189413881';
export const waLink = (text: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
export const WA_CONTACT = waLink('Hola, quiero contactarme para Tono karaoke.');

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type PlanId = string;
export interface Plan { id: PlanId; name: string; price: number; desc: string; features: string[]; badge?: string | null; highlight?: boolean; active?: boolean; sortOrder?: number }
/** Valores por defecto mientras carga (o si falla) la lista real que edita el super admin. */
const DEFAULT_PLANS: Plan[] = [
  { id: 'STANDARD', name: 'Estándar', price: 39900, desc: 'Todo Tono para un local.', features: ['QR por mesa', 'Cola con turnos y cupo', 'Pantalla y panel del DJ', 'Estadísticas'] },
  { id: 'CUSTOM', name: 'Diseño personalizado', price: 49900, desc: 'Todo lo estándar, con la apariencia de tu local.', features: ['Todo lo del plan Estándar', 'Apariencia con la identidad de tu local'], badge: 'A la medida', highlight: true },
];
let cache: Plan[] | null = null;
export function usePlans(): Plan[] {
  const [plans, setPlans] = useState<Plan[]>(cache ?? DEFAULT_PLANS);
  useEffect(() => {
    api<Plan[]>('GET', '/auth/plans', undefined, false).then((p) => { if (p.length) { cache = p; setPlans(p); } }).catch(() => {});
  }, []);
  return plans;
}
export const cop = (n: number) => '$' + n.toLocaleString('es-CO');

/**
 * Medios de pago de la pantalla de pago. COMPLETA "value" con tu numero, llave o cuenta de cada uno
 * (si queda vacio se muestra "pidelo por WhatsApp").
 */
export const PAY_METHODS: { name: string; value: string }[] = [
  { name: 'Bre-B', value: '@gmc971' },
  { name: 'Nequi', value: '3112976229' },
];

/** Titular de las cuentas de pago (se muestra enmascarado en la pantalla de pago). */
export const PAY_HOLDER = 'Gis*** Dan*** Mor** Cruz ** - Gis** Mor**';
