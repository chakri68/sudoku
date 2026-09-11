import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  daysInMonth,
  formatLongDate,
  isLeapYear,
  isValidDateString,
  normalizeDate,
  parseDateString,
  weekdayName,
} from "../src/generator/date.ts";

describe("parsing", () => {
  it("accepts a canonical date", () => {
    expect(parseDateString("2026-09-11")).toEqual({ year: 2026, month: 9, day: 11 });
  });

  it("rejects malformed input", () => {
    for (const bad of ["2026-9-11", "26-09-11", "2026/09/11", "", "today", "2026-09-11T00:00"]) {
      expect(isValidDateString(bad)).toBe(false);
    }
  });

  it("rejects impossible calendar dates", () => {
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2024-02-29")).toBe(true);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-04-31")).toBe(false);
    expect(isValidDateString("2026-00-10")).toBe(false);
  });

  it("throws rather than guessing", () => {
    expect(() => normalizeDate("nope")).toThrow();
  });
});

/**
 * The reason date.ts parses by hand: `new Date("2026-09-11")` is UTC
 * midnight, which prints as the 10th anywhere west of Greenwich. Two users
 * would get different puzzles for the same string.
 */
describe("no timezone drift", () => {
  it("reads a local Date as its local calendar day", () => {
    const local = new Date(2026, 8, 11, 0, 30);
    expect(normalizeDate(local)).toBe("2026-09-11");
  });

  it("keeps a late-evening local date on the same day", () => {
    const evening = new Date(2026, 8, 11, 23, 59);
    expect(normalizeDate(evening)).toBe("2026-09-11");
  });

  it("round-trips a string unchanged", () => {
    expect(normalizeDate("2004-08-06")).toBe("2004-08-06");
  });
});

describe("calendar arithmetic", () => {
  it("knows leap years", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("steps across month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
  });

  it("measures spans", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-01-01", "2025-12-31")).toBe(-1);
  });

  it("derives weekdays arithmetically", () => {
    expect(weekdayName("2026-09-11")).toBe("Friday");
    expect(weekdayName("2000-01-01")).toBe("Saturday");
    expect(weekdayName("1970-01-01")).toBe("Thursday");
  });

  it("formats for display", () => {
    expect(formatLongDate("2026-09-11")).toBe("Friday · September 11, 2026");
  });
});
