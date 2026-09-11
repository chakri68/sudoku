/**
 * Mulberry32. Chosen over anything fancier because it is 5 lines of integer
 * arithmetic, so every engine on every platform produces the identical stream
 * from the identical seed. `Math.imul` keeps the multiplies in 32-bit space
 * instead of drifting into float64, which is the usual way a "deterministic"
 * PRNG quietly stops being deterministic.
 *
 * Never mix this with Math.random(). The whole app depends on it.
 */
export interface RNG {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Raw 32-bit state output. */
  nextUint32(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Fisher-Yates on a copy; the input is never mutated. */
  shuffle<T>(items: readonly T[]): T[];
  /** Index into `weights`, chosen proportionally. */
  weighted(weights: readonly number[]): number;
}

export function createRng(seed: number): RNG {
  let state = seed >>> 0;

  function nextUint32(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  function next(): number {
    return nextUint32() / 4294967296;
  }

  function int(maxExclusive: number): number {
    if (maxExclusive <= 0) throw new Error("int() needs a positive bound");
    // Rejection sampling: modulo alone would bias the low values, and while
    // the bias is tiny for our bounds it is free to remove and keeps the
    // stream reproducible under any future bound.
    const limit = 4294967296 - (4294967296 % maxExclusive);
    let value = nextUint32();
    while (value >= limit) value = nextUint32();
    return value % maxExclusive;
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) throw new Error("weighted() needs a positive total");
    // Integer draw keeps the choice off the float path entirely.
    const target = int(total);
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (target < acc) return i;
    }
    return weights.length - 1;
  }

  return { next, nextUint32, int, shuffle, weighted };
}
