export interface PenetrationState {
  readonly hitIds: ReadonlySet<string>;
  readonly remainingPenetration: number;
}

export interface PenetrationResult extends PenetrationState {
  readonly accepted: boolean;
  readonly release: boolean;
}

export function consumePenetratingHit(
  state: PenetrationState,
  targetId: string,
): PenetrationResult {
  if (state.hitIds.has(targetId)) return { ...state, accepted: false, release: false };
  const hitIds = new Set(state.hitIds).add(targetId);
  if (state.remainingPenetration > 0) {
    return {
      hitIds,
      remainingPenetration: state.remainingPenetration - 1,
      accepted: true,
      release: false,
    };
  }
  return { hitIds, remainingPenetration: 0, accepted: true, release: true };
}

export function circleContains(
  center: Readonly<{ x: number; y: number }>,
  point: Readonly<{ x: number; y: number }>,
  radius: number,
): boolean {
  return Math.hypot(point.x - center.x, point.y - center.y) <= radius;
}
