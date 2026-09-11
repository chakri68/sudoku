import { generateDailyPuzzle } from "../generator/generateDailyPuzzle.ts";
import { deserializePuzzle } from "../generator/serialize.ts";
import type { SudokuPuzzle } from "../generator/types.ts";
import type { GeneratorRequest, GeneratorResponse } from "../workers/generator.worker.ts";

/**
 * Generation is a few milliseconds typically and a couple hundred at worst,
 * which is enough to drop frames on a slow phone, so it runs in a worker.
 *
 * The worker is best-effort: if it cannot start (blocked, unsupported, or
 * it throws) we generate on the main thread instead. The result is identical
 * either way -- that is the point of the determinism contract.
 */
type Pending = {
  resolve: (puzzle: SudokuPuzzle) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let workerUsable = true;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker | null {
  if (!workerUsable) return null;
  if (worker) return worker;

  try {
    worker = new Worker(new URL("../workers/generator.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<GeneratorResponse>) => {
      const message = event.data;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);

      if (message.type === "generated") entry.resolve(deserializePuzzle(message.puzzle));
      else entry.reject(new Error(message.message));
    };
    worker.onerror = () => {
      workerUsable = false;
      for (const entry of pending.values()) entry.reject(new Error("worker failed"));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerUsable = false;
    return null;
  }
}

export async function requestPuzzle(date: string, version: number): Promise<SudokuPuzzle> {
  const active = ensureWorker();
  if (!active) return generateDailyPuzzle(date, { version });

  const id = nextId++;
  const request: GeneratorRequest = { type: "generate", id, date, version };

  try {
    return await new Promise<SudokuPuzzle>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      active.postMessage(request);
    });
  } catch {
    return generateDailyPuzzle(date, { version });
  }
}

/** Warms the worker so the first puzzle does not pay module-load cost. */
export function prewarm(): void {
  ensureWorker();
}
