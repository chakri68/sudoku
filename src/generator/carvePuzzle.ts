import { countClues, type Board } from "../core/board.ts";
import { countSolutions } from "../solver/countSolutions.ts";
import type { RNG } from "./rng.ts";

/**
 * Removes clues while keeping the solution unique.
 *
 * Uniqueness is maintained as an invariant rather than checked at the end:
 * a cell is only cleared if the grid still has exactly one solution without
 * it. So the puzzle is unique by construction and can never be published
 * ambiguous.
 *
 * Two passes. The first pulls cells in 180-degree-rotational pairs, which is
 * how printed Sudoku looks and costs nothing. The second only runs if the
 * symmetric pass could not reach the clue floor, and drops the symmetry to
 * squeeze the grid further -- that is how expert grids get sparse.
 */
export function carvePuzzle(solved: Board, rng: RNG, clueFloor: number): Board {
  const puzzle = solved.slice();
  let clues = 81;

  for (const pair of rng.shuffle(buildSymmetricPairs())) {
    if (clues <= clueFloor) break;

    if (pair.length === 2 && clues - 2 >= clueFloor && tryRemove(puzzle, pair)) {
      clues -= 2;
      continue;
    }
    for (const index of pair) {
      if (clues <= clueFloor) break;
      if (tryRemove(puzzle, [index])) clues--;
    }
  }

  if (clues > clueFloor) {
    const remaining: number[] = [];
    for (let i = 0; i < 81; i++) if (puzzle[i] !== 0) remaining.push(i);

    for (const index of rng.shuffle(remaining)) {
      if (clues <= clueFloor) break;
      if (tryRemove(puzzle, [index])) clues--;
    }
  }

  return puzzle;
}

/** Clears the cells if the grid stays uniquely solvable; restores otherwise. */
function tryRemove(puzzle: Board, indexes: readonly number[]): boolean {
  const previous = indexes.map((i) => puzzle[i]);
  for (const index of indexes) puzzle[index] = 0;

  if (countSolutions(puzzle, 2) === 1) return true;

  indexes.forEach((index, k) => {
    puzzle[index] = previous[k];
  });
  return false;
}

/** `[i, 80-i]` groups, with the centre cell alone. Stable order. */
function buildSymmetricPairs(): number[][] {
  const pairs: number[][] = [];
  for (let i = 0; i < 41; i++) {
    const mirror = 80 - i;
    pairs.push(i === mirror ? [i] : [i, mirror]);
  }
  return pairs;
}

export function verifyUniqueness(puzzle: Board): boolean {
  return countSolutions(puzzle, 2) === 1;
}

export { countClues };
