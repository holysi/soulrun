export interface PlayerModelConfig {
  readonly maxHealth: number;
  readonly invulnerabilityMs: number;
}

export interface DamageResult {
  readonly applied: boolean;
  readonly amount: number;
  readonly died: boolean;
  readonly invulnerableUntilMs: number;
}

export class PlayerModel {
  private maximumHealth: number;
  readonly invulnerabilityMs: number;
  health: number;
  invulnerableUntilMs = 0;

  constructor(config: PlayerModelConfig) {
    this.maximumHealth = config.maxHealth;
    this.invulnerabilityMs = config.invulnerabilityMs;
    this.health = config.maxHealth;
  }

  get dead(): boolean {
    return this.health === 0;
  }

  get maxHealth(): number {
    return this.maximumHealth;
  }

  increaseMaxHealth(amount: number): number {
    assertNonNegativeFinite(amount, 'Maximum health increase');
    this.maximumHealth += amount;
    this.health += amount;
    return amount;
  }

  damage(amount: number, simulationTimeMs: number): DamageResult {
    assertNonNegativeFinite(amount, 'Damage');
    assertNonNegativeFinite(simulationTimeMs, 'Simulation time');
    if (this.dead || amount === 0 || simulationTimeMs < this.invulnerableUntilMs) {
      return {
        applied: false,
        amount: 0,
        died: this.dead,
        invulnerableUntilMs: this.invulnerableUntilMs,
      };
    }

    const appliedAmount = Math.min(this.health, amount);
    this.health -= appliedAmount;
    this.invulnerableUntilMs = simulationTimeMs + this.invulnerabilityMs;
    return {
      applied: true,
      amount: appliedAmount,
      died: this.dead,
      invulnerableUntilMs: this.invulnerableUntilMs,
    };
  }

  heal(amount: number): number {
    assertNonNegativeFinite(amount, 'Healing');
    if (this.dead || amount === 0) return 0;
    const previousHealth = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - previousHealth;
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative`);
  }
}
