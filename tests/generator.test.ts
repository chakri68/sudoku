import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countClues, isConsistent, isSolved, serializeBoard } from "../src/core/board.ts";
import { addDays } from "../src/generator/date.ts";
import { DIFFICULTY_PROFILES, classifyScore } from "../src/generator/difficulty.ts";
import { generateDailyPuzzle } from "../src/generator/generateDailyPuzzle.ts";
import { deriveSeed, seedString } from "../src/generator/hash.ts";
import { DIFFICULTIES, type Difficulty } from "../src/generator/types.ts";
import { GENERATOR_VERSION } from "../src/generator/version.ts";
import { countSolutions } from "../src/solver/countSolutions.ts";

/**
 * Golden fixtures. A change here means the date -> puzzle mapping moved, so
 * every historical link now points at a different grid. Regenerate these
 * only together with a GENERATOR_VERSION bump.
 */
const FIXTURES = [
  {
    date: "2000-01-01",
    difficulty: "easy",
    clues: 41,
    attempt: 0,
    fingerprint: "a5529d",
    puzzle:
      "409150000007000050518630940002081075700302004840570200094065327080000400000014568",
    solution:
      "429158736367249851518637942932481675756392184841576293194865327685723419273914568",
  },
  {
    date: "2004-08-06",
    difficulty: "easy",
    clues: 36,
    attempt: 0,
    fingerprint: "53a1b4",
    puzzle:
      "000400680086752390090000207005370000009000512000005900501900030034561720027004000",
    solution:
      "752493681186752394493186257215379846379648512648215973561927438834561729927834165",
  },
  {
    date: "2026-09-11",
    difficulty: "expert",
    clues: 25,
    attempt: 1,
    fingerprint: "314dbf",
    puzzle:
      "008000040031700000065310000090600000006401800100008050000065100000000062000000708",
    solution:
      "978526341431789625265314987897652413526431879143978256789265134314897562652143798",
  },
  {
    date: "2030-12-31",
    difficulty: "easy",
    clues: 38,
    attempt: 0,
    fingerprint: "62b889",
    puzzle:
      "800092300520073000007801200980700406040000030703004029068309700000140082074280003",
    solution:
      "816592374529473168437861295982735416641928537753614829268359741395147682174286953",
  },
] as const;

describe("golden puzzles", () => {
  it.each(FIXTURES)("$date is unchanged", async (fixture) => {
    const puzzle = await generateDailyPuzzle(fixture.date);

    expect(serializeBoard(puzzle.puzzle)).toBe(fixture.puzzle);
    expect(serializeBoard(puzzle.solution)).toBe(fixture.solution);
    expect(puzzle.difficulty).toBe(fixture.difficulty);
    expect(puzzle.clues).toBe(fixture.clues);
    expect(puzzle.attempt).toBe(fixture.attempt);
    expect(puzzle.fingerprint).toBe(fixture.fingerprint);
    expect(puzzle.id).toBe(`v${GENERATOR_VERSION}-${fixture.date}`);
  });
});

describe("determinism", () => {
  it("returns an identical puzzle on repeated calls", async () => {
    for (const date of ["2001-02-03", "2026-09-11", "2099-11-30"]) {
      const a = await generateDailyPuzzle(date);
      const b = await generateDailyPuzzle(date);
      expect(serializeBoard(a.puzzle)).toBe(serializeBoard(b.puzzle));
      expect(serializeBoard(a.solution)).toBe(serializeBoard(b.solution));
      expect(a.difficulty).toBe(b.difficulty);
    }
  });

  it("gives different dates different puzzles", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const puzzle = await generateDailyPuzzle(addDays("2026-01-01", i));
      seen.add(serializeBoard(puzzle.puzzle));
    }
    expect(seen.size).toBe(40);
  });

  it("accepts a Date and a string interchangeably", async () => {
    const fromString = await generateDailyPuzzle("2026-09-11");
    const fromDate = await generateDailyPuzzle(new Date(2026, 8, 11, 13, 45));
    expect(serializeBoard(fromDate.puzzle)).toBe(serializeBoard(fromString.puzzle));
  });

  it("keeps seeds stable and domain-separated", async () => {
    expect(seedString("2026-09-11", "board", 1, 0)).toBe(
      "sudoku:v1:classic:2026-09-11:board:0",
    );
    expect(seedString("2026-09-11", "difficulty")).toBe(
      "sudoku:v1:classic:2026-09-11:difficulty",
    );

    const board = await deriveSeed("2026-09-11", "board", 1, 0);
    const removal = await deriveSeed("2026-09-11", "removal", 1, 0);
    expect(board).not.toBe(removal);
    expect(await deriveSeed("2026-09-11", "board", 1, 0)).toBe(board);
  });
});

