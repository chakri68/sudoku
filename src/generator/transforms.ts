import { createEmptyBoard, indexOf, type Board } from "../core/board.ts";
import type { RNG } from "./rng.ts";

/**
 * Every transform here maps a valid grid to a valid grid, so the output never
 * needs re-validating. Applying all of them gives 9! * 6^8 * 2 ~= 1.2e12
 * distinct grids, which is plenty for one puzzle a day forever.
 *
 * The ORDER these run in is part of the determinism contract. Reordering them
 * changes every historical puzzle even though each step is individually
 * harmless, so treat the sequence in generateSolvedBoard as frozen.
 */

/** Relabel digits: 1..9 -> some permutation of 1..9. */
export function permuteDigits(board: Board, rng: RNG): Board {
  const mapping = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const out = createEmptyBoard();
  for (let i = 0; i < 81; i++) out[i] = mapping[board[i] - 1];
  return out;
}

/** Reorder the three horizontal bands (row groups 0-2, 3-5, 6-8). */
export function shuffleBands(board: Board, rng: RNG): Board {
  return permuteRows(board, expandGroups(rng.shuffle([0, 1, 2]), identityTriples()));
}

/** Reorder rows inside each band, independently. */
export function shuffleRowsWithinBands(board: Board, rng: RNG): Board {
  const order: number[] = [];
  for (let band = 0; band < 3; band++) {
    for (const row of rng.shuffle([0, 1, 2])) order.push(band * 3 + row);
  }
  return permuteRows(board, order);
}

/** Reorder the three vertical stacks (column groups 0-2, 3-5, 6-8). */
export function shuffleStacks(board: Board, rng: RNG): Board {
  return permuteCols(board, expandGroups(rng.shuffle([0, 1, 2]), identityTriples()));
}

/** Reorder columns inside each stack, independently. */
export function shuffleColumnsWithinStacks(board: Board, rng: RNG): Board {
  const order: number[] = [];
  for (let stack = 0; stack < 3; stack++) {
    for (const col of rng.shuffle([0, 1, 2])) order.push(stack * 3 + col);
  }
  return permuteCols(board, order);
}

/** Mirror across the main diagonal. Rows become columns. */
export function transpose(board: Board): Board {
  const out = createEmptyBoard();
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      out[indexOf(col, row)] = board[indexOf(row, col)];
    }
  }
  return out;
}

/** `order[newRow] = oldRow` */
export function permuteRows(board: Board, order: readonly number[]): Board {
  const out = createEmptyBoard();
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      out[indexOf(row, col)] = board[indexOf(order[row], col)];
    }
  }
  return out;
}

/** `order[newCol] = oldCol` */
export function permuteCols(board: Board, order: readonly number[]): Board {
  const out = createEmptyBoard();
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      out[indexOf(row, col)] = board[indexOf(row, order[col])];
    }
  }
  return out;
}

function identityTriples(): number[][] {
  return [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
  ];
}

function expandGroups(groupOrder: readonly number[], groups: readonly number[][]): number[] {
  const out: number[] = [];
  for (const group of groupOrder) out.push(...groups[group]);
  return out;
}
