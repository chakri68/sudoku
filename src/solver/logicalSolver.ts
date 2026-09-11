import { BOXES, COLS, PEERS, ROWS, UNITS, boxOf, createEmptyBoard, type Board } from "../core/board.ts";
import { ALL_DIGITS, bitOf, digitsOf, popcount } from "./candidates.ts";

/**
 * A human-style solver. It exists to *rate* puzzles, not to solve them --
 * countSolutions already does that faster.
 *
 * Clue count alone is a bad difficulty signal: a 28-clue grid that falls to
 * hidden singles is easier than a 34-clue grid that needs an X-Wing. So we
 * run the techniques a person would actually reach for, cheapest first, and
 * record the hardest one the puzzle forced us into.
 */
export const TECHNIQUES = [
  "nakedSingle",
  "hiddenSingle",
  "lockedCandidates",
  "nakedPair",
  "hiddenPair",
  "nakedTriple",
  "xWing",
] as const;

export type Technique = (typeof TECHNIQUES)[number];

/** Position in TECHNIQUES, 1-based. 0 = already solved, 8 = needs guessing. */
export const GUESS_TIER = TECHNIQUES.length + 1;

export interface LogicalResult {
  /** Solved using only the techniques above. */
  solved: boolean;
  /** Tier of the hardest technique the puzzle demanded. */
  hardestTier: number;
  hardestTechnique: Technique | null;
  /** How many times each technique fired. */
  counts: Record<Technique, number>;
  /** Total technique applications. */
  steps: number;
  /** Cells still empty when the solver ran out of ideas. */
  unresolved: number;
  /** The grid as far as logic got it. Lets tests check the placements, not
   *  merely that the solver terminated. */
  board: Board;
}

interface State {
  values: Uint8Array;
  cands: Int16Array;
}

export function solveLogically(board: Board): LogicalResult {
  const state = initState(board);
  const counts = emptyCounts();
  let hardestTier = 0;
  let steps = 0;

  if (state.values.includes(255)) {
    // A contradictory grid; nothing to rate.
    return {
      solved: false,
      hardestTier: GUESS_TIER,
      hardestTechnique: null,
      counts,
      steps,
      unresolved: 81,
      board: createEmptyBoard(),
    };
  }

  for (;;) {
    if (isComplete(state)) break;

    const applied = applyCheapestTechnique(state);
    if (!applied) break;

    counts[applied]++;
    steps++;
    const tier = TECHNIQUES.indexOf(applied) + 1;
    if (tier > hardestTier) hardestTier = tier;
  }

  const solved = isComplete(state);
  let unresolved = 0;
  for (let i = 0; i < 81; i++) if (state.values[i] === 0) unresolved++;

  return {
    solved,
    hardestTier: solved ? hardestTier : GUESS_TIER,
    hardestTechnique: hardestTier > 0 ? TECHNIQUES[hardestTier - 1] : null,
    counts,
    steps,
    unresolved,
    board: Uint8Array.from(state.values),
  };
}

function applyCheapestTechnique(state: State): Technique | null {
  if (nakedSingle(state)) return "nakedSingle";
  if (hiddenSingle(state)) return "hiddenSingle";
  if (lockedCandidates(state)) return "lockedCandidates";
  if (nakedSubset(state, 2)) return "nakedPair";
  if (hiddenSubset(state, 2)) return "hiddenPair";
  if (nakedSubset(state, 3)) return "nakedTriple";
  if (xWing(state)) return "xWing";
  return null;
}

function initState(board: Board): State {
  const state: State = { values: new Uint8Array(81), cands: new Int16Array(81) };
  for (let i = 0; i < 81; i++) state.cands[i] = ALL_DIGITS;

  for (let i = 0; i < 81; i++) {
    const value = board[i];
    if (value === 0) continue;
    if (state.values[i] === 0 && (state.cands[i] & bitOf(value)) === 0) {
      state.values[i] = 255; // contradiction marker
      return state;
    }
    assign(state, i, value);
  }
  return state;
}

