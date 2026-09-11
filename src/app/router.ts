import {
  clampDate,
  getTodayDateString,
  isValidDateString,
  isWithinRange,
} from "../generator/date.ts";
import { GENERATOR_VERSION, isSupportedVersion } from "../generator/version.ts";

/**
 * Routes:
 *   /              today's puzzle
 *   /2026-09-11    that date
 *   /archive       calendar
 *   /about         how the generation works
 *
 * Query: ?v=1 pins a generator version, ?debug=1 shows the seed panel.
 * Nothing here is trusted -- a bad path falls back to today rather than
 * throwing, and an unsupported version falls back to the current one.
 */
export type View = "puzzle" | "archive" | "about";

export interface Route {
  view: View;
  date: string;
  version: number;
  debug: boolean;
}

export function parseLocation(url: URL = new URL(location.href)): Route {
  const segment = url.pathname.replace(/^\/+|\/+$/g, "");
  const params = url.searchParams;

  const requested = Number(params.get("v") ?? params.get("version"));
  const version = isSupportedVersion(requested) ? requested : GENERATOR_VERSION;
  const debug = params.get("debug") === "1";

  if (segment === "archive" || segment === "about") {
    return { view: segment, date: getTodayDateString(), version, debug };
  }

  if (isValidDateString(segment) && isWithinRange(segment)) {
    return { view: "puzzle", date: segment, version, debug };
  }

  return { view: "puzzle", date: getTodayDateString(), version, debug };
}

export function buildPath(route: Partial<Route> & { date: string }): string {
  const params = new URLSearchParams();
  if (route.version !== undefined && route.version !== GENERATOR_VERSION) {
    params.set("v", String(route.version));
  }
  if (route.debug) params.set("debug", "1");

  const base =
    route.view === "archive" || route.view === "about"
      ? `/${route.view}`
      : route.date === getTodayDateString()
        ? "/"
        : `/${clampDate(route.date)}`;

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export class Router {
  private listener: ((route: Route) => void) | null = null;

  start(onChange: (route: Route) => void): void {
    this.listener = onChange;
    addEventListener("popstate", () => this.emit());
    this.emit();
  }

  /** Pushes a new URL and notifies. Replaces instead when `replace` is set. */
  go(route: Partial<Route> & { date: string }, replace = false): void {
    const path = buildPath(route);
    if (path === location.pathname + location.search) {
      this.emit();
      return;
    }
    if (replace) history.replaceState(null, "", path);
    else history.pushState(null, "", path);
    this.emit();
  }

  private emit(): void {
    this.listener?.(parseLocation());
  }
}
