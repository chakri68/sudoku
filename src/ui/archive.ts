import {
  addDays,
  daysInMonth,
  formatDateParts,
  getTodayDateString,
  isWithinRange,
  monthName,
  parseDateString,
  weekdayOf,
} from "../generator/date.ts";
import { loadCompletions } from "../game/streak.ts";
import { el } from "./dom.ts";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Month calendar. There is no puzzle database to query -- every date in
 * history is playable because the date *is* the puzzle, so the only state a
 * day carries is whether this browser has finished it.
 */
export class ArchiveCalendar {
  readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly label: HTMLElement;
  private readonly onPick: (date: string) => void;
  private cursor: { year: number; month: number };
  private active: string;

  constructor(initialDate: string, onPick: (date: string) => void) {
    this.onPick = onPick;
    this.active = initialDate;
    const parts = parseDateString(initialDate) ?? { year: 2026, month: 1, day: 1 };
    this.cursor = { year: parts.year, month: parts.month };

    this.label = el("span", { class: "cal-month" });
    const prev = el("button", { class: "icon-btn", type: "button", "aria-label": "Previous month", text: "<" });
    const next = el("button", { class: "icon-btn", type: "button", "aria-label": "Next month", text: ">" });
    prev.addEventListener("click", () => this.shiftMonth(-1));
    next.addEventListener("click", () => this.shiftMonth(1));

    this.grid = el("div", { class: "cal" });

    this.root = el("div", {}, [
      el("div", { class: "cal-head" }, [prev, this.label, next]),
      this.grid,
      el("div", { class: "legend" }, [
        el("span", { text: "✓ solved" }),
        el("span", { text: "○ today" }),
      ]),
    ]);

    this.render();
  }

  setActive(date: string): void {
    this.active = date;
    const parts = parseDateString(date);
    if (parts) this.cursor = { year: parts.year, month: parts.month };
    this.render();
  }

  render(): void {
    const { year, month } = this.cursor;
    const today = getTodayDateString();
    const completions = loadCompletions();

    this.label.textContent = `${monthName(month)} ${year}`;

    const first = formatDateParts({ year, month, day: 1 });
    const leading = weekdayOf(first);
    const total = daysInMonth(year, month);

    const nodes: HTMLElement[] = DOW.map((d) =>
      el("div", { class: "dow", text: d, "aria-hidden": "true" }),
    );

    for (let i = 0; i < leading; i++) {
      nodes.push(el("button", { class: "cal-day blank", type: "button", tabindex: -1, "aria-hidden": "true" }));
    }

    for (let day = 1; day <= total; day++) {
      const date = formatDateParts({ year, month, day });
      const done = completions[date] !== undefined;
      const isToday = date === today;
      const playable = isWithinRange(date);

      const classes = ["cal-day"];
      if (done) classes.push("done");
      if (isToday) classes.push("today");
      if (date === this.active) classes.push("active");

      const button = el("button", {
        class: classes.join(" "),
        type: "button",
        text: done ? "✓" : String(day),
        disabled: !playable,
        "aria-label": `${monthName(month)} ${day}, ${year}${done ? ", solved" : ""}${isToday ? ", today" : ""}`,
        "aria-current": isToday ? "date" : undefined,
      });
      button.addEventListener("click", () => this.onPick(date));
      nodes.push(button);
    }

    this.grid.replaceChildren(...nodes);
  }

  private shiftMonth(delta: number): void {
    const { year, month } = this.cursor;
    const anchor = formatDateParts({ year, month, day: 1 });
    const moved =
      delta > 0
        ? addDays(anchor, daysInMonth(year, month))
        : addDays(anchor, -1);
    const parts = parseDateString(moved);
    if (!parts) return;
    this.cursor = { year: parts.year, month: parts.month };
    this.render();
  }
}
