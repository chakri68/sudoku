/**
 * Dates are the only input to generation, so parsing has to be boring and
 * explicit. `new Date("2026-09-11")` parses as UTC midnight and then prints
 * as the previous day west of Greenwich, which would hand two users in
 * different timezones different puzzles for "the same" string. So: parse the
 * components by hand and never round-trip through the Date parser.
 */

export const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Earliest and latest dates the app will generate for. */
export const MIN_DATE = "1970-01-01";
export const MAX_DATE = "2999-12-31";

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function parseDateString(input: string): DateParts | null {
  const match = DATE_PATTERN.exec(input);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

export function isValidDateString(input: string): boolean {
  return parseDateString(input) !== null;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function formatDateParts(parts: DateParts): string {
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

/**
 * Accepts a Date (read in the user's *local* calendar, not UTC) or a string
 * already in canonical form. Throws on anything else so a bad route can never
 * silently become a different puzzle.
 */
export function normalizeDate(input: Date | string): string {
  if (typeof input === "string") {
    const parts = parseDateString(input.trim());
    if (!parts) throw new Error(`Invalid date: ${input}`);
    return formatDateParts(parts);
  }
  if (Number.isNaN(input.getTime())) throw new Error("Invalid Date object");
  return formatDateParts({
    year: input.getFullYear(),
    month: input.getMonth() + 1,
    day: input.getDate(),
  });
}

export function getTodayDateString(now: Date = new Date()): string {
  return normalizeDate(now);
}

/** Days since 1970-01-01, computed from the calendar rather than epoch ms. */
export function toDayNumber(date: string): number {
  const parts = parseDateString(date);
  if (!parts) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
}

export function fromDayNumber(days: number): string {
  const date = new Date(days * 86_400_000);
  return formatDateParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addDays(date: string, delta: number): string {
  return fromDayNumber(toDayNumber(date) + delta);
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** 0 = Sunday. Derived arithmetically; 1970-01-01 was a Thursday. */
export function weekdayOf(date: string): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[weekdayOf(date)];
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1];
}

/** "Friday · September 11, 2026" */
export function formatLongDate(date: string): string {
  const parts = parseDateString(date);
  if (!parts) return date;
  return `${weekdayName(date)} · ${monthName(parts.month)} ${parts.day}, ${parts.year}`;
}

/** "September 11" — for share text. */
export function formatShortDate(date: string): string {
  const parts = parseDateString(date);
  if (!parts) return date;
  return `${monthName(parts.month)} ${parts.day}`;
}

export function clampDate(date: string): string {
  if (date < MIN_DATE) return MIN_DATE;
  if (date > MAX_DATE) return MAX_DATE;
  return date;
}

export function isWithinRange(date: string): boolean {
  return date >= MIN_DATE && date <= MAX_DATE;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
