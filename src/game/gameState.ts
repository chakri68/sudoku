import { BOXES, COLS, ROWS, boxOf, colOf, rowOf, type Board } from "../core/board.ts";
import type { SudokuPuzzle } from "../generator/types.ts";

/**
 * Notes live as a 9-bit mask rather than a Set: one number per cell, so the
 * whole board serialises to a short string and restoring from localStorage
 * needs no object graph.
 */
export interface CellSnapshot {
  value: number;
  notes: number;
}

interface CellChange {
  index: number;
  before: CellSnapshot;
  after: CellSnapshot;
}

/**
 * One user action, which may touch several cells: placing a digit also
 * retires that pencil mark from its peers, and undo has to put all of it
 * back, not just the cell that was typed into.
 */
interface UndoEntry {
  cells: CellChange[];
  focus: number;
}

type Transaction = Map<number, CellSnapshot>;

export interface GameStats {
  elapsedMs: number;
  completed: boolean;
  completedAt: string | null;
  mistakes: number;
  hintsUsed: number;
}

export function noteBit(digit: number): number {
  return 1 << (digit - 1);
}

export function hasNote(mask: number, digit: number): boolean {
  return (mask & noteBit(digit)) !== 0;
}

export function notesOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (hasNote(mask, d)) out.push(d);
  return out;
}

export class GameState {
  readonly puzzle: SudokuPuzzle;
  readonly givens: Uint8Array;
  readonly values: Uint8Array;
  readonly notes: Uint16Array;

  elapsedMs = 0;
  completed = false;
  completedAt: string | null = null;
  mistakes = 0;
  hintsUsed = 0;

