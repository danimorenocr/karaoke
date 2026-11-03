/** Datos comerciales de la landing y del pago del registro. */
export const WHATSAPP = '573189413881';
export const waLink = (text: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
export const WA_CONTACT = waLink('Hola, quiero contactarme para Tono karaoke.');

export type PlanId = 'STANDARD' | 'CUSTOM';
export const PLANS: { id: PlanId; name: string; price: number; desc: string }[] = [
  { id: 'STANDARD', name: 'Estándar', price: 39900, desc: 'Todo Tono para un local.' },
  { id: 'CUSTOM', name: 'Diseño personalizado', price: 49900, desc: 'Todo lo estándar, con la apariencia de tu local.' },
];
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
