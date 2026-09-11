import { GENERATOR_VERSION } from "../generator/version.ts";
import type { SudokuPuzzle } from "../generator/types.ts";
import { GameState } from "./gameState.ts";

/**
 * Progress lives in localStorage keyed by generator version and date, so a
 * generator bump cannot resurrect a half-solved grid against a puzzle that
 * no longer exists.
 *
 * Everything read back is treated as hostile: a user can edit it freely, and
 * a malformed record must degrade to "fresh puzzle", never to a crash.
 */
const SCHEMA = 1;

export interface StoredProgress {
  schema: number;
  puzzleId: string;
  fingerprint: string;
  values: string;
  notes: string;
  elapsedMs: number;
  completed: boolean;
  completedAt: string | null;
  mistakes: number;
  hintsUsed: number;
  revealed: string;
  savedAt: string;
}

export function progressKey(date: string, version = GENERATOR_VERSION): string {
  return `sudoku-progress:v${version}:${date}`;
}

export function saveProgress(state: GameState): void {
  const record: StoredProgress = {
    schema: SCHEMA,
    puzzleId: state.puzzleId,
    fingerprint: state.puzzle.fingerprint,
    values: encodeValues(state.values),
    notes: encodeNotes(state.notes),
    elapsedMs: Math.round(state.elapsedMs),
    completed: state.completed,
    completedAt: state.completedAt,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    revealed: encodeFlags(state.revealed),
    savedAt: new Date().toISOString(),
  };

  writeJson(progressKey(state.puzzle.date, state.puzzle.version), record);
}

/** Rehydrates a saved game onto a freshly generated puzzle. */
export function restoreProgress(state: GameState): boolean {
  const raw = readJson<StoredProgress>(progressKey(state.puzzle.date, state.puzzle.version));
  if (!raw || !isValidProgress(raw)) return false;

  // A fingerprint mismatch means the stored grid is not this grid. Refuse it
  // rather than painting old answers onto new clues.
  if (raw.puzzleId !== state.puzzleId || raw.fingerprint !== state.puzzle.fingerprint) {
    return false;
  }

  for (let i = 0; i < 81; i++) {
    if (state.isGiven(i)) continue;
    const value = raw.values.charCodeAt(i) - 48;
    state.values[i] = value >= 1 && value <= 9 ? value : 0;
  }

  const notes = raw.notes.split(",");
  for (let i = 0; i < 81; i++) {
    if (state.isGiven(i) || state.values[i] !== 0) continue;
    const mask = Number.parseInt(notes[i] ?? "0", 36);
    state.notes[i] = Number.isFinite(mask) ? mask & 0b111111111 : 0;
  }

  state.elapsedMs = clampNumber(raw.elapsedMs, 0, 1000 * 60 * 60 * 240);
  state.mistakes = clampNumber(raw.mistakes, 0, 100_000);
  state.hintsUsed = clampNumber(raw.hintsUsed, 0, 81);
  state.revealed.clear();
  if (typeof raw.revealed === "string" && raw.revealed.length === 81) {
    for (let i = 0; i < 81; i++) if (raw.revealed[i] === "1") state.revealed.add(i);
  }

  state.completed = raw.completed === true;
  state.completedAt = typeof raw.completedAt === "string" ? raw.completedAt : null;

  // Trust the board, not the flag.
  if (!state.completed) state.checkCompletion();
  return true;
}

export function clearProgress(puzzle: SudokuPuzzle): void {
  remove(progressKey(puzzle.date, puzzle.version));
}

function isValidProgress(raw: unknown): raw is StoredProgress {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    r.schema === SCHEMA &&
    typeof r.puzzleId === "string" &&
    typeof r.fingerprint === "string" &&
    typeof r.values === "string" &&
    r.values.length === 81 &&
    typeof r.notes === "string" &&
    typeof r.elapsedMs === "number" &&
    Number.isFinite(r.elapsedMs)
  );
}

function encodeValues(values: Uint8Array): string {
  let out = "";
  for (let i = 0; i < 81; i++) out += String(values[i]);
  return out;
}

function encodeFlags(flags: Set<number>): string {
  let out = "";
  for (let i = 0; i < 81; i++) out += flags.has(i) ? "1" : "0";
  return out;
}

/** Base-36 per cell keeps a 9-bit mask inside two characters. */
function encodeNotes(notes: Uint16Array): string {
  const parts: string[] = [];
  for (let i = 0; i < 81; i++) parts.push(notes[i].toString(36));
  return parts.join(",");
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, n));
}

/* --- storage plumbing; every call is allowed to fail silently ----------- */

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode, quota, disabled storage: play on without saving.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