function assign(state: State, index: number, digit: number): void {
  state.values[index] = digit;
  state.cands[index] = 0;
  const mask = ~bitOf(digit);
  for (const peer of PEERS[index]) state.cands[peer] &= mask;
}

function isComplete(state: State): boolean {
  for (let i = 0; i < 81; i++) if (state.values[i] === 0) return false;
  return true;
}

function emptyCounts(): Record<Technique, number> {
  const counts = {} as Record<Technique, number>;
  for (const technique of TECHNIQUES) counts[technique] = 0;
  return counts;
}

/* ------------------------------------------------------------------ */
/* Techniques                                                          */
/* ------------------------------------------------------------------ */

/** One cell, one possible digit. */
function nakedSingle(state: State): boolean {
  for (let i = 0; i < 81; i++) {
    if (state.values[i] !== 0) continue;
    if (popcount(state.cands[i]) === 1) {
      assign(state, i, digitsOf(state.cands[i])[0]);
      return true;
    }
  }
  return false;
}

/** One digit, one possible cell in a unit. */
function hiddenSingle(state: State): boolean {
  for (const unit of UNITS) {
    for (let digit = 1; digit <= 9; digit++) {
      const bit = bitOf(digit);
      let target = -1;
      let found = 0;
      let alreadyPlaced = false;

      for (const cell of unit) {
        if (state.values[cell] === digit) {
          alreadyPlaced = true;
          break;
        }
        if (state.values[cell] === 0 && state.cands[cell] & bit) {
          target = cell;
          found++;
        }
      }
      if (!alreadyPlaced && found === 1) {
        assign(state, target, digit);
        return true;
      }
    }
  }
  return false;
}

/**
 * Pointing: a digit confined to one row/column inside a box can be struck
 * from the rest of that line. Claiming is the same argument run backwards.
 */
function lockedCandidates(state: State): boolean {
  let changed = false;

  for (let b = 0; b < 9; b++) {
    for (let digit = 1; digit <= 9; digit++) {
      const bit = bitOf(digit);
      const cells = BOXES[b].filter((c) => state.values[c] === 0 && state.cands[c] & bit);
      if (cells.length < 2) continue;

      const rows = new Set(cells.map((c) => (c / 9) | 0));
      if (rows.size === 1) {
        const row = [...rows][0];
        changed = eliminate(state, ROWS[row].filter((c) => boxOf(c) !== b), bit) || changed;
      }
      const cols = new Set(cells.map((c) => c % 9));
      if (cols.size === 1) {
        const col = [...cols][0];
        changed = eliminate(state, COLS[col].filter((c) => boxOf(c) !== b), bit) || changed;
      }
    }
  }

  for (const line of [...ROWS, ...COLS]) {
    for (let digit = 1; digit <= 9; digit++) {
      const bit = bitOf(digit);
      const cells = line.filter((c) => state.values[c] === 0 && state.cands[c] & bit);
      if (cells.length < 2) continue;

      const boxes = new Set(cells.map(boxOf));
      if (boxes.size === 1) {
        const box = [...boxes][0];
        const lineSet = new Set(line);
        changed = eliminate(state, BOXES[box].filter((c) => !lineSet.has(c)), bit) || changed;
      }
    }
  }

  return changed;
}

/**
 * N cells in a unit whose candidates span exactly N digits: those digits
 * belong to those cells, so they leave every other cell in the unit.
 */
function nakedSubset(state: State, size: number): boolean {
  let changed = false;

  for (const unit of UNITS) {
    const open = unit.filter(
      (c) => state.values[c] === 0 && popcount(state.cands[c]) >= 2 && popcount(state.cands[c]) <= size,
    );
    if (open.length <= size) continue;

    forEachCombination(open, size, (group) => {
      let union = 0;
      for (const cell of group) union |= state.cands[cell];
      if (popcount(union) !== size) return false;

      const groupSet = new Set(group);
      const others = unit.filter((c) => state.values[c] === 0 && !groupSet.has(c));
      if (eliminate(state, others, union)) changed = true;
      return false;
    });
  }

  return changed;
}

