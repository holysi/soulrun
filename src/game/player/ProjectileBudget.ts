export class ProjectileBudget {
  private readonly expiresAtById = new Map<string, number>();

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('Projectile capacity must be a positive integer');
    }
  }

  reservePattern(ids: readonly string[], simulationTimeMs: number, lifetimeMs: number): boolean {
    if (new Set(ids).size !== ids.length) throw new Error('Projectile IDs must be unique');
    if (this.expiresAtById.size + ids.length > this.capacity) return false;
    for (const id of ids) this.expiresAtById.set(id, simulationTimeMs + lifetimeMs);
    return true;
  }

  releaseExpired(simulationTimeMs: number): string[] {
    const expired: string[] = [];
    for (const [id, expiresAtMs] of this.expiresAtById) {
      if (simulationTimeMs < expiresAtMs) continue;
      this.expiresAtById.delete(id);
      expired.push(id);
    }
    return expired;
  }

  release(id: string): void {
    this.expiresAtById.delete(id);
  }

  clear(): void {
    this.expiresAtById.clear();
  }

  get activeCount(): number {
    return this.expiresAtById.size;
  }
}
