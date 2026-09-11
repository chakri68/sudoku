/**
 * Wall-clock elapsed time for the current puzzle.
 *
 * Uses Date.now() only for measuring play time. It must never reach the
 * generator -- a timer-dependent puzzle would stop being reproducible.
 */
export class Timer {
  private startedAt: number | null = null;
  private accumulatedMs: number;
  private handle: ReturnType<typeof setInterval> | null = null;
  private readonly onTick: (elapsedMs: number) => void;

  constructor(initialMs: number, onTick: (elapsedMs: number) => void) {
    this.accumulatedMs = initialMs;
    this.onTick = onTick;
  }

  get running(): boolean {
    return this.startedAt !== null;
  }

  get elapsedMs(): number {
    return this.accumulatedMs + (this.startedAt === null ? 0 : Date.now() - this.startedAt);
  }

  /** Idempotent: the first interaction starts it, later ones are no-ops. */
  start(): void {
    if (this.startedAt !== null) return;
    this.startedAt = Date.now();
    this.handle = setInterval(() => this.onTick(this.elapsedMs), 250);
    this.onTick(this.elapsedMs);
  }

  pause(): void {
    if (this.startedAt === null) return;
    this.accumulatedMs += Date.now() - this.startedAt;
    this.startedAt = null;
    this.clearHandle();
    this.onTick(this.elapsedMs);
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.start();
  }

  stop(): void {
    this.pause();
  }

  reset(ms = 0): void {
    this.clearHandle();
    this.startedAt = null;
    this.accumulatedMs = ms;
    this.onTick(this.elapsedMs);
  }

  dispose(): void {
    this.clearHandle();
  }

  private clearHandle(): void {
    if (this.handle !== null) clearInterval(this.handle);
    this.handle = null;
  }
}

/** `07:41`, or `1:07:41` once it runs past an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
