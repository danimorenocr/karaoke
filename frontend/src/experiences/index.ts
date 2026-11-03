import { ComponentType, lazy } from 'react';
import type { ExperienceProps } from '../core/useKaraoke';

/**
 * Catalogo de experiencias. Cada mesa tiene asignado un `id` (Table.experienceId en la BD).
 * Para agregar una: crear la carpeta en experiences/, registrarla aqui y en backend/src/experiences.ts.
 * Se cargan de forma diferida: el cliente solo descarga el diseno de su mesa.
 */
export interface ExperienceMeta {
  id: string;
  name: string;
  description: string;
  swatch: [string, string]; // colores para la miniatura del panel
}

export const EXPERIENCES: ExperienceMeta[] = [
  { id: 'classic', name: 'Clásica', description: 'Conversación minimalista con la identidad de Tono: noche y lavanda.', swatch: ['#05060a', '#a9b8ff'] },
  { id: 'golden-vinyl', name: 'Golden Vinyl', description: 'Tocadiscos de vinilo dorado, cálido y elegante.', swatch: ['#1a1208', '#e0b04a'] },
  { id: 'neon-world', name: 'Neon World', description: 'Futurista: neón sobre fondo oscuro.', swatch: ['#07071a', '#22d3ee'] },
  { id: 'latin-collage', name: 'Latin Collage', description: 'Collage latino de papel y pintura: turquesa, naranja y crema.', swatch: ['#1f4e5f', '#d9582b'] },
  { id: 'harry-potter', name: 'Harry Potter', description: 'Pergamino, castillo y lechuza: sepia, dorado y granate.', swatch: ['#2b1a0d', '#d9a441'] },
  { id: 'editorial', name: 'Editorial', description: 'Tipografía de revista, papel y tinta.', swatch: ['#f4efe6', '#c8321e'] },
];

const loaders: Record<string, () => Promise<{ default: ComponentType<ExperienceProps> }>> = {
  classic: () => import('./classic'),
  'golden-vinyl': () => import('./golden-vinyl'),
  'neon-world': () => import('./neon-world'),
  'latin-collage': () => import('./latin-collage'),
  'harry-potter': () => import('./harry-potter'),
  editorial: () => import('./editorial'),
};

const cache: Record<string, ComponentType<ExperienceProps>> = {};

/** Devuelve el componente de la experiencia (si el id es desconocido, usa la clasica). */
export function getExperience(id?: string): ComponentType<ExperienceProps> {
  const key = id && loaders[id] ? id : 'classic';
  return (cache[key] ??= lazy(loaders[key]));
}
