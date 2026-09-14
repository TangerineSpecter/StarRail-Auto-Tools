/// <reference lib="webworker" />

import { optimizeRelics, type RelicOptimizerRunInput } from "./index";

type WorkerRequest = { id: number; input: RelicOptimizerRunInput };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, input } = event.data;
  try {
    self.postMessage({ id, result: optimizeRelics(input) });
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : String(cause) });
  }
};

export {};
