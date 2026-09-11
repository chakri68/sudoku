import { addDays, getTodayDateString, isValidDateString } from "../generator/date.ts";
import type { Difficulty } from "../generator/types.ts";
import { GENERATOR_VERSION } from "../generator/version.ts";
import { readJson, writeJson } from "./persistence.ts";

export interface CompletionRecord {
  date: string;
  completedAt: string;
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
  difficulty: Difficulty;
}

export interface StreakSummary {
  current: number;
  best: number;
  total: number;
  /** True when today's puzzle is already done. */
  todayDone: boolean;
}

const KEY = `sudoku-completions:v${GENERATOR_VERSION}`;

type CompletionMap = Record<string, CompletionRecord>;

export function loadCompletions(): CompletionMap {
  const raw = readJson<CompletionMap>(KEY);
  if (!raw || typeof raw !== "object") return {};

  const clean: CompletionMap = {};
  for (const [date, record] of Object.entries(raw)) {
    if (!isValidDateString(date) || typeof record !== "object" || record === null) continue;
    const r = record as Partial<CompletionRecord>;
    if (typeof r.completedAt !== "string") continue;
    clean[date] = {
      date,
      completedAt: r.completedAt,
      elapsedMs: typeof r.elapsedMs === "number" ? r.elapsedMs : 0,
      mistakes: typeof r.mistakes === "number" ? r.mistakes : 0,
      hintsUsed: typeof r.hintsUsed === "number" ? r.hintsUsed : 0,
      difficulty: (r.difficulty ?? "medium") as Difficulty,
    };
  }
  return clean;
}

export function recordCompletion(record: CompletionRecord): void {
  const all = loadCompletions();
  // Keep the first completion: re-solving an old date should not overwrite
  // the run that actually built the streak.
  if (!all[record.date]) {
    all[record.date] = record;
    writeJson(KEY, all);
  }
}

export function isCompleted(date: string): boolean {
  return loadCompletions()[date] !== undefined;
}

/**
 * A streak is consecutive calendar dates ending today, or ending yesterday
 * if today is still unplayed -- so the count does not collapse to zero every
 * midnight before you have had coffee.
 *
 * Solving an old archive date fills a gap and can extend a streak, but never
 * starts one from the future.
 */
export function summarizeStreak(
  completions: CompletionMap = loadCompletions(),
  today: string = getTodayDateString(),
): StreakSummary {
  const dates = Object.keys(completions).sort();
  const done = new Set(dates);

  let current = 0;
  const todayDone = done.has(today);
  let cursor = todayDone ? today : addDays(today, -1);
  while (done.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    if (run > best) best = run;
    previous = date;
  }

  return { current, best, total: dates.length, todayDone };
}
