export interface CollisionRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function moveCircleAgainstRectangles(
  position: Readonly<{ x: number; y: number }>,
  delta: Readonly<{ x: number; y: number }>,
  radius: number,
  bounds: CollisionRectangle,
  rectangles: readonly CollisionRectangle[],
): Readonly<{ x: number; y: number }> {
  let x = clamp(position.x + delta.x, bounds.x + radius, bounds.x + bounds.width - radius);
  for (const rectangle of rectangles) {
    if (!overlaps(x, position.y, radius, rectangle)) continue;
    if (delta.x > 0) x = Math.min(x, rectangle.x - rectangle.width / 2 - radius);
    else if (delta.x < 0) x = Math.max(x, rectangle.x + rectangle.width / 2 + radius);
  }

  let y = clamp(position.y + delta.y, bounds.y + radius, bounds.y + bounds.height - radius);
  for (const rectangle of rectangles) {
    if (!overlaps(x, y, radius, rectangle)) continue;
    if (delta.y > 0) y = Math.min(y, rectangle.y - rectangle.height / 2 - radius);
    else if (delta.y < 0) y = Math.max(y, rectangle.y + rectangle.height / 2 + radius);
  }
  return { x, y };
}

function overlaps(x: number, y: number, radius: number, rectangle: CollisionRectangle): boolean {
  return (
    Math.abs(x - rectangle.x) < rectangle.width / 2 + radius &&
    Math.abs(y - rectangle.y) < rectangle.height / 2 + radius
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
