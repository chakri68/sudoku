import { el } from "./dom.ts";

/**
 * Digits 1-9 with a running count of how many of each are still unplaced.
 * The count is the small number in the corner; a digit that is fully placed
 * dims rather than disappearing, so the row never reflows under your thumb.
 */
export class Keypad {
  readonly root: HTMLElement;
  private readonly keys: HTMLButtonElement[] = [];
  private readonly counters: HTMLElement[] = [];

  constructor(onDigit: (digit: number) => void) {
    this.root = el("div", { class: "keypad", role: "group", "aria-label": "Digits" });

    for (let digit = 1; digit <= 9; digit++) {
      const counter = el("span", { class: "left", "aria-hidden": "true" });
      const key = el(
        "button",
        {
          class: "key",
          type: "button",
          "data-digit": digit,
          "aria-label": `Enter ${digit}`,
        },
        [String(digit), counter],
      );
      key.addEventListener("click", () => onDigit(digit));

      this.keys.push(key);
      this.counters.push(counter);
      this.root.append(key);
    }
  }

  render(remaining: readonly number[], highlightDigit: number): void {
    for (let digit = 1; digit <= 9; digit++) {
      const left = remaining[digit] ?? 0;
      const key = this.keys[digit - 1];
      key.classList.toggle("exhausted", left <= 0);
      key.classList.toggle("on", digit === highlightDigit);
      this.counters[digit - 1].textContent = left > 0 ? String(left) : "";
    }
  }
}
