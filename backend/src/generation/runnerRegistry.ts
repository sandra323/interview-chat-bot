import type { GenerationRunner } from './generationRunner.js';

/** WebSocket 服务启动时设置——HTTP 路由可中止进行中的任务。 */
let activeRunner: GenerationRunner | null = null;

export function registerGenerationRunner(runner: GenerationRunner): void {
  activeRunner = runner;
}

export function getGenerationRunner(): GenerationRunner | null {
  return activeRunner;
}
