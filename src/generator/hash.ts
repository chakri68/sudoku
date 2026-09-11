import { GENERATOR_VERSION, VARIANT } from "./version.ts";

/**
 * Seeds come from SHA-256 of a namespaced string. The namespace matters:
 * changing how difficulty is chosen must not disturb the board, so each
 * subsystem hashes its own domain string.
 *
 *   sudoku:v1:classic:2026-09-11:board:0
 *   sudoku:v1:classic:2026-09-11:removal:0
 *   sudoku:v1:classic:2026-09-11:difficulty
 *
 * This shape is a permanent contract. Extending it (new purposes, new
 * variants) is fine; reordering or renaming the existing fields is not.
 */
export type SeedPurpose = "board" | "removal" | "difficulty" | "theme";

export function seedString(
  date: string,
  purpose: SeedPurpose,
  version: number = GENERATOR_VERSION,
  attempt?: number,
  variant: string = VARIANT,
): string {
  const base = `sudoku:v${version}:${variant}:${date}:${purpose}`;
  return attempt === undefined ? base : `${base}:${attempt}`;
}

const encoder = new TextEncoder();

export async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return new Uint8Array(digest);
}

/** First four digest bytes, big-endian, as an unsigned 32-bit integer. */
export function bytesToUint32(bytes: Uint8Array, offset = 0): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

export async function deriveSeed(
  date: string,
  purpose: SeedPurpose,
  version: number = GENERATOR_VERSION,
  attempt?: number,
): Promise<number> {
  const digest = await sha256(seedString(date, purpose, version, attempt));
  return bytesToUint32(digest);
}

export function toHex(bytes: Uint8Array, length = bytes.length): string {
  let out = "";
  for (let i = 0; i < length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/** Short stable fingerprint for a puzzle id, e.g. `a94f2c`. */
export async function shortHash(input: string, bytes = 3): Promise<string> {
  return toHex(await sha256(input), bytes);
}