  /** Cells filled by a hint rather than by the player. Shown differently. */
  readonly revealed = new Set<number>();

  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];

  constructor(puzzle: SudokuPuzzle) {
    this.puzzle = puzzle;
    this.givens = new Uint8Array(81);
    this.values = new Uint8Array(81);
    this.notes = new Uint16Array(81);

    for (let i = 0; i < 81; i++) {
      const clue = puzzle.puzzle[i];
      this.givens[i] = clue === 0 ? 0 : 1;
      this.values[i] = clue;
    }
  }

  get puzzleId(): string {
    return this.puzzle.id;
  }

  isGiven(index: number): boolean {
    return this.givens[index] === 1;
  }

  /**
   * Places a digit. Returns true if anything changed.
   *
   * A "mistake" here means the entry duplicates a digit a peer already holds
   * -- a rule break the player can see on the board anyway. Checking against
   * the stored solution instead would quietly turn the counter into an
   * answer oracle, which §43 asks us not to do.
   */
  setValue(index: number, digit: number): boolean {
    if (this.isGiven(index) || this.completed) return false;
    if (this.values[index] === digit) return false;

    const tx = this.begin(index);
    this.values[index] = digit;
    this.notes[index] = 0;
    if (digit !== 0 && this.conflictsAt(index).length > 0) this.mistakes++;
    if (digit !== 0) this.clearNoteFromPeers(tx, index, digit);

    return this.commit(tx, index);
  }

  toggleNote(index: number, digit: number): boolean {
    if (this.isGiven(index) || this.completed) return false;
    if (this.values[index] !== 0) return false;

    const tx = this.begin(index);
    this.notes[index] ^= noteBit(digit);
    return this.commit(tx, index);
  }

  erase(index: number): boolean {
    if (this.isGiven(index) || this.completed) return false;
    if (this.values[index] === 0 && this.notes[index] === 0) return false;

    const tx = this.begin(index);
    this.values[index] = 0;
    this.notes[index] = 0;
    return this.commit(tx, index);
  }

  /** Fills a cell from the solution and charges a hint. */
  revealCell(index: number): boolean {
    if (this.isGiven(index) || this.completed) return false;
    const answer = this.puzzle.solution[index];
    if (this.values[index] === answer) return false;

    const tx = this.begin(index);
    this.values[index] = answer;
    this.notes[index] = 0;
    this.hintsUsed++;
    this.revealed.add(index);
    this.clearNoteFromPeers(tx, index, answer);
    this.commit(tx, index);
    return true;
  }

  /** First empty or wrong cell in reading order; -1 when none. */
  findHintTarget(): number {
    for (let i = 0; i < 81; i++) {
      if (this.isGiven(i)) continue;
      if (this.values[i] !== this.puzzle.solution[i]) return i;
    }
    return -1;
  }

  undo(): number | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    for (const change of entry.cells) this.apply(change.index, change.before);
    this.redoStack.push(entry);
    return entry.focus;
  }

  redo(): number | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    for (const change of entry.cells) this.apply(change.index, change.after);
    this.undoStack.push(entry);
    return entry.focus;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Cell indexes holding a digit that repeats within a shared unit. */
  conflictsAt(index: number): number[] {
    const digit = this.values[index];
    if (digit === 0) return [];

    const out: number[] = [];
    for (const unit of [ROWS[rowOf(index)], COLS[colOf(index)], BOXES[boxOf(index)]]) {
      for (const cell of unit) {
        if (cell !== index && this.values[cell] === digit) out.push(cell);
      }
    }
    return out;
  }

  /** Every cell currently breaking a rule. */
  allConflicts(): Set<number> {
    const conflicts = new Set<number>();
    for (let i = 0; i < 81; i++) {
      if (this.values[i] === 0) continue;
      if (this.conflictsAt(i).length > 0) conflicts.add(i);
    }
    return conflicts;
  }

  /** How many of each digit are still unplaced, indexed 1..9. */
  remainingCounts(): number[] {
    const counts = new Array(10).fill(9);
    counts[0] = 0;
    for (let i = 0; i < 81; i++) {
      const value = this.values[i];
      if (value !== 0) counts[value]--;
    }
    return counts;
  }

  isFilled(): boolean {
    for (let i = 0; i < 81; i++) if (this.values[i] === 0) return false;
    return true;
  }

  /** Completion is board equality, per §29. */
  checkCompletion(): boolean {
    if (this.completed) return true;
    for (let i = 0; i < 81; i++) {
      if (this.values[i] !== this.puzzle.solution[i]) return false;
    }
    this.completed = true;
    this.completedAt = new Date().toISOString();
    return true;
  }

  toBoard(): Board {
    return this.values.slice();
  }

  private snapshot(index: number): CellSnapshot {
    return { value: this.values[index], notes: this.notes[index] };
  }

  private apply(index: number, snapshot: CellSnapshot): void {
    this.values[index] = snapshot.value;
    this.notes[index] = snapshot.notes;
  }

  private begin(index: number): Transaction {
    const tx: Transaction = new Map();
    tx.set(index, this.snapshot(index));
    return tx;
  }

  private touch(tx: Transaction, index: number): void {
    if (!tx.has(index)) tx.set(index, this.snapshot(index));
  }

  /** Records only the cells that actually moved. Returns false if none did. */
  private commit(tx: Transaction, focus: number): boolean {
    const cells: CellChange[] = [];
    for (const [index, before] of tx) {
      const after = this.snapshot(index);
      if (before.value !== after.value || before.notes !== after.notes) {
        cells.push({ index, before, after });
      }
    }
    if (cells.length === 0) return false;

    this.undoStack.push({ cells, focus });
    this.redoStack = [];
    return true;
  }

  /** Placing a digit retires that pencil mark everywhere it can no longer go. */
  private clearNoteFromPeers(tx: Transaction, index: number, digit: number): void {
    const mask = noteBit(digit);
    for (const unit of [ROWS[rowOf(index)], COLS[colOf(index)], BOXES[boxOf(index)]]) {
      for (const cell of unit) {
        if ((this.notes[cell] & mask) === 0) continue;
        this.touch(tx, cell);
        this.notes[cell] &= ~mask;
      }
    }
  }
}
