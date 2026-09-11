import type { Board } from "../core/board.ts";
import { buildMasks, digitsOf, place, unplace, type ConstraintMasks } from "./candidates.ts";
import { selectCell } from "./solve.ts";

/**
 * Counts solutions, stopping the moment `maxSolutions` is reached.
 *
 * The carver calls this once per removal attempt and only ever asks
 * "is it still exactly 1?", so bailing at 2 turns a potentially enormous
 * search into a near-immediate answer on ambiguous grids.
 *
 * Returns 0 (unsolvable), 1 (unique), or `maxSolutions` (at least that many).
 */
export function countSolutions(board: Board, maxSolutions = 2): number {
  const working = board.slice();
  const masks = buildMasks(working);
  return count(working, masks, maxSolutions);
}

function count(board: Board, masks: ConstraintMasks, remaining: number): number {
  const cell = selectCell(board, masks);
  if (cell.index === -1) return 1;
  if (cell.candidates === 0) return 0;

  let found = 0;
  for (const digit of digitsOf(cell.candidates)) {
    board[cell.index] = digit;
    place(masks, cell.index, digit);

    found += count(board, masks, remaining - found);

    board[cell.index] = 0;
    unplace(masks, cell.index, digit);

    if (found >= remaining) break;
  }
  return found;
}

export function hasUniqueSolution(board: Board): boolean {
  return countSolutions(board, 2) === 1;
}
