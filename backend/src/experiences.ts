/** Catalogo de experiencias (disenos) que puede mostrar una mesa. Debe coincidir con frontend/src/experiences. */
export const EXPERIENCE_IDS = ['classic', 'golden-vinyl', 'neon-world', 'latin-collage', 'editorial'] as const;
export type ExperienceId = (typeof EXPERIENCE_IDS)[number];
export const DEFAULT_EXPERIENCE: ExperienceId = 'classic';

/** Disenos que un establecimiento puede usar (lista vacia = todos). "classic" siempre esta disponible. */
export function allowedExperiences(list: string[] | null | undefined): string[] {
  if (!list || list.length === 0) return [...EXPERIENCE_IDS];
  return EXPERIENCE_IDS.filter((id) => id === DEFAULT_EXPERIENCE || list.includes(id));
}