describe("validity across the calendar", () => {
  // A spread sample rather than every date: enough to catch a systemic
  // break without turning the suite into a batch job.
  const dates: string[] = [];
  for (let i = 0; i < 260; i++) dates.push(addDays("2000-01-01", i * 141));

  it("produces only valid, uniquely solvable puzzles", async () => {
    for (const date of dates) {
      const puzzle = await generateDailyPuzzle(date);

      expect(isSolved(puzzle.solution), `${date}: solution invalid`).toBe(true);
      expect(isConsistent(puzzle.puzzle), `${date}: clues inconsistent`).toBe(true);
      expect(countSolutions(puzzle.puzzle, 2), `${date}: not unique`).toBe(1);

      for (let i = 0; i < 81; i++) {
        if (puzzle.puzzle[i] !== 0) {
          expect(puzzle.puzzle[i], `${date}: clue ${i} contradicts solution`).toBe(
            puzzle.solution[i],
          );
        }
      }

      expect(puzzle.clues).toBe(countClues(puzzle.puzzle));
      expect(puzzle.clues).toBeGreaterThanOrEqual(17);
      expect(puzzle.clues).toBeLessThanOrEqual(50);
      expect(puzzle.date).toBe(date);
      expect(DIFFICULTIES).toContain(puzzle.difficulty);
      expect(classifyScore(puzzle.metrics.score)).toBe(puzzle.difficulty);
    }
  });

  it("hits the labelled difficulty without falling back", async () => {
    const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, expert: 0 };
    let fallbacks = 0;

    for (const date of dates) {
      const puzzle = await generateDailyPuzzle(date);
      counts[puzzle.difficulty]++;
      if (puzzle.fallback) fallbacks++;
    }

    expect(fallbacks).toBe(0);
    for (const difficulty of DIFFICULTIES) {
      const share = (counts[difficulty] / dates.length) * 100;
      const target = DIFFICULTY_PROFILES[difficulty].weight;
      expect(Math.abs(share - target), `${difficulty} share ${share.toFixed(1)}%`).toBeLessThan(10);
    }
  });
});

describe("generator hygiene", () => {
  /** §50.9: nothing under generation may reach for real randomness. */
  it("never uses a non-deterministic source", () => {
    const roots = ["src/generator", "src/solver", "src/core"];
    const banned = [
      "Math.random",
      "performance.now",
      "crypto.getRandomValues",
      "toLocaleString",
      "localeCompare",
    ];

    for (const root of roots) {
      for (const file of walk(root)) {
        const source = stripComments(readFileSync(file, "utf8"));
        for (const token of banned) {
          expect(source.includes(token), `${file} uses ${token}`).toBe(false);
        }
      }
    }
  });

  it("keeps Date.now out of everything except the reported timing field", () => {
    for (const root of ["src/generator", "src/solver", "src/core"]) {
      for (const file of walk(root)) {
        if (file.endsWith("generateDailyPuzzle.ts")) continue;
        const source = stripComments(readFileSync(file, "utf8"));
        expect(source.includes("Date.now"), `${file}`).toBe(false);
      }
    }
  });
});

/** Comments name these APIs to warn against them; only code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}
