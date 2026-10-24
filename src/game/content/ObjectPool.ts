export interface PoolItem {
  active: boolean;
}

export class ObjectPool<T extends PoolItem> {
  readonly capacity: number;
  private readonly items: T[];

  constructor(capacity: number, factory: (index: number) => T) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new Error('Pool capacity must be positive');
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, (_, index) => factory(index));
  }

  get activeCount(): number {
    return this.items.reduce((total, item) => total + Number(item.active), 0);
  }

  reserve(count = 1): readonly T[] | undefined {
    if (!Number.isInteger(count) || count <= 0) throw new Error('Reservation must be positive');
    const available = this.items.filter((item) => !item.active).slice(0, count);
    if (available.length !== count) return undefined;
    available.forEach((item) => (item.active = true));
    return available;
  }

  release(item: T): void {
    if (!this.items.includes(item)) throw new Error('Cannot release an item from another pool');
    item.active = false;
  }

  reset(): void {
    this.items.forEach((item) => (item.active = false));
  }
}
