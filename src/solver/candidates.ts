import { boxOf, colOf, rowOf, type Board } from "../core/board.ts";

/**
 * Candidate sets are 9-bit masks, bit (d-1) for digit d. Every constraint
 * check in the solver reduces to one AND, so the inner loop stays branch-light.
 */
export const ALL_DIGITS = 0b111111111;

export function bitOf(digit: number): number {
  return 1 << (digit - 1);
}

export function digitOf(bit: number): number {
  return 32 - Math.clz32(bit);
}

export function popcount(mask: number): number {
  let m = mask - ((mask >> 1) & 0x55555555);
  m = (m & 0x33333333) + ((m >> 2) & 0x33333333);
  m = (m + (m >> 4)) & 0x0f0f0f0f;
  return (m * 0x01010101) >> 24;
}

export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bitOf(d)) out.push(d);
  return out;
}

/** Occupancy masks for the 9 rows, 9 columns and 9 boxes of a board. */
export interface ConstraintMasks {
  rows: Int16Array;
  cols: Int16Array;
  boxes: Int16Array;
}

export function buildMasks(board: Board): ConstraintMasks {
  const masks: ConstraintMasks = {
    rows: new Int16Array(9),
    cols: new Int16Array(9),
    boxes: new Int16Array(9),
  };
  for (let i = 0; i < 81; i++) {
    const value = board[i];
    if (value === 0) continue;
    const bit = bitOf(value);
    masks.rows[rowOf(i)] |= bit;
    masks.cols[colOf(i)] |= bit;
    masks.boxes[boxOf(i)] |= bit;
  }
  return masks;
}

/** Digits still legal at `index` given current occupancy. */
export function candidatesAt(masks: ConstraintMasks, index: number): number {
  return (
    ALL_DIGITS &
    ~(masks.rows[rowOf(index)] | masks.cols[colOf(index)] | masks.boxes[boxOf(index)])
  );
}

export function place(masks: ConstraintMasks, index: number, digit: number): void {
  const bit = bitOf(digit);
  masks.rows[rowOf(index)] |= bit;
  masks.cols[colOf(index)] |= bit;
  masks.boxes[boxOf(index)] |= bit;
}

export function unplace(masks: ConstraintMasks, index: number, digit: number): void {
  const bit = ~bitOf(digit);
  masks.rows[rowOf(index)] &= bit;
  masks.cols[colOf(index)] &= bit;
  masks.boxes[boxOf(index)] &= bit;
}

/** True if the board has no cell that is empty with zero legal digits. */
export function hasDeadCell(board: Board, masks: ConstraintMasks): boolean {
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0 && candidatesAt(masks, i) === 0) return true;
  }
  return false;
}
