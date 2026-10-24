export class BossSafetyWindow {
  private safeUntilMs = 0;

  begin(simulationTimeMs: number, durationMs = 2000): number {
    if (!Number.isFinite(simulationTimeMs) || !Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error('Boss safety window requires finite non-negative timing');
    }
    this.safeUntilMs = simulationTimeMs + durationMs;
    return this.safeUntilMs;
  }

  canDamagePlayer(simulationTimeMs: number): boolean {
    return simulationTimeMs >= this.safeUntilMs;
  }

  get endTimeMs(): number {
    return this.safeUntilMs;
  }
}
