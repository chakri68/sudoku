import {
  addDays,
  formatLongDate,
  getTodayDateString,
  isWithinRange,
  weekdayName,
} from "../generator/date.ts";
import { difficultyLabel } from "../generator/difficulty.ts";
import type { SudokuPuzzle } from "../generator/types.ts";
import { GENERATOR_VERSION } from "../generator/version.ts";
import { GameState } from "../game/gameState.ts";
import { restoreProgress, saveProgress } from "../game/persistence.ts";
import { loadCompletions, recordCompletion, summarizeStreak } from "../game/streak.ts";
import { Timer, formatDuration } from "../game/timer.ts";
import { ArchiveCalendar } from "../ui/archive.ts";
import { BoardView } from "../ui/board.ts";
import { buildCompletionContent } from "../ui/completion.ts";
import { clear, el } from "../ui/dom.ts";
import { Keypad } from "../ui/keypad.ts";
import { Modal } from "../ui/modal.ts";
import { Panel, statRow } from "../ui/panel.ts";
import { buildShareText, shareResult } from "../ui/share.ts";
import { prewarm, requestPuzzle } from "./generatorClient.ts";
import { Router, buildPath, type Route } from "./router.ts";

const AUTOSAVE_DELAY_MS = 400;
const MIN_SIDEBAR = 300;
const MAX_SIDEBAR = 620;

export class App {
  private readonly mount: HTMLElement;
  private readonly router = new Router();
  private readonly modal = new Modal();

  private route: Route | null = null;
  /**
   * Date of the puzzle actually on screen. The archive and about routes carry
   * no date of their own, so without this, opening one from an archived day
   * would quietly swap today's puzzle in underneath the overlay.
   */
  private activeDate: string | null = null;
  private puzzle: SudokuPuzzle | null = null;
  private state: GameState | null = null;
  private timer: Timer;

  private selected = -1;
  private notesMode = false;
  /** Guards against a slow generation landing after the user moved on. */
  private loadToken = 0;
  private saveHandle: ReturnType<typeof setTimeout> | null = null;

  private board!: BoardView;
  private keypad!: Keypad;
  private shell!: HTMLElement;
  private stage!: HTMLElement;
  private sidebar!: HTMLElement;
  private dateLabel!: HTMLElement;
  private weekdayLabel!: HTMLElement;
  private difficultyChip!: HTMLElement;
  private clock!: HTMLElement;
  private mistakeLabel!: HTMLElement;
  private hintLabel!: HTMLElement;
  private notice!: HTMLElement;

  private notesButton!: HTMLButtonElement;
  private undoButton!: HTMLButtonElement;
  private redoButton!: HTMLButtonElement;
  private pauseButton!: HTMLButtonElement;
  private prevButton!: HTMLButtonElement;
  private nextButton!: HTMLButtonElement;

