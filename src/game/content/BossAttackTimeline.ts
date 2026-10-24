import type { BossAttack, BossConfig } from './types';

export type BossPhase = 1 | 2;
export type BossAttackState = 'telegraph' | 'active' | 'recovery' | 'cooldown' | 'complete';

export function getBossPhase(boss: BossConfig, currentHealth: number): BossPhase {
  return currentHealth / boss.health <= boss.phaseThreshold ? 2 : 1;
}

export function bossAttackCooldown(boss: BossConfig, attack: BossAttack, phase: BossPhase): number {
  return phase === 2
    ? Math.max(1, Math.floor(attack.cooldownMs * boss.phase2CooldownMultiplier + 0.5))
    : attack.cooldownMs;
}

export class BossAttackTimeline {
  constructor(
    readonly attack: BossAttack,
    readonly telegraphStartedAtMs: number,
    readonly cooldownMs: number,
  ) {}

  stateAt(nowMs: number): BossAttackState {
    const elapsed = nowMs - this.telegraphStartedAtMs;
    if (elapsed < 0) throw new Error('Boss attack timeline cannot run backwards');
    if (elapsed < this.attack.telegraphMs) return 'telegraph';
    const activeMs = getActiveDuration(this.attack);
    if (elapsed < this.attack.telegraphMs + activeMs) return 'active';
    const recoveryMs = this.attack.kind === 'charge' ? this.attack.recoveryMs : 0;
    if (elapsed < this.attack.telegraphMs + activeMs + recoveryMs) return 'recovery';
    if (elapsed < this.attack.telegraphMs + activeMs + recoveryMs + this.cooldownMs)
      return 'cooldown';
    return 'complete';
  }

  canDealDamage(nowMs: number): boolean {
    return this.attack.damage > 0 && this.stateAt(nowMs) === 'active';
  }

  damageMomentsBetween(previousMs: number, nowMs: number): readonly number[] {
    if (nowMs < previousMs) throw new Error('Boss attack timeline cannot run backwards');
    if (this.attack.damage <= 0) return [];
    const activeAtMs = this.telegraphStartedAtMs + this.attack.telegraphMs;
    const activeUntilMs = activeAtMs + getActiveDuration(this.attack);
    const interval = this.attack.kind === 'hazard' ? this.attack.tickMs : undefined;
    const moments: number[] = [];
    for (
      let moment = activeAtMs;
      moment < activeUntilMs && moment <= nowMs;
      moment += interval ?? activeUntilMs
    ) {
      if (moment > previousMs) moments.push(moment);
    }
    return moments;
  }
}

function getActiveDuration(attack: BossAttack): number {
  switch (attack.kind) {
    case 'line':
    case 'slam':
    case 'block':
    case 'hazard':
      return attack.activeMs;
    case 'charge':
      return Math.max(1, Math.floor((attack.distance / attack.speed) * 1000 + 0.5));
    case 'fan':
    case 'ring':
      return attack.projectileLifetimeMs;
    case 'summon':
      return 1;
  }
}
