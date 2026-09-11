/// <reference lib="webworker" />
import { generateDailyPuzzle } from "../generator/generateDailyPuzzle.ts";
import { serializePuzzle } from "../generator/serialize.ts";
import type { SerializedSudokuPuzzle } from "../generator/types.ts";

export interface GeneratorRequest {
  type: "generate";
  id: number;
  date: string;
  version: number;
}

export type GeneratorResponse =
  | { type: "generated"; id: number; puzzle: SerializedSudokuPuzzle }
  | { type: "error"; id: number; message: string };

self.onmessage = async (event: MessageEvent<GeneratorRequest>) => {
  const request = event.data;
  if (request?.type !== "generate") return;

  try {
    const puzzle = await generateDailyPuzzle(request.date, { version: request.version });
    const response: GeneratorResponse = {
      type: "generated",
      id: request.id,
      puzzle: serializePuzzle(puzzle),
    };
    self.postMessage(response);
  } catch (error) {
    const response: GeneratorResponse = {
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
