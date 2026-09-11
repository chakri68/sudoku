import { type Board } from "../core/board.ts";
import {
  buildMasks,
  candidatesAt,
  digitsOf,
  place,
  popcount,
  unplace,
  type ConstraintMasks,
} from "./candidates.ts";

export interface SolveStats {
  /** Cells assigned during search, including ones later undone. */
  nodes: number;
  /** Deepest point in the recursion. */
  maxDepth: number;
  /** Assignments made where more than one digit was legal. */
  guesses: number;
}

export interface SolveResult {
  solution: Board | null;
  stats: SolveStats;
}

/**
 * Backtracking search that always expands the most constrained empty cell
 * first. MRV is what makes this fast enough to run inside the carving loop:
 * without it, counting solutions on a sparse grid explodes.
 */
export function solve(board: Board): SolveResult {
  const working = board.slice();
  const masks = buildMasks(working);
  const stats: SolveStats = { nodes: 0, maxDepth: 0, guesses: 0 };

  const solved = search(working, masks, stats, 0);
  return { solution: solved ? working : null, stats };
}

function search(
  board: Board,
  masks: ConstraintMasks,
  stats: SolveStats,
  depth: number,
): boolean {
  if (depth > stats.maxDepth) stats.maxDepth = depth;

  const cell = selectCell(board, masks);
  if (cell.index === -1) return true; // nothing empty: solved
  if (cell.candidates === 0) return false; // empty cell with no options: dead

  const options = digitsOf(cell.candidates);
  if (options.length > 1) stats.guesses++;

  for (const digit of options) {
    board[cell.index] = digit;
    place(masks, cell.index, digit);
    stats.nodes++;

    if (search(board, masks, stats, depth + 1)) return true;

    board[cell.index] = 0;
    unplace(masks, cell.index, digit);
  }
  return false;
}

/** Empty cell with the fewest legal digits; short-circuits on a forced cell. */
export function selectCell(
  board: Board,
  masks: ConstraintMasks,
): { index: number; candidates: number } {
  let bestIndex = -1;
  let bestCandidates = 0;
  let bestCount = 10;

  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) continue;
    const candidates = candidatesAt(masks, i);
    const count = popcount(candidates);
    if (count < bestCount) {
      bestIndex = i;
      bestCandidates = candidates;
      bestCount = count;
      if (count <= 1) break;
    }
  }
  return { index: bestIndex, candidates: bestCandidates };
}
