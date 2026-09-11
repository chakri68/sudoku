import { el, qs } from "./dom.ts";

/**
 * A single reusable overlay. Traps focus while open, closes on Escape and on
 * a backdrop click, and hands focus back to whatever opened it.
 */
export class Modal {
  readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly body: HTMLElement;
  private readonly foot: HTMLElement;
  private lastFocused: HTMLElement | null = null;
  /** Fires however the modal was dismissed, including Escape and backdrop. */
  onClose: (() => void) | null = null;

  constructor() {
    this.heading = el("h3", { id: "modal-title" });
    this.body = el("div", { class: "modal-body" });
    this.foot = el("div", { class: "modal-foot" });
    this.panel = el(
      "div",
      { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-title" },
      [this.heading, this.body, this.foot],
    );
    this.root = el("div", { class: "backdrop", hidden: true }, [this.panel]);

    this.root.addEventListener("click", (event) => {
      if (event.target === this.root) this.close();
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
      if (event.key === "Tab") this.trapFocus(event);
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(title: string, content: Node, actions: HTMLElement[] = []): void {
    this.lastFocused = document.activeElement as HTMLElement | null;
    this.heading.textContent = title;
    this.body.replaceChildren(content);
    this.foot.replaceChildren(...actions);
    this.root.hidden = false;

    const focusables = this.focusables();
    (focusables[focusables.length - 1] ?? this.panel).focus();
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.lastFocused?.focus();
    this.lastFocused = null;
    this.onClose?.();
  }

  private focusables(): HTMLElement[] {
    return [
      ...this.panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => !node.hasAttribute("disabled"));
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusables = this.focusables();
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

export { qs };
