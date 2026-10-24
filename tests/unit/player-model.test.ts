import { describe, expect, it } from 'vitest';

import { BossSafetyWindow } from '../../src/game/player/BossSafetyWindow';
import { PlayerModel } from '../../src/game/player/PlayerModel';
import { aimDirectionForVector, normalizeMovement } from '../../src/game/player/direction';

describe('player core', () => {
  it('normalizes diagonal movement to the same speed as cardinal movement', () => {
    expect(normalizeMovement(1, 0)).toEqual({ x: 1, y: 0 });
    expect(Math.hypot(...Object.values(normalizeMovement(1, 1)))).toBeCloseTo(1);
  });

  it('maps aim to eight clockwise sectors including exact boundaries', () => {
    expect(aimDirectionForVector(1, 0)).toBe('e');
    expect(aimDirectionForVector(0, 1)).toBe('s');
    expect(aimDirectionForVector(-1, -1)).toBe('nw');
    const boundary = (22.5 * Math.PI) / 180;
    expect(aimDirectionForVector(Math.cos(boundary), Math.sin(boundary))).toBe('se');
  });

  it('applies damage once during the 600ms invulnerability window', () => {
    const player = new PlayerModel({ maxHealth: 100, invulnerabilityMs: 600 });

    expect(player.damage(25, 100)).toMatchObject({ applied: true, amount: 25 });
    expect(player.damage(25, 699)).toMatchObject({ applied: false, amount: 0 });
    expect(player.health).toBe(75);
    expect(player.damage(25, 700)).toMatchObject({ applied: true, amount: 25 });
    expect(player.health).toBe(50);
  });

  it('caps healing and keeps death terminal', () => {
    const player = new PlayerModel({ maxHealth: 100, invulnerabilityMs: 600 });
    player.damage(30, 0);
    expect(player.heal(20)).toBe(20);
    expect(player.heal(20)).toBe(10);
    expect(player.damage(100, 600)).toMatchObject({ died: true, amount: 100 });
    expect(player.heal(20)).toBe(0);
    expect(player.health).toBe(0);
  });

  it('blocks Boss damage for exactly two seconds', () => {
    const safety = new BossSafetyWindow();
    expect(safety.begin(1500)).toBe(3500);
    expect(safety.canDamagePlayer(3499.99)).toBe(false);
    expect(safety.canDamagePlayer(3500)).toBe(true);
  });
});
