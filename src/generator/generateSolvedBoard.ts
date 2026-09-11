import type { Board } from "../core/board.ts";
import { createCanonicalBoard } from "./canonical.ts";
import { createRng, type RNG } from "./rng.ts";
import {
  permuteDigits,
  shuffleBands,
  shuffleColumnsWithinStacks,
  shuffleRowsWithinBands,
  shuffleStacks,
  transpose,
} from "./transforms.ts";

/**
 * Spec offers randomized backtracking or canonical-plus-transforms. This is
 * the latter: it cannot fail, cannot backtrack, and runs in microseconds,
 * which matters because the carver below it will be called dozens of times.
 *
 * The transform sequence is frozen. See transforms.ts.
 */
export function generateSolvedBoard(seed: number): Board {
  const rng: RNG = createRng(seed);

  let board = createCanonicalBoard();
  board = permuteDigits(board, rng);
  board = shuffleBands(board, rng);
  board = shuffleRowsWithinBands(board, rng);
  board = shuffleStacks(board, rng);
  board = shuffleColumnsWithinStacks(board, rng);
  if (rng.next() < 0.5) board = transpose(board);

  return board;
}
