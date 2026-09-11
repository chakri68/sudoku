import { beforeEach, describe, expect, it } from "vitest";
import { generateDailyPuzzle } from "../src/generator/generateDailyPuzzle.ts";
import type { SudokuPuzzle } from "../src/generator/types.ts";
import { GameState, notesOf } from "../src/game/gameState.ts";
import { restoreProgress, saveProgress } from "../src/game/persistence.ts";
import { summarizeStreak, type CompletionRecord } from "../src/game/streak.ts";
import { formatDuration } from "../src/game/timer.ts";

/** localStorage does not exist in the node test environment. */
function installStorage(): void {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

let puzzle: SudokuPuzzle;

beforeEach(async () => {
  installStorage();
  puzzle = await generateDailyPuzzle("2026-09-11");
});

function firstEmpty(state: GameState): number {
  for (let i = 0; i < 81; i++) if (!state.isGiven(i)) return i;
  throw new Error("no empty cell");
}

describe("entry rules", () => {
  it("starts from the clues", () => {
    const state = new GameState(puzzle);
    for (let i = 0; i < 81; i++) {
      expect(state.isGiven(i)).toBe(puzzle.puzzle[i] !== 0);
      expect(state.values[i]).toBe(puzzle.puzzle[i]);
    }
  });

  it("refuses to edit a clue", () => {
    const state = new GameState(puzzle);
    const clue = puzzle.puzzle.findIndex((v) => v !== 0);
    const original = state.values[clue];

    expect(state.setValue(clue, 5)).toBe(false);
    expect(state.erase(clue)).toBe(false);
    expect(state.values[clue]).toBe(original);
  });

  it("places and erases a digit", () => {
    const state = new GameState(puzzle);
    const cell = firstEmpty(state);

    expect(state.setValue(cell, 4)).toBe(true);
    expect(state.values[cell]).toBe(4);
    expect(state.erase(cell)).toBe(true);
    expect(state.values[cell]).toBe(0);
  });

  it("ignores a no-op write", () => {
    const state = new GameState(puzzle);
    const cell = firstEmpty(state);
    state.setValue(cell, 4);
    expect(state.setValue(cell, 4)).toBe(false);
  });
});

describe("notes", () => {
  it("toggles pencil marks", () => {
    const state = new GameState(puzzle);
    const cell = firstEmpty(state);

    state.toggleNote(cell, 3);
    state.toggleNote(cell, 7);
    expect(notesOf(state.notes[cell])).toEqual([3, 7]);

    state.toggleNote(cell, 3);
    expect(notesOf(state.notes[cell])).toEqual([7]);
  });

  it("refuses notes on a filled cell", () => {
    const state = new GameState(puzzle);
    const cell = firstEmpty(state);
    state.setValue(cell, 4);
    expect(state.toggleNote(cell, 3)).toBe(false);
  });

  it("retires the mark from peers when a digit is placed", () => {
    const state = new GameState(puzzle);
    const cell = firstEmpty(state);
    const peer = [...Array(9).keys()].map((k) => Math.floor(cell / 9) * 9 + k).find(
      (c) => c !== cell && !state.isGiven(c),
    )!;

    state.toggleNote(peer, 6);
    expect(notesOf(state.notes[peer])).toEqual([6]);

    state.setValue(cell, 6);
    expect(notesOf(state.notes[peer])).toEqual([]);
  });
});

describe("undo and redo", () => {
  it("restores peer notes cleared by a placement", () => {
    const state = new GameState(puzzle);
    const cell = firstEmpty(state);
    const peer = [...Array(9).keys()].map((k) => Math.floor(cell / 9) * 9 + k).find(
      (c) => c !== cell && !state.isGiven(c),
    )!;

    state.toggleNote(peer, 6);
    state.setValue(cell, 6);
    expect(notesOf(state.notes[peer])).toEqual([]);

    state.undo();
    expect(state.values[cell]).toBe(0);
    expect(notesOf(state.notes[peer])).toEqual([6]);

    state.redo();
    expect(state.values[cell]).toBe(6);
    expect(notesOf(state.notes[peer])).toEqual([]);
  });

  it("walks the whole history back to the start", () => {
    const state = new GameState(puzzle);
    const cells = [...Array(81).keys()].filter((i) => !state.isGiven(i)).slice(0, 8);

    for (const cell of cells) state.setValue(cell, 5);
    while (state.canUndo) state.undo();

    for (const cell of cells) expect(state.values[cell]).toBe(0);
    expect(state.canUndo).toBe(false);
  });

  it("drops the redo branch after a fresh move", () => {
    const state = new GameState(puzzle);
    const cell = firstEmpty(state);

    state.setValue(cell, 5);
    state.undo();
    expect(state.canRedo).toBe(true);

    state.setValue(cell, 6);
    expect(state.canRedo).toBe(false);
  });
});

describe("conflicts and completion", () => {
  it("flags duplicates within a unit", () => {
    const state = new GameState(puzzle);
    const row = 0;
    const open = [...Array(9).keys()].map((k) => row * 9 + k).filter((c) => !state.isGiven(c));
    expect(open.length).toBeGreaterThanOrEqual(2);

    state.setValue(open[0], 9);
    state.setValue(open[1], 9);

    const conflicts = state.allConflicts();
    expect(conflicts.has(open[0])).toBe(true);
    expect(conflicts.has(open[1])).toBe(true);
    expect(state.mistakes).toBe(1);
  });

  it("detects a solved board only when it matches exactly", () => {
    const state = new GameState(puzzle);
    for (let i = 0; i < 81; i++) {
      if (!state.isGiven(i)) state.setValue(i, puzzle.solution[i]);
    }
    expect(state.checkCompletion()).toBe(true);
    expect(state.completed).toBe(true);
  });

  it("does not call a nearly-finished board complete", () => {
    const state = new GameState(puzzle);
    const empties = [...Array(81).keys()].filter((i) => !state.isGiven(i));
    for (const i of empties.slice(1)) state.setValue(i, puzzle.solution[i]);
    expect(state.checkCompletion()).toBe(false);
  });

  it("locks the board once solved", () => {
    const state = new GameState(puzzle);
    for (let i = 0; i < 81; i++) {
      if (!state.isGiven(i)) state.setValue(i, puzzle.solution[i]);
    }
    state.checkCompletion();

    const cell = firstEmpty(state);
    expect(state.setValue(cell, 1)).toBe(false);
  });
});

describe("hints", () => {
  it("fills the right digit and charges a hint", () => {
    const state = new GameState(puzzle);
    const target = state.findHintTarget();

    expect(target).toBeGreaterThanOrEqual(0);
    expect(state.revealCell(target)).toBe(true);
    expect(state.values[target]).toBe(puzzle.solution[target]);
    expect(state.hintsUsed).toBe(1);
    expect(state.revealed.has(target)).toBe(true);
  });
});

describe("persistence", () => {
  it("round-trips a game", () => {
    const state = new GameState(puzzle);
    const cell = firstEmpty(state);
    state.setValue(cell, 5);
    state.toggleNote(firstEmpty(state) + 1, 4);
    state.elapsedMs = 61_000;
    state.mistakes = 2;
    saveProgress(state);

    const restored = new GameState(puzzle);
    expect(restoreProgress(restored)).toBe(true);
    expect(restored.values[cell]).toBe(5);
    expect(restored.elapsedMs).toBe(61_000);
    expect(restored.mistakes).toBe(2);
  });

  it("ignores a record written for a different grid", () => {
    const state = new GameState(puzzle);
    state.setValue(firstEmpty(state), 5);
    saveProgress(state);

    const other = new GameState({ ...puzzle, fingerprint: "deadbe" });
    expect(restoreProgress(other)).toBe(false);
  });

  it("survives corrupted storage", () => {
    localStorage.setItem(`sudoku-progress:v1:${puzzle.date}`, "{not json");
    expect(restoreProgress(new GameState(puzzle))).toBe(false);

    localStorage.setItem(`sudoku-progress:v1:${puzzle.date}`, '{"schema":1}');
    expect(restoreProgress(new GameState(puzzle))).toBe(false);
  });

  it("never lets stored data overwrite a clue", () => {
    const state = new GameState(puzzle);
    saveProgress(state);

    const key = `sudoku-progress:v1:${puzzle.date}`;
    const record = JSON.parse(localStorage.getItem(key)!);
    record.values = "9".repeat(81);
    localStorage.setItem(key, JSON.stringify(record));

    const restored = new GameState(puzzle);
    restoreProgress(restored);
    for (let i = 0; i < 81; i++) {
      if (restored.isGiven(i)) expect(restored.values[i]).toBe(puzzle.puzzle[i]);
    }
  });
});

describe("streaks", () => {
  const record = (date: string): CompletionRecord => ({
    date,
    completedAt: `${date}T12:00:00.000Z`,
    elapsedMs: 60_000,
    mistakes: 0,
    hintsUsed: 0,
    difficulty: "medium",
  });

  it("counts consecutive days up to today", () => {
    const completions = Object.fromEntries(
      ["2026-09-09", "2026-09-10", "2026-09-11"].map((d) => [d, record(d)]),
    );
    const summary = summarizeStreak(completions, "2026-09-11");
    expect(summary.current).toBe(3);
    expect(summary.best).toBe(3);
    expect(summary.todayDone).toBe(true);
  });

  it("keeps the streak alive before today is played", () => {
    const completions = Object.fromEntries(
      ["2026-09-09", "2026-09-10"].map((d) => [d, record(d)]),
    );
    const summary = summarizeStreak(completions, "2026-09-11");
    expect(summary.current).toBe(2);
    expect(summary.todayDone).toBe(false);
  });

  it("breaks on a gap", () => {
    const completions = Object.fromEntries(
      ["2026-09-01", "2026-09-02", "2026-09-10", "2026-09-11"].map((d) => [d, record(d)]),
    );
    const summary = summarizeStreak(completions, "2026-09-11");
    expect(summary.current).toBe(2);
    expect(summary.best).toBe(2);
    expect(summary.total).toBe(4);
  });

  it("reports no streak when nothing is recent", () => {
    const summary = summarizeStreak({ "2026-01-01": record("2026-01-01") }, "2026-09-11");
    expect(summary.current).toBe(0);
    expect(summary.best).toBe(1);
  });
});

describe("duration formatting", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(61_000)).toBe("01:01");
    expect(formatDuration(461_000)).toBe("07:41");
    expect(formatDuration(3_661_000)).toBe("1:01:01");
    expect(formatDuration(-5)).toBe("00:00");
  });
});
