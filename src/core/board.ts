/**
 * A Sudoku board is 81 cells in row-major order.
 *
 *   index = row * 9 + column
 *
 * 0 means empty, 1..9 is a placed digit. Uint8Array is compact, cheap to
 * clone, cheap to hash, and survives structuredClone into a worker untouched.
 */
export type Board = Uint8Array;

export const SIZE = 9;
export const CELLS = 81;

export function createEmptyBoard(): Board {
  return new Uint8Array(CELLS);
}

export function rowOf(index: number): number {
  return (index / 9) | 0;
}

export function colOf(index: number): number {
  return index % 9;
}

export function boxOf(index: number): number {
  return ((index / 27) | 0) * 3 + (((index % 9) / 3) | 0);
}

export function indexOf(row: number, col: number): number {
  return row * 9 + col;
}

/** Cell indexes of each row, column and box, precomputed once. */
export const ROWS: readonly (readonly number[])[] = buildUnits("row");
export const COLS: readonly (readonly number[])[] = buildUnits("col");
export const BOXES: readonly (readonly number[])[] = buildUnits("box");

/** All 27 units in a stable order: rows, then columns, then boxes. */
export const UNITS: readonly (readonly number[])[] = [...ROWS, ...COLS, ...BOXES];

/** The 20 cells that share a row, column or box with each cell. */
export const PEERS: readonly (readonly number[])[] = buildPeers();

function buildUnits(kind: "row" | "col" | "box"): number[][] {
  const units: number[][] = [];
  for (let u = 0; u < 9; u++) {
    const cells: number[] = [];
    for (let k = 0; k < 9; k++) {
      if (kind === "row") cells.push(u * 9 + k);
      else if (kind === "col") cells.push(k * 9 + u);
      else {
        const baseRow = ((u / 3) | 0) * 3;
        const baseCol = (u % 3) * 3;
        cells.push((baseRow + ((k / 3) | 0)) * 9 + baseCol + (k % 3));
      }
    }
    units.push(cells);
  }
  return units;
}

function buildPeers(): number[][] {
  const peers: number[][] = [];
  for (let i = 0; i < CELLS; i++) {
    const set = new Set<number>();
    for (const cell of ROWS[rowOf(i)]) set.add(cell);
    for (const cell of COLS[colOf(i)]) set.add(cell);
    for (const cell of BOXES[boxOf(i)]) set.add(cell);
    set.delete(i);
    peers.push([...set].sort((a, b) => a - b));
  }
  return peers;
}

/** 81 characters, `0` for empty. Stable across versions: used by fixtures. */
export function serializeBoard(board: Board): string {
  let out = "";
  for (let i = 0; i < CELLS; i++) out += String(board[i]);
  return out;
}

export function deserializeBoard(text: string): Board {
  if (text.length !== CELLS || !/^[0-9]{81}$/.test(text)) {
    throw new Error(`Invalid board string: expected 81 digits, got ${text.length}`);
  }
  const board = createEmptyBoard();
  for (let i = 0; i < CELLS; i++) board[i] = text.charCodeAt(i) - 48;
  return board;
}

export function countClues(board: Board): number {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (board[i] !== 0) n++;
  return n;
}

/** True when no unit repeats a digit. Empty cells are ignored. */
export function isConsistent(board: Board): boolean {
  for (const unit of UNITS) {
    let seen = 0;
    for (const cell of unit) {
      const value = board[cell];
      if (value === 0) continue;
      const bit = 1 << value;
      if (seen & bit) return false;
      seen |= bit;
    }
  }
  return true;
}

/** True when the board is full and every unit holds 1..9 exactly once. */
export function isSolved(board: Board): boolean {
  for (const unit of UNITS) {
    let seen = 0;
    for (const cell of unit) seen |= 1 << board[cell];
    if (seen !== 0b1111111110) return false;
  }
  return true;
}

/** Renders the grid the way a newspaper would print it. Used by the CLI. */
export function formatBoard(board: Board): string {
  const lines: string[] = [];
  for (let row = 0; row < 9; row++) {
    if (row % 3 === 0) lines.push("+-------+-------+-------+");
    let line = "";
    for (let col = 0; col < 9; col++) {
      if (col % 3 === 0) line += "| ";
      const value = board[indexOf(row, col)];
      line += (value === 0 ? "." : String(value)) + " ";
    }
    lines.push(line + "|");
  }
  lines.push("+-------+-------+-------+");
  return lines.join("\n");
}
