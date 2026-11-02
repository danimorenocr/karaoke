/** Catalogo de experiencias (disenos) que puede mostrar una mesa. Debe coincidir con frontend/src/experiences. */
export const EXPERIENCE_IDS = ['classic', 'golden-vinyl', 'neon-world', 'latin-collage', 'editorial'] as const;
export type ExperienceId = (typeof EXPERIENCE_IDS)[number];
export const DEFAULT_EXPERIENCE: ExperienceId = 'classic';
