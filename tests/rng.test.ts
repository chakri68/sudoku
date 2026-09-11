import { describe, expect, it } from "vitest";
import { createRng } from "../src/generator/rng.ts";

/**
 * Golden values. If these move, the PRNG stream moved, and every puzzle in
 * history moved with it. That is only ever allowed alongside a
 * GENERATOR_VERSION bump.
 */
describe("mulberry32 stability", () => {
  it("produces the recorded float stream", () => {
    const rng = createRng(123456);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([
      0.38233304349705577, 0.7972629074938595, 0.9965302373748273,
    ]);
  });

  it("produces the recorded uint32 stream", () => {
    const rng = createRng(123456);
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toEqual([
      1642107918, 3424218114, 4280064779,
    ]);
  });

  it("produces the recorded bounded integers", () => {
    const rng = createRng(1);
    const values = Array.from({ length: 12 }, () => rng.int(9));
    expect(values).toEqual([7, 0, 8, 8, 6, 8, 0, 4, 4, 8, 6, 8]);
  });

  it("produces the recorded shuffle", () => {
    const rng = createRng(42);
    expect(rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([7, 8, 2, 5, 4, 6, 9, 3, 1]);
  });
});

describe("rng behaviour", () => {
  it("is a pure function of the seed", () => {
    const a = createRng(999);
    const b = createRng(999);
    for (let i = 0; i < 200; i++) expect(a.next()).toBe(b.next());
  });

  it("diverges between seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("keeps next() inside [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("keeps int() inside the bound and hits every value", () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const value = rng.int(9);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(9);
      seen.add(value);
    }
    expect(seen.size).toBe(9);
  });

  it("rejects a non-positive bound", () => {
    expect(() => createRng(1).int(0)).toThrow();
  });

  it("does not mutate the input of shuffle", () => {
    const input = Object.freeze([1, 2, 3, 4, 5]);
    const out = createRng(3).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("respects weights", () => {
    const rng = createRng(11);
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[rng.weighted([1, 0, 3])]++;

    expect(counts[1]).toBe(0);
    const ratio = counts[2] / counts[0];
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.5);
  });
});
