import type { GenerationRunner } from './generationRunner.js';

/** Set when WebSocket server boots — HTTP routes can abort in-flight jobs. */
let activeRunner: GenerationRunner | null = null;

export function registerGenerationRunner(runner: GenerationRunner): void {
  activeRunner = runner;
}

export function getGenerationRunner(): GenerationRunner | null {
  return activeRunner;
}
