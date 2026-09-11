import { countClues, type Board } from "../core/board.ts";
import { solveLogically } from "../solver/logicalSolver.ts";
import { solve } from "../solver/solve.ts";
import { createRng } from "./rng.ts";
import { DIFFICULTIES, type Difficulty, type DifficultyMetrics } from "./types.ts";

/**
 * Difficulty is scored, not counted, because clue count is a poor proxy: a
 * 28-clue grid that falls to hidden singles is gentler than a 34-clue grid
 * that stalls.
 *
 * The score is a sum of step costs, not the single hardest technique used.
 * Max-technique was tried first and turned out bimodal -- sampled grids
 * either solve on singles alone or run out of logic entirely, with almost
 * nothing in between, which left two of the four bands unreachable. Summing
 * the work instead tracks how much hunting a solve actually takes, and that
 * varies smoothly.
 *
 * Naked singles carry no cost of their own; they are already counted by the
 * empty-cell term, since there is roughly one per empty cell.
 *
 * These weights were fitted to sampled grids (`npm run sudoku -- --tune`).
 * They decide which band a date lands in, so they belong to
 * GENERATOR_VERSION: changing them is a generator change.
 */
const EMPTY_CELL_COST = 0.5;
const HIDDEN_SINGLE_COST = 2.5;
const LOCKED_CANDIDATE_COST = 10;
const SUBSET_COST = 14;
const XWING_COST = 20;

/** Charged when the technique set runs out and a solver would have to branch. */
const STUCK_BASE = 18;
const STUCK_PER_UNRESOLVED = 0.8;
const STUCK_PER_GUESS = 0.25;
const MAX_COUNTED_GUESSES = 120;

export interface DifficultyProfile {
  /**
   * Clue floors to try, in attempt order. Carving stops at the floor, so this
   * is the main lever on how hard a grid comes out; sweeping it gives the
   * retry loop a second dimension beyond the board seed.
   */
  clueFloors: readonly number[];
  /** Upper bound of the score band, exclusive. */
  maxScore: number;
  /** Relative frequency in the daily schedule. */
  weight: number;
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { clueFloors: [42, 40, 38, 41, 39, 37, 36], maxScore: 26, weight: 20 },
  medium: { clueFloors: [33, 32, 34, 31, 30, 29], maxScore: 45, weight: 40 },
  hard: { clueFloors: [28, 27, 29, 26, 30], maxScore: 85, weight: 30 },
  expert: { clueFloors: [24, 23, 25, 22], maxScore: Infinity, weight: 10 },
};

/** Weighted pick from the daily schedule: 20/40/30/10. */
export function selectTargetDifficulty(seed: number): Difficulty {
  const rng = createRng(seed);
  const weights = DIFFICULTIES.map((d) => DIFFICULTY_PROFILES[d].weight);
  return DIFFICULTIES[rng.weighted(weights)];
}

/**
 * Clue floor for a given retry, cycling through the profile's list.
 *
 * `rotation` shifts where the cycle starts. Without it every easy date would
 * match on attempt 0 and therefore land on the identical clue count forever;
 * deriving the shift from the date's difficulty seed spreads them out while
 * keeping the choice reproducible.
 */
export function clueFloorForAttempt(
  difficulty: Difficulty,
  attempt: number,
  rotation = 0,
): number {
  const floors = DIFFICULTY_PROFILES[difficulty].clueFloors;
  return floors[(attempt + rotation) % floors.length];
}

export function measureDifficulty(puzzle: Board): DifficultyMetrics {
  const clues = countClues(puzzle);
  const emptyCells = 81 - clues;

  const logical = solveLogically(puzzle);
  const { stats } = solve(puzzle);
  const counts = logical.counts;

  let score =
    EMPTY_CELL_COST * emptyCells +
    HIDDEN_SINGLE_COST * counts.hiddenSingle +
    LOCKED_CANDIDATE_COST * counts.lockedCandidates +
    SUBSET_COST * (counts.nakedPair + counts.hiddenPair + counts.nakedTriple) +
    XWING_COST * counts.xWing;

  if (!logical.solved) {
    score +=
      STUCK_BASE +
      STUCK_PER_UNRESOLVED * logical.unresolved +
      STUCK_PER_GUESS * Math.min(stats.guesses, MAX_COUNTED_GUESSES);
  }

  const advancedSteps = logical.steps - counts.nakedSingle - counts.hiddenSingle;

  return {
    clues,
    emptyCells,
    solverNodes: stats.nodes,
    maxDepth: stats.maxDepth,
    guesses: stats.guesses,
    hardestTier: logical.hardestTier,
    hardestTechnique: logical.hardestTechnique,
    logicalSteps: logical.steps,
    advancedSteps: Math.max(0, advancedSteps),
    solvedLogically: logical.solved,
    score: Math.round(score * 100) / 100,
  };
}

export function classifyScore(score: number): Difficulty {
  for (const difficulty of DIFFICULTIES) {
    if (score < DIFFICULTY_PROFILES[difficulty].maxScore) return difficulty;
  }
  return "expert";
}

export function matchesTargetDifficulty(
  metrics: DifficultyMetrics,
  target: Difficulty,
): boolean {
  return classifyScore(metrics.score) === target;
}

/** Distance from the target band; 0 when inside it. Picks the fallback. */
export function bandDistance(score: number, target: Difficulty): number {
  const index = DIFFICULTIES.indexOf(target);
  const lower = index === 0 ? 0 : DIFFICULTY_PROFILES[DIFFICULTIES[index - 1]].maxScore;
  const upper = DIFFICULTY_PROFILES[target].maxScore;

  if (score >= lower && score < upper) return 0;
  return score < lower ? lower - score : score - upper;
}

export function difficultyLabel(difficulty: Difficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}
