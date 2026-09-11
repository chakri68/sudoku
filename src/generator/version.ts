/**
 * Bump this ONLY when a change would alter the puzzle produced for a date.
 *
 * The version is baked into every seed string, so bumping it re-rolls every
 * puzzle in history. Old links can pin the old generator with `?v=1`.
 */
export const GENERATOR_VERSION = 1;

/** Reserved for future variants (killer, diagonal, ...). Part of the seed contract. */
export const VARIANT = "classic";

export const SUPPORTED_VERSIONS: readonly number[] = [1];

export function isSupportedVersion(version: number): boolean {
  return SUPPORTED_VERSIONS.includes(version);
}
