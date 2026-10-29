import { describe, expect, it } from 'vitest';

import infernoMap from '../../assets/maps/map-inferno.json';

interface MapProperty {
  readonly name: string;
  readonly value: string | number | boolean;
}

interface MapObject {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly properties?: readonly MapProperty[];
}

function property(object: MapObject, name: string): string | number | boolean | undefined {
  return object.properties?.find((candidate) => candidate.name === name)?.value;
}

function contains(object: MapObject, x: number, y: number): boolean {
  return (
    x >= object.x &&
    y >= object.y &&
    x < object.x + (object.width ?? 0) &&
    y < object.y + (object.height ?? 0)
  );
}

describe('Inferno map', () => {
  it('defines a connected, bounded arena with safe authored spawns', () => {
    expect(infernoMap.width * infernoMap.tilewidth).toBe(1920);
    expect(infernoMap.height * infernoMap.tileheight).toBe(1072);
    expect(infernoMap.layers.map((layer) => layer.name)).toEqual(
      expect.arrayContaining(['ground', 'obstacles', 'hazards', 'decorations', 'spawns']),
    );

    const obstacleLayer = infernoMap.layers.find((layer) => layer.name === 'obstacles');
    const spawnLayer = infernoMap.layers.find((layer) => layer.name === 'spawns');
    const obstacles = (obstacleLayer?.objects ?? []) as MapObject[];
    const spawns = (spawnLayer?.objects ?? []) as MapObject[];
    const playerSpawn = spawns.find((spawn) => spawn.name === 'player');
    const bossSpawn = spawns.find((spawn) => spawn.name === 'boss');
    expect(playerSpawn).toBeDefined();
    expect(bossSpawn).toBeDefined();

    for (const obstacle of obstacles) {
      expect(obstacle.x % infernoMap.tilewidth).toBe(0);
      expect(obstacle.y % infernoMap.tileheight).toBe(0);
      expect((obstacle.width ?? 0) % infernoMap.tilewidth).toBe(0);
      expect((obstacle.height ?? 0) % infernoMap.tileheight).toBe(0);
    }

    const key = (x: number, y: number) => `${x},${y}`;
    const blocked = new Set<string>();
    for (const obstacle of obstacles) {
      const left = obstacle.x / infernoMap.tilewidth;
      const top = obstacle.y / infernoMap.tileheight;
      const width = (obstacle.width ?? 0) / infernoMap.tilewidth;
      const height = (obstacle.height ?? 0) / infernoMap.tileheight;
      for (let y = top; y < top + height; y += 1) {
        for (let x = left; x < left + width; x += 1) blocked.add(key(x, y));
      }
    }
    for (let x = 0; x < infernoMap.width; x += 1) {
      expect(blocked.has(key(x, 0))).toBe(true);
      expect(blocked.has(key(x, infernoMap.height - 1))).toBe(true);
    }
    for (let y = 0; y < infernoMap.height; y += 1) {
      expect(blocked.has(key(0, y))).toBe(true);
      expect(blocked.has(key(infernoMap.width - 1, y))).toBe(true);
    }

    const start = {
      x: Math.floor(playerSpawn!.x / infernoMap.tilewidth),
      y: Math.floor(playerSpawn!.y / infernoMap.tileheight),
    };
    const isWalkable = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < infernoMap.width && y < infernoMap.height && !blocked.has(key(x, y));
    expect(isWalkable(start.x, start.y)).toBe(true);
    expect(obstacles.some((obstacle) => contains(obstacle, bossSpawn!.x, bossSpawn!.y))).toBe(
      false,
    );

    const visited = new Set([key(start.x, start.y)]);
    const queue = [start];
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ] as const;
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const direction of directions) {
        const next = { x: current.x + direction.x, y: current.y + direction.y };
        const nextKey = key(next.x, next.y);
        if (!isWalkable(next.x, next.y) || visited.has(nextKey)) continue;
        visited.add(nextKey);
        queue.push(next);
      }
    }

    let walkableCount = 0;
    for (let y = 0; y < infernoMap.height; y += 1) {
      for (let x = 0; x < infernoMap.width; x += 1) {
        if (isWalkable(x, y)) walkableCount += 1;
      }
    }
    expect(visited.size).toBe(walkableCount);
    expect(walkableCount / (infernoMap.width * infernoMap.height)).toBeGreaterThan(0.8);
  });

  it('defines readable fixed lava zones with stable damage contracts', () => {
    const hazardLayer = infernoMap.layers.find((layer) => layer.name === 'hazards');
    const spawnLayer = infernoMap.layers.find((layer) => layer.name === 'spawns');
    const hazards = (hazardLayer?.objects ?? []) as MapObject[];
    const spawns = (spawnLayer?.objects ?? []) as MapObject[];
    expect(hazards.length).toBeGreaterThanOrEqual(3);

    const hazardIds = new Set<string>();
    for (const hazard of hazards) {
      const hazardId = property(hazard, 'hazardId');
      const damage = property(hazard, 'damage');
      const tickMs = property(hazard, 'tickMs');
      expect(typeof hazardId).toBe('string');
      expect(hazardId).not.toBe('');
      expect(hazardIds.has(String(hazardId))).toBe(false);
      hazardIds.add(String(hazardId));
      expect(typeof damage).toBe('number');
      expect(Number(damage)).toBeGreaterThan(0);
      expect(typeof tickMs).toBe('number');
      expect(Number(tickMs)).toBeGreaterThan(0);
      expect(hazard.x % infernoMap.tilewidth).toBe(0);
      expect(hazard.y % infernoMap.tileheight).toBe(0);
      expect((hazard.width ?? 0) % infernoMap.tilewidth).toBe(0);
      expect((hazard.height ?? 0) % infernoMap.tileheight).toBe(0);
      expect((hazard.width ?? 0) * (hazard.height ?? 0)).toBeGreaterThan(0);
      expect(spawns.some((spawn) => contains(hazard, spawn.x, spawn.y))).toBe(false);
    }
  });
});
