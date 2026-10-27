import { describe, expect, it } from 'vitest';

import dungeonMap from '../../assets/maps/map-dungeon.json';

interface MapObject {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

describe('Dungeon map', () => {
  it('keeps every walkable tile connected without trapping dead ends', () => {
    const obstacleLayer = dungeonMap.layers.find((layer) => layer.name === 'obstacles');
    const spawnLayer = dungeonMap.layers.find((layer) => layer.name === 'spawns');
    const obstacles = (obstacleLayer?.objects ?? []) as MapObject[];
    const spawns = (spawnLayer?.objects ?? []) as MapObject[];
    const playerSpawn = spawns.find((spawn) => spawn.name === 'player');
    if (!playerSpawn) throw new Error('Dungeon player spawn is missing');

    const blocked = new Set<string>();
    for (const obstacle of obstacles) {
      expect(obstacle.x % dungeonMap.tilewidth).toBe(0);
      expect(obstacle.y % dungeonMap.tileheight).toBe(0);
      expect((obstacle.width ?? 0) % dungeonMap.tilewidth).toBe(0);
      expect((obstacle.height ?? 0) % dungeonMap.tileheight).toBe(0);
      const left = obstacle.x / dungeonMap.tilewidth;
      const top = obstacle.y / dungeonMap.tileheight;
      const width = (obstacle.width ?? 0) / dungeonMap.tilewidth;
      const height = (obstacle.height ?? 0) / dungeonMap.tileheight;
      for (let y = top; y < top + height; y += 1) {
        for (let x = left; x < left + width; x += 1) blocked.add(`${x},${y}`);
      }
    }

    const start = {
      x: Math.floor(playerSpawn.x / dungeonMap.tilewidth),
      y: Math.floor(playerSpawn.y / dungeonMap.tileheight),
    };
    const key = (x: number, y: number) => `${x},${y}`;
    const isWalkable = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < dungeonMap.width && y < dungeonMap.height && !blocked.has(key(x, y));
    expect(isWalkable(start.x, start.y)).toBe(true);

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

    const walkable: { x: number; y: number }[] = [];
    for (let y = 0; y < dungeonMap.height; y += 1) {
      for (let x = 0; x < dungeonMap.width; x += 1) {
        if (isWalkable(x, y)) walkable.push({ x, y });
      }
    }
    expect(visited.size).toBe(walkable.length);
    expect(
      walkable.every(
        (tile) =>
          directions.filter((direction) => isWalkable(tile.x + direction.x, tile.y + direction.y))
            .length >= 2,
      ),
    ).toBe(true);
  });
});