/**
 * N digits in a unit that can only live in N cells: those cells hold nothing
 * else, so their other candidates go.
 */
function hiddenSubset(state: State, size: number): boolean {
  let changed = false;

  for (const unit of UNITS) {
    const open = unit.filter((c) => state.values[c] === 0);
    if (open.length <= size) continue;

    const placed = new Set(unit.map((c) => state.values[c]).filter((v) => v !== 0));
    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) {
      if (placed.has(d)) continue;
      const spots = open.filter((c) => state.cands[c] & bitOf(d)).length;
      if (spots >= 2 && spots <= size) digits.push(d);
    }
    if (digits.length < size) continue;

    forEachCombination(digits, size, (group) => {
      let mask = 0;
      for (const digit of group) mask |= bitOf(digit);

      const cells = open.filter((c) => state.cands[c] & mask);
      if (cells.length !== size) return false;

      let local = false;
      for (const cell of cells) {
        const trimmed = state.cands[cell] & mask;
        if (trimmed !== state.cands[cell]) {
          state.cands[cell] = trimmed;
          local = true;
        }
      }
      if (local) changed = true;
      return false;
    });
  }

  return changed;
}

/**
 * A digit restricted to the same two columns in two different rows forms a
 * rectangle; the digit cannot appear elsewhere in those columns.
 */
function xWing(state: State): boolean {
  let changed = false;

  for (let digit = 1; digit <= 9; digit++) {
    const bit = bitOf(digit);
    changed = xWingOnLines(state, ROWS, COLS, bit, (c) => c % 9) || changed;
    changed = xWingOnLines(state, COLS, ROWS, bit, (c) => (c / 9) | 0) || changed;
  }

  return changed;
}

function xWingOnLines(
  state: State,
  lines: readonly (readonly number[])[],
  crossLines: readonly (readonly number[])[],
  bit: number,
  crossIndexOf: (cell: number) => number,
): boolean {
  let changed = false;

  const pairs: { line: number; a: number; b: number }[] = [];
  for (let l = 0; l < lines.length; l++) {
    const cells = lines[l].filter((c) => state.values[c] === 0 && state.cands[c] & bit);
    if (cells.length === 2) {
      pairs.push({ line: l, a: crossIndexOf(cells[0]), b: crossIndexOf(cells[1]) });
    }
  }

  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if (pairs[i].a !== pairs[j].a || pairs[i].b !== pairs[j].b) continue;

      const keep = new Set([lines[pairs[i].line], lines[pairs[j].line]].flat());
      for (const cross of [pairs[i].a, pairs[i].b]) {
        const targets = crossLines[cross].filter((c) => !keep.has(c) && state.values[c] === 0);
        if (eliminate(state, targets, bit)) changed = true;
      }
    }
  }

  return changed;
}

/** Strip `mask` from every listed cell. Returns true if anything changed. */
function eliminate(state: State, cells: readonly number[], mask: number): boolean {
  let changed = false;
  for (const cell of cells) {
    if (state.values[cell] !== 0) continue;
    const trimmed = state.cands[cell] & ~mask;
    if (trimmed !== state.cands[cell]) {
      state.cands[cell] = trimmed;
      changed = true;
    }
  }
  return changed;
}

/** Visits every `size`-subset in index order. Stop early by returning true. */
function forEachCombination(
  items: readonly number[],
  size: number,
  visit: (group: number[]) => boolean,
): void {
  const group: number[] = [];

  const walk = (start: number): boolean => {
    if (group.length === size) return visit(group.slice());
    for (let i = start; i < items.length; i++) {
      group.push(items[i]);
      if (walk(i + 1)) return true;
      group.pop();
    }
    return false;
  };

  walk(0);
}
