import { countClues, serializeBoard, type Board } from "../core/board.ts";
import { carvePuzzle } from "./carvePuzzle.ts";
import { normalizeDate } from "./date.ts";
import {
  bandDistance,
  clueFloorForAttempt,
  classifyScore,
  matchesTargetDifficulty,
  measureDifficulty,
  selectTargetDifficulty,
} from "./difficulty.ts";
import { generateSolvedBoard } from "./generateSolvedBoard.ts";
import { deriveSeed, shortHash } from "./hash.ts";
import { createRng } from "./rng.ts";
import type { Difficulty, DifficultyMetrics, SudokuPuzzle } from "./types.ts";
import { GENERATOR_VERSION } from "./version.ts";

export const MAX_ATTEMPTS = 64;

export interface GenerateOptions {
  version?: number;
  maxAttempts?: number;
  /** Force a band instead of taking the one the date picked. Dev/CLI only. */
  targetDifficulty?: Difficulty;
}

interface Candidate {
  puzzle: Board;
  solution: Board;
  metrics: DifficultyMetrics;
  attempt: number;
  boardSeed: number;
  removalSeed: number;
}

/**
 * The whole app in one function: a date goes in, the same puzzle always
 * comes out.
 *
 * Not every board-plus-removal-order lands in the difficulty the date asked
 * for, so we retry. The retries are themselves seeded by attempt number, so
 * "attempt 7 worked" is a fact about the date, not about when you ran it.
 */
export async function generateDailyPuzzle(
  dateInput: Date | string,
  options: GenerateOptions = {},
): Promise<SudokuPuzzle> {
  const startedAt = Date.now();

  const date = normalizeDate(dateInput);
  const version = options.version ?? GENERATOR_VERSION;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;

  const difficultySeed = await deriveSeed(date, "difficulty", version);
  const target = options.targetDifficulty ?? selectTargetDifficulty(difficultySeed);

  let best: Candidate | null = null;
  let bestDistance = Infinity;
  let matched = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const boardSeed = await deriveSeed(date, "board", version, attempt);
    const removalSeed = await deriveSeed(date, "removal", version, attempt);

    const solution = generateSolvedBoard(boardSeed);
    const clueFloor = clueFloorForAttempt(target, attempt, difficultySeed);
    const puzzle = carvePuzzle(solution, createRng(removalSeed), clueFloor);
    const metrics = measureDifficulty(puzzle);

    const candidate: Candidate = { puzzle, solution, metrics, attempt, boardSeed, removalSeed };

    if (matchesTargetDifficulty(metrics, target)) {
      best = candidate;
      matched = true;
      break;
    }

    const distance = bandDistance(metrics.score, target);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  if (!best) throw new Error(`Generation produced no candidate for ${date}`);

  // If nothing hit the target band, the puzzle is still valid and unique --
  // it just gets labelled with the band it actually landed in rather than
  // lying about its difficulty.
  const difficulty = matched ? target : classifyScore(best.metrics.score);

  return {
    id: `v${version}-${date}`,
    date,
    version,
    difficulty,
    puzzle: best.puzzle,
    solution: best.solution,
    clues: countClues(best.puzzle),
    attempt: best.attempt,
    fallback: !matched,
    seeds: {
      difficulty: difficultySeed,
      board: best.boardSeed,
      removal: best.removalSeed,
    },
    metrics: best.metrics,
    generationMs: Date.now() - startedAt,
    fingerprint: await shortHash(serializeBoard(best.puzzle)),
  };
}
