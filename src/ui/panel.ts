import { el } from "./dom.ts";

/**
 * Collapsible sidebar section. The `>` prompt prefix is drawn by CSS and
 * doubles as the chevron, rotating when collapsed.
 */
export class Panel {
  readonly root: HTMLElement;
  readonly body: HTMLElement;

  constructor(title: string, collapsed = false) {
    this.body = el("div", { class: "panel-body", id: `panel-${slug(title)}` });

    const head = el("button", {
      class: "panel-head",
      type: "button",
      "aria-expanded": String(!collapsed),
      "aria-controls": this.body.id,
      text: title,
    });

    this.root = el("div", { class: collapsed ? "panel collapsed" : "panel" }, [head, this.body]);

    head.addEventListener("click", () => {
      const next = this.root.classList.toggle("collapsed");
      head.setAttribute("aria-expanded", String(!next));
    });
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}

export function statRow(key: string, value: string, accent = false): HTMLElement {
  return el("div", { class: "row" }, [
    el("span", { class: "k", text: key }),
    el("span", { class: accent ? "v accent" : "v", text: value }),
  ]);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
