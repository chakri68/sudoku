import { createEmptyBoard, indexOf, type Board } from "../core/board.ts";

/**
 * The seed grid every puzzle descends from:
 *
 *   1 2 3 | 4 5 6 | 7 8 9
 *   4 5 6 | 7 8 9 | 1 2 3
 *   7 8 9 | 1 2 3 | 4 5 6
 *   ------+-------+------
 *   2 3 4 | 5 6 7 | 8 9 1
 *   ...
 *
 * Row r is the digits shifted by `3*(r%3) + floor(r/3)`, which is the
 * standard construction: rows inside a band step by 3, bands step by 1.
 */
export function createCanonicalBoard(): Board {
  const board = createEmptyBoard();
  for (let row = 0; row < 9; row++) {
    const shift = 3 * (row % 3) + ((row / 3) | 0);
    for (let col = 0; col < 9; col++) {
      board[indexOf(row, col)] = ((shift + col) % 9) + 1;
    }
  }
  return board;
}
