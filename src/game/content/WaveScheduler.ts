import type { StageConfig } from './types';

export type StageScheduleEvent =
  | Readonly<{ kind: 'spawn'; atMs: number; count: number }>
  | Readonly<{ kind: 'elite'; atMs: number; count: 1 }>
  | Readonly<{ kind: 'boss'; atMs: number; bossId: StageConfig['bossId'] }>;

export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function effectiveSpawnInterval(baseMs: number, completedLoops: number): number {
  return Math.max(1, roundHalfUp(baseMs / (1 + 0.15 * completedLoops)));
}

export class WaveScheduler {
  private readonly events: readonly StageScheduleEvent[];
  private readonly postBossInterval: number;
  private readonly postBossBatchSize: number;
  private nextPostBossSpawnAtMs: number;
  private cursor = 0;

  constructor(stage: StageConfig, completedLoops = 0) {
    const ordinary: StageScheduleEvent[] = [];
    for (let stepIndex = 0; stepIndex < stage.pressureSchedule.length; stepIndex += 1) {
      const step = stage.pressureSchedule[stepIndex];
      if (!step) continue;
      const boundary = stage.pressureSchedule[stepIndex + 1]?.atMs ?? stage.durationMs;
      const interval = effectiveSpawnInterval(step.spawnIntervalMs, completedLoops);
      const isLastStep = stepIndex === stage.pressureSchedule.length - 1;
      for (
        let atMs = step.atMs;
        isLastStep ? atMs <= boundary : atMs < boundary;
        atMs += interval
      ) {
        ordinary.push({ kind: 'spawn', atMs, count: step.batchSize });
      }
    }
    const finalStep = stage.pressureSchedule.at(-1);
    if (!finalStep) throw new Error('A stage requires at least one pressure step');
    this.postBossInterval = effectiveSpawnInterval(finalStep.spawnIntervalMs, completedLoops);
    this.postBossBatchSize = finalStep.batchSize;
    this.nextPostBossSpawnAtMs =
      (ordinary.at(-1)?.atMs ?? stage.durationMs) + this.postBossInterval;
    this.events = [
      ...ordinary,
      ...stage.eliteTimesMs.map((atMs) => ({ kind: 'elite' as const, atMs, count: 1 as const })),
      { kind: 'boss' as const, atMs: stage.durationMs, bossId: stage.bossId },
    ].sort((left, right) => left.atMs - right.atMs || priority(left) - priority(right));
  }

  drainThrough(stageTimeMs: number): readonly StageScheduleEvent[] {
    const due: StageScheduleEvent[] = [];
    while (this.cursor < this.events.length) {
      const event = this.events[this.cursor];
      if (!event || event.atMs > stageTimeMs) break;
      due.push(event);
      this.cursor += 1;
    }
    while (this.cursor === this.events.length && this.nextPostBossSpawnAtMs <= stageTimeMs) {
      due.push({ kind: 'spawn', atMs: this.nextPostBossSpawnAtMs, count: this.postBossBatchSize });
      this.nextPostBossSpawnAtMs += this.postBossInterval;
    }
    return due;
  }
}

function priority(event: StageScheduleEvent): number {
  if (event.kind === 'boss') return 0;
  if (event.kind === 'elite') return 1;
  return 2;
}

export class CapEscalation {
  private stacksValue = 0;
  constructor(private readonly config: StageConfig['capEscalation']) {}

  get stacks(): number {
    return this.stacksValue;
  }

  recordBatch(intended: number, admitted: number): number {
    if (admitted < intended)
      this.stacksValue = Math.min(this.config.maxStacks, this.stacksValue + 1);
    return this.stacksValue;
  }

  multipliers(): Readonly<{ health: number; damage: number }> {
    return {
      health: 1 + this.config.healthPerStack * this.stacksValue,
      damage: 1 + this.config.damagePerStack * this.stacksValue,
    };
  }
}