  private sessionBody!: HTMLElement;
  private streakBody!: HTMLElement;
  private calendar!: ArchiveCalendar;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.timer = new Timer(0, (ms) => this.onTick(ms));
  }

  start(): void {
    this.buildLayout();
    // Dismissing an overlay by Escape or backdrop must clear its route too,
    // or the URL keeps claiming /archive after the calendar is gone.
    this.modal.onClose = () => {
      if (this.route && this.route.view !== "puzzle") this.navigate({ view: "puzzle" });
    };
    this.attachGlobalKeys();
    this.attachLifecycle();
    prewarm();
    this.router.start((route) => void this.onRoute(route));
    void this.runBootSequence();
  }

  /* ------------------------------------------------------------------ */
  /* Layout                                                              */
  /* ------------------------------------------------------------------ */

  private buildLayout(): void {
    clear(this.mount);

    // Brand ------------------------------------------------------------
    const brand = el("div", { class: "brand" }, [
      el("h1", { text: "SUDOKU" }),
      el("span", { class: "version", text: `v${GENERATOR_VERSION}` }),
    ]);

    this.dateLabel = el("span", { class: "date" });
    this.weekdayLabel = el("span", { class: "weekday" });
    this.difficultyChip = el("span", { class: "chip on" });

    this.prevButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Previous day", text: "<" });
    this.nextButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Next day", text: ">" });
    const todayButton = el("button", { class: "btn ghost", type: "button", text: "TODAY" });
    const archiveButton = el("button", { class: "btn ghost", type: "button", text: "ARCHIVE" });
    const aboutButton = el("button", { class: "btn ghost", type: "button", text: "ABOUT" });

    this.prevButton.addEventListener("click", () => this.stepDay(-1));
    this.nextButton.addEventListener("click", () => this.stepDay(1));
    todayButton.addEventListener("click", () => this.navigate({ date: getTodayDateString() }));
    archiveButton.addEventListener("click", () => this.navigate({ view: "archive" }));
    aboutButton.addEventListener("click", () => this.navigate({ view: "about" }));

    const topbar = el("header", { class: "topbar" }, [
      brand,
      el("div", { class: "dateline" }, [this.dateLabel, this.weekdayLabel, this.difficultyChip]),
      el("div", { class: "spacer" }),
      el("nav", { class: "nav", "aria-label": "Puzzle navigation" }, [
        this.prevButton,
        todayButton,
        this.nextButton,
        archiveButton,
        aboutButton,
      ]),
    ]);

    // Board ------------------------------------------------------------
    this.board = new BoardView({
      onSelect: (index) => this.select(index),
      onDigit: (index, digit) => this.enterDigit(index, digit),
      onErase: (index) => this.eraseCell(index),
    });

    this.stage = el("section", { class: "stage" }, [
      el("div", { class: "board-wrap" }, [this.board.root]),
    ]);

    // Control bar ------------------------------------------------------
    this.keypad = new Keypad((digit) => this.enterDigit(this.selected, digit));

    this.notesButton = el("button", { class: "btn", type: "button", text: "NOTES", "aria-pressed": "false" });
    this.undoButton = el("button", { class: "btn", type: "button", text: "UNDO" });
    this.redoButton = el("button", { class: "btn", type: "button", text: "REDO" });
    const eraseButton = el("button", { class: "btn", type: "button", text: "ERASE" });
    const hintButton = el("button", { class: "btn", type: "button", text: "HINT" });

    this.notesButton.addEventListener("click", () => this.toggleNotesMode());
    this.undoButton.addEventListener("click", () => this.undo());
    this.redoButton.addEventListener("click", () => this.redo());
    eraseButton.addEventListener("click", () => this.eraseCell(this.selected));
    hintButton.addEventListener("click", () => this.useHint());

    this.clock = el("span", { class: "clock", text: "00:00" });
    this.pauseButton = el("button", { class: "icon-btn", type: "button", "aria-label": "Pause timer", text: "||" });
    this.pauseButton.addEventListener("click", () => this.togglePause());

    this.mistakeLabel = el("span", { class: "v", text: "0" });
    this.hintLabel = el("span", { class: "v", text: "0" });

    const controlbar = el("div", { class: "controlbar" }, [
      this.keypad.root,
      el("div", { class: "tools" }, [
        this.notesButton,
        this.undoButton,
        this.redoButton,
        eraseButton,
        hintButton,
      ]),
      el("div", { class: "stats" }, [
        el("span", { class: "stat" }, [el("span", { class: "label", text: "err" }), this.mistakeLabel]),
        el("span", { class: "stat" }, [el("span", { class: "label", text: "hint" }), this.hintLabel]),
        el("span", { class: "stat" }, [this.clock, this.pauseButton]),
      ]),
    ]);

    // Sidebar ----------------------------------------------------------
    const sessionPanel = new Panel("Session");
    this.sessionBody = sessionPanel.body;

    const streakPanel = new Panel("Streak");
    this.streakBody = streakPanel.body;

    const archivePanel = new Panel("Archive");
    this.calendar = new ArchiveCalendar(getTodayDateString(), (date) => this.navigate({ date }));
    archivePanel.body.append(this.calendar.root);

    const aboutPanel = new Panel("About", true);
    aboutPanel.body.append(buildAboutContent());

    this.notice = el("div", { class: "notice", role: "status" });

    this.sidebar = el("aside", { class: "sidebar", "aria-label": "Puzzle details" }, [
      sessionPanel.root,
      streakPanel.root,
      archivePanel.root,
      aboutPanel.root,
      this.notice,
    ]);

    const resizer = el("div", {
      class: "resizer",
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Resize sidebar",
      tabindex: 0,
    });
    this.attachResizer(resizer);

    const boot = el("div", { class: "boot", id: "boot" }, [
      el("div", { class: "boot-title", text: "SUDOKU" }),
    ]);

    this.shell = el("div", { class: "shell booting" }, [
      boot,
      topbar,
      el("div", { class: "body" }, [
        el("div", { class: "main" }, [this.stage, controlbar]),
        resizer,
        this.sidebar,
      ]),
    ]);

    this.mount.append(this.shell, this.modal.root);
  }

  /* ------------------------------------------------------------------ */
  /* Routing & loading                                                   */
  /* ------------------------------------------------------------------ */

  private async onRoute(route: Route): Promise<void> {
    const previous = this.route;
    this.route = route;

    // Overlays float above whatever puzzle is already loaded.
    const wanted = route.view === "puzzle" ? route.date : (this.activeDate ?? route.date);
    if (wanted !== this.activeDate || previous?.version !== route.version) {
      await this.loadPuzzle({ ...route, date: wanted });
    }

    if (route.view === "archive") this.openArchiveModal();
    else if (route.view === "about") this.openAboutModal();
    else if (this.modal.isOpen && previous?.view !== "puzzle") this.modal.close();
  }

  private async loadPuzzle(route: Route): Promise<void> {
    const token = ++this.loadToken;

    this.flushSave();
    this.timer.dispose();
    this.setNotice("");
    this.stage.setAttribute("aria-busy", "true");

    this.dateLabel.textContent = route.date;
    this.weekdayLabel.textContent = weekdayName(route.date);
    this.difficultyChip.textContent = "generating";

    let puzzle: SudokuPuzzle;
    try {
      puzzle = await requestPuzzle(route.date, route.version);
    } catch (error) {
      if (token !== this.loadToken) return;
      this.stage.removeAttribute("aria-busy");
      this.setNotice(
        `Could not generate the puzzle for ${route.date}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (token !== this.loadToken) return;

    this.puzzle = puzzle;
    this.activeDate = puzzle.date;
    this.state = new GameState(puzzle);
    restoreProgress(this.state);

    this.selected = this.firstEmptyCell();
    this.notesMode = false;
    this.timer = new Timer(this.state.elapsedMs, (ms) => this.onTick(ms));

    this.stage.removeAttribute("aria-busy");
    this.difficultyChip.textContent = difficultyLabel(puzzle.difficulty);
    this.dateLabel.textContent = formatLongDate(puzzle.date);
    this.weekdayLabel.textContent = `${puzzle.clues} clues`;
    this.calendar.setActive(puzzle.date);

    this.prevButton.disabled = !isWithinRange(addDays(puzzle.date, -1));
    this.nextButton.disabled = !isWithinRange(addDays(puzzle.date, 1));

    this.render();
    if (this.state.completed) this.onTick(this.state.elapsedMs);
  }

  private navigate(partial: Partial<Route>): void {
    const date = partial.date ?? this.activeDate ?? this.route?.date ?? getTodayDateString();
    this.router.go({
      view: partial.view ?? "puzzle",
      date,
      version: partial.version ?? this.route?.version ?? GENERATOR_VERSION,
    });
  }

  private stepDay(delta: number): void {
    const current = this.activeDate ?? getTodayDateString();
    const next = addDays(current, delta);
    if (isWithinRange(next)) this.navigate({ date: next });
  }

  /* ------------------------------------------------------------------ */
  /* Interaction                                                         */
  /* ------------------------------------------------------------------ */

  private select(index: number): void {
    this.selected = index;
    this.render();
  }

  private enterDigit(index: number, digit: number): void {
    const state = this.state;
    if (!state || index < 0 || state.completed) return;

    this.timer.start();
    const changed = this.notesMode
      ? state.toggleNote(index, digit)
      : state.setValue(index, state.values[index] === digit ? 0 : digit);

    this.selected = index;
    if (changed) this.afterMove();
    else this.render();
  }

  private eraseCell(index: number): void {
    const state = this.state;
    if (!state || index < 0) return;
    this.timer.start();
    if (state.erase(index)) this.afterMove();
  }

  private useHint(): void {
    const state = this.state;
    if (!state || state.completed) return;

    const target = this.selected >= 0 && !state.isGiven(this.selected) && state.values[this.selected] !== state.puzzle.solution[this.selected]
      ? this.selected
      : state.findHintTarget();

    if (target < 0) return;
    this.timer.start();
    if (state.revealCell(target)) {
      this.selected = target;
      this.afterMove();
    }
  }

  private undo(): void {
    const index = this.state?.undo();
    if (index === null || index === undefined) return;
    this.selected = index;
    this.afterMove();
  }

  private redo(): void {
    const index = this.state?.redo();
    if (index === null || index === undefined) return;
    this.selected = index;
    this.afterMove();
  }

  private toggleNotesMode(): void {
    this.notesMode = !this.notesMode;
    this.notesButton.classList.toggle("on", this.notesMode);
    this.notesButton.setAttribute("aria-pressed", String(this.notesMode));
    this.render();
  }

  private togglePause(): void {
    if (this.state?.completed) return;
    this.timer.toggle();
    this.clock.classList.toggle("paused", !this.timer.running);
    this.pauseButton.setAttribute("aria-label", this.timer.running ? "Pause timer" : "Resume timer");
    this.pauseButton.textContent = this.timer.running ? "||" : ">";
  }

  private afterMove(): void {
    const state = this.state;
    if (!state) return;

    state.elapsedMs = this.timer.elapsedMs;
    const justCompleted = !state.completed && state.checkCompletion();

    this.render();
    this.scheduleSave();

    if (justCompleted) this.onCompleted();
  }

  private onCompleted(): void {
    const state = this.state;
    const puzzle = this.puzzle;
    if (!state || !puzzle) return;

    this.timer.stop();
    state.elapsedMs = this.timer.elapsedMs;
    this.flushSave();

    recordCompletion({
      date: puzzle.date,
      completedAt: state.completedAt ?? new Date().toISOString(),
      elapsedMs: state.elapsedMs,
      mistakes: state.mistakes,
      hintsUsed: state.hintsUsed,
      difficulty: puzzle.difficulty,
    });

    this.calendar.render();
    this.renderStreak();
    this.openCompletionModal();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  private render(): void {
    const state = this.state;
    if (!state) return;

    const highlight = this.selected >= 0 ? state.values[this.selected] : 0;

    this.board.render(state, this.selected, highlight);
    this.keypad.render(state.remainingCounts(), this.notesMode ? 0 : highlight);

    this.undoButton.disabled = !state.canUndo;
    this.redoButton.disabled = !state.canRedo;
    this.mistakeLabel.textContent = String(state.mistakes);
    this.hintLabel.textContent = String(state.hintsUsed);

    this.renderSession();
    this.renderStreak();
  }

  private renderSession(): void {
    const state = this.state;
    const puzzle = this.puzzle;
    if (!state || !puzzle) return;

    const filled = 81 - state.remainingCounts().reduce((a, b) => a + b, 0);

    this.sessionBody.replaceChildren(
      el("div", { class: "rows" }, [
        statRow("date", puzzle.date),
        statRow("difficulty", difficultyLabel(puzzle.difficulty), true),
        statRow("clues", String(puzzle.clues)),
        statRow("filled", `${filled} / 81`),
        statRow("mistakes", String(state.mistakes)),
        statRow("hints", String(state.hintsUsed)),
        statRow("status", state.completed ? "solved" : this.timer.running ? "running" : "paused"),
      ]),
    );
  }

  private renderStreak(): void {
    const today = getTodayDateString();
    const completions = loadCompletions();
    const streak = summarizeStreak(completions, today);

    const dots = el("div", { class: "dots" });
    for (let i = 13; i >= 0; i--) {
      const date = addDays(today, -i);
      const classes = ["dot"];
      if (completions[date]) classes.push("done");
      if (date === today) classes.push("today");
      dots.append(
        el("span", {
          class: classes.join(" "),
          title: date,
          text: completions[date] ? "✓" : "",
          "aria-hidden": "true",
        }),
      );
    }

    this.streakBody.replaceChildren(
      el("div", { class: "rows" }, [
        statRow("current", `${streak.current} days`, streak.current > 0),
        statRow("best", `${streak.best} days`),
        statRow("solved", String(streak.total)),
      ]),
      dots,
      el("div", { class: "visually-hidden", text: `Current streak ${streak.current} days, best ${streak.best}` }),
    );
  }

  private onTick(ms: number): void {
    this.clock.textContent = formatDuration(ms);
    if (this.state) this.state.elapsedMs = ms;
  }

  private setNotice(message: string): void {
    this.notice.textContent = message;
    this.notice.classList.toggle("show", message.length > 0);
  }

  /* ------------------------------------------------------------------ */
  /* Modals                                                              */
  /* ------------------------------------------------------------------ */

  private openCompletionModal(): void {
    const state = this.state;
    const puzzle = this.puzzle;
    if (!state || !puzzle) return;

    const streak = summarizeStreak();
    const content = buildCompletionContent({
      puzzle,
      elapsedMs: state.elapsedMs,
      mistakes: state.mistakes,
      hintsUsed: state.hintsUsed,
      streak,
    });

    const shareButton = el("button", { class: "btn primary", type: "button", text: "SHARE" });
    shareButton.addEventListener("click", async () => {
      const url = new URL(buildPath({ date: puzzle.date }), location.origin).toString();
      const text = buildShareText(
        {
          date: puzzle.date,
          difficulty: puzzle.difficulty,
          elapsedMs: state.elapsedMs,
          mistakes: state.mistakes,
          hintsUsed: state.hintsUsed,
          streak: streak.current,
        },
        url,
      );
      const outcome = await shareResult(text, url);
      shareButton.textContent =
        outcome === "copied" ? "COPIED" : outcome === "failed" ? "FAILED" : "SHARED";
    });

    const nextButton = el("button", { class: "btn", type: "button", text: "NEXT DAY" });
    nextButton.addEventListener("click", () => {
      this.modal.close();
      this.stepDay(1);
    });

    const closeButton = el("button", { class: "btn", type: "button", text: "CLOSE" });
    closeButton.addEventListener("click", () => this.modal.close());

    this.modal.open("SOLVED", content, [closeButton, nextButton, shareButton]);
  }

  private openArchiveModal(): void {
    const calendar = new ArchiveCalendar(this.activeDate ?? getTodayDateString(), (date) => {
      this.modal.close();
      this.navigate({ date });
    });

    const close = el("button", { class: "btn", type: "button", text: "CLOSE" });
    close.addEventListener("click", () => this.closeOverlayRoute());

    this.modal.open("ARCHIVE", calendar.root, [close]);
  }

  private openAboutModal(): void {
    const close = el("button", { class: "btn", type: "button", text: "CLOSE" });
    close.addEventListener("click", () => this.closeOverlayRoute());
    this.modal.open("ABOUT", buildAboutContent(), [close]);
  }

  /** The modal's onClose hook resets the route, so closing is enough. */
  private closeOverlayRoute(): void {
    this.modal.close();
  }

  /* ------------------------------------------------------------------ */
  /* Plumbing                                                            */
  /* ------------------------------------------------------------------ */

  private firstEmptyCell(): number {
    const state = this.state;
    if (!state) return -1;
    for (let i = 0; i < 81; i++) if (state.values[i] === 0) return i;
    return 0;
  }

  private scheduleSave(): void {
    if (this.saveHandle !== null) clearTimeout(this.saveHandle);
    this.saveHandle = setTimeout(() => this.flushSave(), AUTOSAVE_DELAY_MS);
  }

  private flushSave(): void {
    if (this.saveHandle !== null) {
      clearTimeout(this.saveHandle);
      this.saveHandle = null;
    }
    if (!this.state) return;
    this.state.elapsedMs = this.timer.elapsedMs;
    saveProgress(this.state);
  }

  private attachGlobalKeys(): void {
    document.addEventListener("keydown", (event) => {
      if (this.modal.isOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) this.redo();
          else this.undo();
        }
        return;
      }

      switch (event.key.toLowerCase()) {
        case "n":
          event.preventDefault();
          return this.toggleNotesMode();
        case "h":
          event.preventDefault();
          return this.useHint();
        case "p":
          event.preventDefault();
          return this.togglePause();
        default:
          break;
      }

      // Digits typed with the board unfocused still land on the selection.
      if (target?.closest(".board")) return;
      if (event.key >= "1" && event.key <= "9") {
        event.preventDefault();
        this.enterDigit(this.selected, Number(event.key));
      } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
        event.preventDefault();
        this.eraseCell(this.selected);
      }
    });
  }

  private attachLifecycle(): void {
    // pagehide is the reliable "we are going away" signal on mobile Safari;
    // beforeunload is not.
    addEventListener("pagehide", () => this.flushSave());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.timer.pause();
        this.flushSave();
      }
    });
  }

  private attachResizer(resizer: HTMLElement): void {
    let dragging = false;

    const applyWidth = (px: number) => {
      const clamped = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, px));
      document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);
    };

    resizer.addEventListener("pointerdown", (event) => {
      dragging = true;
      resizer.setPointerCapture(event.pointerId);
      document.body.classList.add("resizing");
    });
    resizer.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      applyWidth(window.innerWidth - event.clientX);
    });
    const end = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      resizer.releasePointerCapture(event.pointerId);
      document.body.classList.remove("resizing");
    };
    resizer.addEventListener("pointerup", end);
    resizer.addEventListener("pointercancel", end);

    resizer.addEventListener("keydown", (event) => {
      const current = this.sidebar.getBoundingClientRect().width;
      if (event.key === "ArrowLeft") applyWidth(current + 24);
      else if (event.key === "ArrowRight") applyWidth(current - 24);
    });
  }

  /**
   * The intro is in the DOM from first paint but dormant, so the app never
   * flashes unstyled. It only animates once the pixel font is actually
   * loaded -- otherwise the title renders in a fallback face and jumps.
   */
  private async runBootSequence(): Promise<void> {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      this.shell.classList.remove("booting");
      this.shell.classList.add("booted");
      return;
    }

    try {
      await Promise.race([
        document.fonts.load('12px "Press Start 2P"'),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {
      /* font loading is best-effort */
    }

    this.shell.classList.remove("booting");
    this.shell.classList.add("booted");
  }
}

function buildAboutContent(): HTMLElement {
  return el("div", {}, [
    el("p", {
      class: "note",
      text: "Every puzzle is rebuilt from its date. Nothing is stored on a server, because there is nothing to store.",
    }),
    el("p", {
      class: "note",
      text: "The date is hashed with SHA-256 into a seed. The seed drives a Mulberry32 generator, which shuffles a canonical grid into a solved board and then removes clues one at a time, keeping a cell out only while exactly one solution remains.",
    }),
    el("p", {
      class: "note",
      text: "Same date, same generator version, same puzzle - on any device, in any browser, forever. Open a date from ten years ago and you get the grid that date always had.",
    }),
  ]);
}
