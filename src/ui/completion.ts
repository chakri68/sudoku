import { formatLongDate } from "../generator/date.ts";
import { difficultyLabel } from "../generator/difficulty.ts";
import type { SudokuPuzzle } from "../generator/types.ts";
import { formatDuration } from "../game/timer.ts";
import type { StreakSummary } from "../game/streak.ts";
import { el } from "./dom.ts";

export interface CompletionSummary {
  puzzle: SudokuPuzzle;
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
  streak: StreakSummary;
}

export function buildCompletionContent(summary: CompletionSummary): HTMLElement {
  const { puzzle, streak } = summary;

  return el("div", {}, [
    el("div", { class: "note", text: formatLongDate(puzzle.date) }),
    el("div", { class: "bignum", text: formatDuration(summary.elapsedMs) }),
    el("div", { class: "summary" }, [
      stat("Difficulty", difficultyLabel(puzzle.difficulty)),
      stat("Clues", String(puzzle.clues)),
      stat("Mistakes", String(summary.mistakes)),
      stat("Hints", String(summary.hintsUsed)),
    ]),
    streak.current > 0
      ? el("div", { class: "note", style: "margin-top:16px", text: `🔥 ${streak.current} day streak · best ${streak.best}` })
      : null,
  ]);
}

function stat(label: string, value: string): HTMLElement {
  return el("div", { class: "cellstat" }, [
    el("div", { class: "label", text: label }),
    el("div", { class: "value", text: value }),
  ]);
}
