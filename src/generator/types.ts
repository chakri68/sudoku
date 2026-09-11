import type { Board } from "../core/board.ts";
import type { Technique } from "../solver/logicalSolver.ts";

export const DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value);
}

export interface DifficultyMetrics {
  clues: number;
  emptyCells: number;
  /** Cells assigned by the brute-force solver, including backtracked ones. */
  solverNodes: number;
  maxDepth: number;
  guesses: number;
  /** Hardest human technique required; GUESS_TIER when logic ran out. */
  hardestTier: number;
  hardestTechnique: Technique | null;
  logicalSteps: number;
  /** Technique applications beyond naked/hidden singles. */
  advancedSteps: number;
  solvedLogically: boolean;
  score: number;
}

export interface PuzzleSeeds {
  difficulty: number;
  board: number;
  removal: number;
}

export interface SudokuPuzzle {
  id: string;
  date: string;
  version: number;
  difficulty: Difficulty;
  puzzle: Board;
  solution: Board;
  clues: number;
  /** Which deterministic retry produced this grid. */
  attempt: number;
  /** True when no attempt landed in the target band and we took the closest. */
  fallback: boolean;
  seeds: PuzzleSeeds;
  metrics: DifficultyMetrics;
  /** Wall-clock generation time, reported by the CLI. Never feeds generation. */
  generationMs: number;
  /** Short digest of the puzzle grid, for spotting drift at a glance. */
  fingerprint: string;
}

/** Wire/storage form: boards as 81-character strings. */
export interface SerializedSudokuPuzzle
  extends Omit<SudokuPuzzle, "puzzle" | "solution"> {
  puzzle: string;
  solution: string;
}
