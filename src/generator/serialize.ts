import { deserializeBoard, serializeBoard } from "../core/board.ts";
import type { SerializedSudokuPuzzle, SudokuPuzzle } from "./types.ts";

export function serializePuzzle(puzzle: SudokuPuzzle): SerializedSudokuPuzzle {
  return {
    ...puzzle,
    puzzle: serializeBoard(puzzle.puzzle),
    solution: serializeBoard(puzzle.solution),
  };
}

export function deserializePuzzle(data: SerializedSudokuPuzzle): SudokuPuzzle {
  return {
    ...data,
    puzzle: deserializeBoard(data.puzzle),
    solution: deserializeBoard(data.solution),
  };
}
