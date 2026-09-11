import { describe, expect, it } from "vitest";
import { buildPath, parseLocation } from "../src/app/router.ts";
import { addDays, getTodayDateString } from "../src/generator/date.ts";

/** Any literal date could become "today" eventually, which collapses to "/". */
const OTHER_DAY = addDays(getTodayDateString(), 1);

const at = (href: string) => parseLocation(new URL(href, "https://sudoku.test"));

describe("route parsing", () => {
  it("maps the root to today", () => {
    const route = at("/");
    expect(route.view).toBe("puzzle");
    expect(route.date).toBe(getTodayDateString());
  });

  it("maps a date path to that date", () => {
    expect(at("/2026-09-11").date).toBe("2026-09-11");
    expect(at("/2026-09-11/").date).toBe("2026-09-11");
  });

  it("maps the named views", () => {
    expect(at("/archive").view).toBe("archive");
    expect(at("/about").view).toBe("about");
  });

  /** §43: a hand-edited URL must degrade, never throw. */
  it("falls back to today on junk input", () => {
    for (const path of ["/nope", "/2026-13-45", "/../etc/passwd", "/9999999", "/%00"]) {
      const route = at(path);
      expect(route.view).toBe("puzzle");
      expect(route.date).toBe(getTodayDateString());
    }
  });

  it("rejects a date outside the supported range", () => {
    expect(at("/1800-01-01").date).toBe(getTodayDateString());
    expect(at("/3500-01-01").date).toBe(getTodayDateString());
  });

  it("reads flags", () => {
    expect(at("/2026-09-11?debug=1").debug).toBe(true);
    expect(at("/2026-09-11").debug).toBe(false);
    expect(at("/2026-09-11?v=1").version).toBe(1);
  });

  it("ignores an unsupported generator version", () => {
    expect(at("/2026-09-11?v=99").version).toBe(1);
    expect(at("/2026-09-11?v=abc").version).toBe(1);
  });
});

describe("path building", () => {
  it("keeps today at the root", () => {
    expect(buildPath({ date: getTodayDateString() })).toBe("/");
  });

  it("writes other dates as a path", () => {
    expect(buildPath({ date: OTHER_DAY })).toBe(`/${OTHER_DAY}`);
  });

  it("carries the debug flag", () => {
    expect(buildPath({ date: OTHER_DAY, debug: true })).toBe(`/${OTHER_DAY}?debug=1`);
    expect(buildPath({ date: getTodayDateString(), debug: true })).toBe("/?debug=1");
  });

  it("round-trips through the parser", () => {
    for (const date of ["2000-01-01", OTHER_DAY, "2099-12-31"]) {
      expect(at(buildPath({ date })).date).toBe(date);
    }
  });
});
