import { formatShortDate } from "../generator/date.ts";
import { formatDuration } from "../game/timer.ts";
import { difficultyLabel } from "../generator/difficulty.ts";
import type { Difficulty } from "../generator/types.ts";

export interface ShareDetails {
  date: string;
  difficulty: Difficulty;
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
  streak: number;
}

/**
 * Share text carries the date and the time, never the grid -- §26. Anyone
 * following the link regenerates the identical puzzle from the date alone,
 * which is the whole trick, so there is nothing else worth sending.
 */
export function buildShareText(details: ShareDetails, url: string): string {
  const lines = [
    `I solved the ${formatShortDate(details.date)} Sudoku in ${formatDuration(details.elapsedMs)} 🧩`,
    `${difficultyLabel(details.difficulty)} · ${details.mistakes} mistakes · ${details.hintsUsed} hints`,
  ];
  if (details.streak > 1) lines.push(`🔥 ${details.streak} day streak`);
  lines.push(url);
  return lines.join("\n");
}

export type ShareOutcome = "shared" | "copied" | "failed";

export async function shareResult(text: string, url: string): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch (error) {
      // A user-cancelled share is not a failure; fall through to clipboard
      // only when the share itself was unavailable.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
