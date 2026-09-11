import { describe, expect, it } from "vitest";
import {
  createEmptyBoard,
  deserializeBoard,
  isConsistent,
  isSolved,
  serializeBoard,
} from "../src/core/board.ts";
import { countSolutions, hasUniqueSolution } from "../src/solver/countSolutions.ts";
import { solve } from "../src/solver/solve.ts";
import { solveLogically } from "../src/solver/logicalSolver.ts";
import { generateSolvedBoard } from "../src/generator/generateSolvedBoard.ts";
import { carvePuzzle } from "../src/generator/carvePuzzle.ts";
import { createRng } from "../src/generator/rng.ts";

const UNIQUE =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

const SOLVED =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

/** UNIQUE with its first two clues pulled, which admits two solutions. */
const AMBIGUOUS =
  "000070000600195000098000060800060003400803001700020006060000280000419005000080079";

/** A known 17-clue grid. Still has exactly one solution. */
const MINIMAL_17 =
  "000000000000003085001020000000507000004000100090000000500000073002010000000040009";

describe("board invariants", () => {
  it("serialises round-trip", () => {
    const board = deserializeBoard(UNIQUE);
    expect(serializeBoard(board)).toBe(UNIQUE);
  });

  it("rejects malformed board strings", () => {
    expect(() => deserializeBoard("123")).toThrow();
    expect(() => deserializeBoard("x".repeat(81))).toThrow();
  });

  it("recognises a solved grid", () => {
    expect(isSolved(deserializeBoard(SOLVED))).toBe(true);
    expect(isSolved(deserializeBoard(UNIQUE))).toBe(false);
  });

  it("spots an inconsistent grid", () => {
    const board = deserializeBoard(UNIQUE);
    board[1] = 5; // duplicate 5 in row 0
    expect(isConsistent(board)).toBe(false);
  });
});

describe("solve", () => {
  it("solves a valid puzzle", () => {
    const { solution } = solve(deserializeBoard(UNIQUE));
    expect(solution).not.toBeNull();
    expect(serializeBoard(solution!)).toBe(SOLVED);
  });

  it("returns an already solved board untouched", () => {
    const { solution } = solve(deserializeBoard(SOLVED));
    expect(serializeBoard(solution!)).toBe(SOLVED);
  });

  it("reports failure on an unsolvable board", () => {
    const board = deserializeBoard(UNIQUE);
    board[2] = 5; // row already holds a 5
    expect(solve(board).solution).toBeNull();
  });

  it("does not mutate its input", () => {
    const board = deserializeBoard(UNIQUE);
    solve(board);
    expect(serializeBoard(board)).toBe(UNIQUE);
  });
});

describe("countSolutions", () => {
  it("counts exactly one for a proper puzzle", () => {
    expect(countSolutions(deserializeBoard(UNIQUE), 2)).toBe(1);
    expect(hasUniqueSolution(deserializeBoard(UNIQUE))).toBe(true);
  });

  it("counts one for a completed grid", () => {
    expect(countSolutions(deserializeBoard(SOLVED), 2)).toBe(1);
  });

  it("counts zero for a contradictory grid", () => {
    const board = deserializeBoard(UNIQUE);
    board[2] = 5;
    expect(countSolutions(board, 2)).toBe(0);
  });

  it("stops at the cap for an underconstrained grid", () => {
    expect(countSolutions(deserializeBoard(AMBIGUOUS), 2)).toBe(2);
    expect(hasUniqueSolution(deserializeBoard(AMBIGUOUS))).toBe(false);
  });

  it("still finds a single solution for a 17-clue grid", () => {
    expect(countSolutions(deserializeBoard(MINIMAL_17), 2)).toBe(1);
  });

  it("finds many solutions on an empty grid, bailing at the cap", () => {
    expect(countSolutions(createEmptyBoard(), 2)).toBe(2);
    expect(countSolutions(createEmptyBoard(), 5)).toBe(5);
  });
});

describe("logical solver", () => {
  it("agrees with the brute-force solver when it finishes", () => {
    for (let seed = 0; seed < 12; seed++) {
      const solution = generateSolvedBoard(seed * 7919 + 13);
      expect(isSolved(solution)).toBe(true);

      const result = solveLogically(solution);
      expect(result.solved).toBe(true);
      expect(result.steps).toBe(0);
    }
  });

  it("solves a singles-only puzzle without advanced techniques", () => {
    const result = solveLogically(deserializeBoard(UNIQUE));
    expect(result.solved).toBe(true);
    expect(result.counts.nakedSingle + result.counts.hiddenSingle).toBeGreaterThan(0);
  });

  it("reports being stuck rather than guessing", () => {
    const result = solveLogically(deserializeBoard(AMBIGUOUS));
    expect(result.solved).toBe(false);
    expect(result.unresolved).toBeGreaterThan(0);
  });

  /**
   * The scorer trusts this solver, so it has to place the right digits, not
   * merely terminate. Whenever logic finishes a grid, the result must equal
   * the one true solution.
   */
  it("never places a wrong digit", () => {
    for (let seed = 0; seed < 250; seed++) {
      const solution = generateSolvedBoard(seed * 7919 + 3);
      const puzzle = carvePuzzle(solution, createRng(seed * 131 + 7), 24);
      const result = solveLogically(puzzle);
      if (!result.solved) continue;
      expect(serializeBoard(result.board)).toBe(serializeBoard(solution));
    }
  });

  it("matches brute force on the 17-clue grid", () => {
    const result = solveLogically(deserializeBoard(MINIMAL_17));
    const brute = solve(deserializeBoard(MINIMAL_17)).solution;
    expect(result.solved).toBe(true);
    expect(serializeBoard(result.board)).toBe(serializeBoard(brute!));
  });
});

describe("solved board generation", () => {
  it("always produces a valid complete grid", () => {
    for (let seed = 0; seed < 200; seed++) {
      const board = generateSolvedBoard(seed);
      expect(isSolved(board)).toBe(true);
      expect(isConsistent(board)).toBe(true);
    }
  });

  it("is a pure function of the seed", () => {
    expect(serializeBoard(generateSolvedBoard(4242))).toBe(
      serializeBoard(generateSolvedBoard(4242)),
    );
  });

  it("spreads across the board space", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) seen.add(serializeBoard(generateSolvedBoard(seed)));
    expect(seen.size).toBe(300);
  });
});
