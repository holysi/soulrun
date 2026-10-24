import type { AimDirection } from '../testing/types';

const DIRECTIONS: readonly AimDirection[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];

export interface Vector2Value {
  readonly x: number;
  readonly y: number;
}

export function normalizeMovement(x: number, y: number): Vector2Value {
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

export function aimDirectionForVector(x: number, y: number): AimDirection {
  if (x === 0 && y === 0) return 'e';
  const clockwiseAngle = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  // The epsilon makes mathematically exact half-sector ties stable after trig conversion.
  const sector = Math.floor((clockwiseAngle + 22.5 + 1e-10) / 45) % DIRECTIONS.length;
  return DIRECTIONS[sector] as AimDirection;
}

export function directionVector(direction: AimDirection): Vector2Value {
  const angle = (DIRECTIONS.indexOf(direction) * Math.PI) / 4;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}
