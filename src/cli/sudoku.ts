/**
 * Developer CLI. Runs the generator outside the browser so determinism and
 * difficulty tuning can be checked without a UI in the way.
 *
 *   npm run sudoku -- 2026-09-11
 *   npm run sudoku -- --range 2026-01-01 90
 *   npm run sudoku -- --tune 500
 *   npm run sudoku -- --fixtures
 */
import { formatBoard, serializeBoard } from "../core/board.ts";
import { addDays, formatLongDate, getTodayDateString, isValidDateString } from "../generator/date.ts";
import { classifyScore, difficultyLabel } from "../generator/difficulty.ts";
import { generateDailyPuzzle } from "../generator/generateDailyPuzzle.ts";
import { seedString } from "../generator/hash.ts";
import { DIFFICULTIES, type Difficulty } from "../generator/types.ts";
import { GENERATOR_VERSION } from "../generator/version.ts";
import { verifyUniqueness } from "../generator/carvePuzzle.ts";
import { isSolved } from "../core/board.ts";

const args = process.argv.slice(2);

async function main(): Promise<void> {
  const command = args[0] ?? getTodayDateString();

  if (command === "--help" || command === "-h") return printHelp();
  if (command === "--range") return printRange(args[1], Number(args[2] ?? 30));
  if (command === "--tune") return tune(Number(args[1] ?? 300));
  if (command === "--fixtures") return printFixtures();
  return printOne(command);
}

function printHelp(): void {
  console.log(`
daily sudoku - generator CLI

  sudoku <date>              print the puzzle for a date (default: today)
  sudoku --range <date> <n>  summarise n consecutive days
  sudoku --tune <n>          difficulty distribution over n sampled dates
  sudoku --fixtures          emit golden fixtures as JSON
`.trim());
}

async function printOne(date: string): Promise<void> {
  if (!isValidDateString(date)) {
    console.error(`Not a date: ${date}  (expected YYYY-MM-DD)`);
    process.exitCode = 1;
    return;
  }

  const puzzle = await generateDailyPuzzle(date);
  const m = puzzle.metrics;

  console.log(`
Date:        ${puzzle.date}  (${formatLongDate(puzzle.date)})
Version:     ${puzzle.version}
Id:          ${puzzle.id}
Fingerprint: ${puzzle.fingerprint}
Difficulty:  ${difficultyLabel(puzzle.difficulty)}${puzzle.fallback ? "  (fallback)" : ""}
Clues:       ${puzzle.clues}
Score:       ${m.score}
Technique:   ${m.hardestTechnique ?? "none"}${m.solvedLogically ? "" : "  (needs guessing)"}
Attempt:     ${puzzle.attempt}
Generated:   ${puzzle.generationMs} ms

${formatBoard(puzzle.puzzle)}

Solution
${formatBoard(puzzle.solution)}

Seeds
  ${seedString(date, "difficulty")}  -> ${puzzle.seeds.difficulty}
  ${seedString(date, "board", GENERATOR_VERSION, puzzle.attempt)}  -> ${puzzle.seeds.board}
  ${seedString(date, "removal", GENERATOR_VERSION, puzzle.attempt)}  -> ${puzzle.seeds.removal}

Checks
  unique solution    ${verifyUniqueness(puzzle.puzzle) ? "yes" : "NO"}
  solution valid     ${isSolved(puzzle.solution) ? "yes" : "NO"}
  puzzle string      ${serializeBoard(puzzle.puzzle)}
`.trimStart());
}

async function printRange(start: string | undefined, days: number): Promise<void> {
  const from = start && isValidDateString(start) ? start : getTodayDateString();
  console.log("date        diff     clues  score   attempt  ms   technique");

  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const p = await generateDailyPuzzle(date);
    console.log(
      [
        date,
        p.difficulty.padEnd(8),
        String(p.clues).padStart(5),
        p.metrics.score.toFixed(1).padStart(7),
        String(p.attempt).padStart(8),
        String(p.generationMs).padStart(4),
        " " + (p.metrics.hardestTechnique ?? "-"),
      ].join(" "),
    );
  }
}

/** Distribution + timing over a sample. Used to set the score thresholds. */
async function tune(samples: number): Promise<void> {
  const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, expert: 0 };
  const rawCounts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, expert: 0 };
  const clueByDifficulty: Record<Difficulty, number[]> = { easy: [], medium: [], hard: [], expert: [] };
  const scoreByDifficulty: Record<Difficulty, number[]> = { easy: [], medium: [], hard: [], expert: [] };

  let fallbacks = 0;
  let attempts = 0;
  let totalMs = 0;
  let worstMs = 0;
  let notUnique = 0;

  const start = "2024-01-01";
  for (let i = 0; i < samples; i++) {
    // Spread the sample across ~11 years rather than one contiguous month.
    const date = addDays(start, i * 7 + (i % 5));
    const t0 = performance.now();
    const p = await generateDailyPuzzle(date);
    const ms = performance.now() - t0;

    totalMs += ms;
    worstMs = Math.max(worstMs, ms);
    attempts += p.attempt;
    if (p.fallback) fallbacks++;
    if (!verifyUniqueness(p.puzzle)) notUnique++;

    counts[p.difficulty]++;
    rawCounts[classifyScore(p.metrics.score)]++;
    clueByDifficulty[p.difficulty].push(p.clues);
    scoreByDifficulty[p.difficulty].push(p.metrics.score);
  }

  console.log(`samples            ${samples}`);
  console.log(`mean generation    ${(totalMs / samples).toFixed(1)} ms`);
  console.log(`worst generation   ${worstMs.toFixed(1)} ms`);
  console.log(`mean attempts      ${(attempts / samples).toFixed(2)}`);
  console.log(`fallbacks          ${fallbacks} (${((fallbacks / samples) * 100).toFixed(1)}%)`);
  console.log(`non-unique         ${notUnique}`);
  console.log("");
  console.log("difficulty  share   target  clues(min/med/max)  score(min/med/max)");

  const targetShare: Record<Difficulty, number> = { easy: 20, medium: 40, hard: 30, expert: 10 };
  for (const d of DIFFICULTIES) {
    const share = ((counts[d] / samples) * 100).toFixed(1);
    const clues = summarize(clueByDifficulty[d]);
    const scores = summarize(scoreByDifficulty[d], 1);
    console.log(
      `${d.padEnd(11)} ${share.padStart(5)}%  ${String(targetShare[d]).padStart(5)}%  ${clues.padEnd(19)} ${scores}`,
    );
  }
}

function summarize(values: number[], digits = 0): string {
  if (values.length === 0) return "-";
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return `${at(0).toFixed(digits)}/${at(0.5).toFixed(digits)}/${sorted[sorted.length - 1].toFixed(digits)}`;
}

const FIXTURE_DATES = ["2000-01-01", "2004-08-06", "2026-09-11", "2030-12-31"];

async function printFixtures(): Promise<void> {
  const fixtures = [];
  for (const date of FIXTURE_DATES) {
    const p = await generateDailyPuzzle(date);
    fixtures.push({
      date: p.date,
      version: p.version,
      difficulty: p.difficulty,
      clues: p.clues,
      attempt: p.attempt,
      fingerprint: p.fingerprint,
      puzzle: serializeBoard(p.puzzle),
      solution: serializeBoard(p.solution),
    });
  }
  console.log(JSON.stringify(fixtures, null, 2));
}

await main();
