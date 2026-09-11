import { BOXES, boxOf, colOf, rowOf } from "../core/board.ts";
import type { GameState } from "../game/gameState.ts";
import { notesOf } from "../game/gameState.ts";
import { el } from "./dom.ts";

/**
 * The 9x9 grid.
 *
 * Cells are real buttons so they are keyboard- and screen-reader-reachable
 * for free. Only the selected cell is in the tab order (roving tabindex);
 * arrows move within the grid, so a keyboard user tabs into the board once
 * rather than 81 times.
 */
export interface BoardCallbacks {
  onSelect(index: number): void;
  onDigit(index: number, digit: number): void;
  onErase(index: number): void;
}

export class BoardView {
  readonly root: HTMLElement;
  private readonly cells: HTMLButtonElement[] = [];
  private readonly noteHolders: HTMLElement[] = [];
  private readonly valueHolders: HTMLElement[] = [];
  private readonly callbacks: BoardCallbacks;

  constructor(callbacks: BoardCallbacks) {
    this.callbacks = callbacks;
    this.root = el("div", {
      class: "board",
      role: "grid",
      "aria-label": "Sudoku grid",
    });

    for (let row = 0; row < 9; row++) {
      // display:contents keeps the accessibility rows without disturbing
      // the flat 9-column CSS grid.
      const rowNode = el("div", { role: "row", style: "display: contents" });

      for (let col = 0; col < 9; col++) {
        const index = row * 9 + col;
        const value = el("span", { class: "value" });
        const notes = el("div", { class: "notes", "aria-hidden": "true" });

        const cell = el(
          "button",
          {
            class: "cell",
            type: "button",
            role: "gridcell",
            "data-index": index,
            "data-row": row,
            "data-col": col,
            tabindex: index === 0 ? 0 : -1,
          },
          [value, notes],
        );

        cell.addEventListener("click", () => this.callbacks.onSelect(index));
        cell.addEventListener("keydown", (event) => this.onKeyDown(event, index));

        this.cells.push(cell);
        this.valueHolders.push(value);
        this.noteHolders.push(notes);
        rowNode.append(cell);
      }
      this.root.append(rowNode);
    }
  }

  focusCell(index: number): void {
    this.cells[index]?.focus();
  }

  render(state: GameState, selected: number, highlightDigit: number): void {
    const conflicts = state.allConflicts();
    const peers = selected >= 0 ? peerSet(selected) : null;

    for (let i = 0; i < 81; i++) {
      const cell = this.cells[i];
      const value = state.values[i];
      const given = state.isGiven(i);

      const classes = ["cell"];
      if (given) classes.push("given");
      if (i === selected) classes.push("selected");
      else if (peers?.has(i)) classes.push("peer");
      if (value !== 0 && value === highlightDigit) classes.push("same-digit");
      if (conflicts.has(i)) classes.push("conflict");
      if (state.revealed.has(i)) classes.push("revealed");
      cell.className = classes.join(" ");

      cell.tabIndex = i === selected || (selected < 0 && i === 0) ? 0 : -1;
      cell.setAttribute("aria-selected", String(i === selected));
      if (given) cell.setAttribute("aria-readonly", "true");
      else cell.removeAttribute("aria-readonly");
      cell.setAttribute("aria-label", describeCell(i, value, given, conflicts.has(i)));

      this.valueHolders[i].textContent = value === 0 ? "" : String(value);

      const noteHolder = this.noteHolders[i];
      const notes = value === 0 ? state.notes[i] : 0;
      if (notes === 0) {
        if (noteHolder.childElementCount > 0) noteHolder.replaceChildren();
        continue;
      }
      const marks = notesOf(notes);
      noteHolder.replaceChildren(
        ...Array.from({ length: 9 }, (_, k) => {
          const digit = k + 1;
          const on = marks.includes(digit);
          return el("span", {
            class: on && digit === highlightDigit ? "hi" : "",
            text: on ? String(digit) : "",
          });
        }),
      );
    }
  }

  private onKeyDown(event: KeyboardEvent, index: number): void {
    const row = rowOf(index);
    const col = colOf(index);

    const move = (nextRow: number, nextCol: number) => {
      event.preventDefault();
      const next = clamp(nextRow) * 9 + clamp(nextCol);
      this.callbacks.onSelect(next);
      this.focusCell(next);
    };

    switch (event.key) {
      case "ArrowUp":
        return move(row - 1, col);
      case "ArrowDown":
        return move(row + 1, col);
      case "ArrowLeft":
        return move(row, col - 1);
      case "ArrowRight":
        return move(row, col + 1);
      case "Home":
        return move(row, 0);
      case "End":
        return move(row, 8);
      case "Backspace":
      case "Delete":
        event.preventDefault();
        return this.callbacks.onErase(index);
      default:
        break;
    }

    if (event.key >= "1" && event.key <= "9") {
      event.preventDefault();
      this.callbacks.onDigit(index, Number(event.key));
    } else if (event.key === "0") {
      event.preventDefault();
      this.callbacks.onErase(index);
    }
  }
}

function clamp(value: number): number {
  return Math.min(8, Math.max(0, value));
}

function peerSet(index: number): Set<number> {
  const peers = new Set<number>();
  const row = rowOf(index);
  const col = colOf(index);
  for (let k = 0; k < 9; k++) {
    peers.add(row * 9 + k);
    peers.add(k * 9 + col);
  }
  for (const cell of BOXES[boxOf(index)]) peers.add(cell);
  peers.delete(index);
  return peers;
}

/** "Row 4, column 6, 7, clue" - the wording §31 asks for. */
function describeCell(
  index: number,
  value: number,
  given: boolean,
  conflict: boolean,
): string {
  const position = `Row ${rowOf(index) + 1}, column ${colOf(index) + 1}`;
  if (value === 0) return `${position}, empty`;
  const kind = given ? "fixed clue" : conflict ? "conflict" : "your entry";
  return `${position}, value ${value}, ${kind}`;
}
