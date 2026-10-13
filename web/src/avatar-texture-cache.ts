/** Leases pin textures used by sprites. Only unused entries are evicted. */
export interface TextureLease<T> { value: T; release(evict?: boolean): void; }
interface Entry<T> { promise: Promise<T>; refs: number; touched: number; ready: boolean; bytes: number; value?: T; }

export class AvatarTextureCache<T> {
  private entries = new Map<string, Entry<T>>();
  private clock = 0;
  private disposed = false;
  constructor(private destroy: (value: T) => void, private capacity = 32, private memory?: { maxBytes: number; sizeOf: (value: T) => number }) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Texture capacity must be positive');
    if (memory && (!Number.isSafeInteger(memory.maxBytes) || memory.maxBytes < 1)) throw new Error('Texture byte budget must be positive');
  }

  async acquire(key: string, create: () => Promise<T>): Promise<TextureLease<T>> {
    if (this.disposed) throw new Error('Avatar texture cache is disposed');
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { promise: undefined as unknown as Promise<T>, refs: 0, touched: ++this.clock, ready: false, bytes: 0 };
      const pending = entry;
      // Defer the factory until the entry is registered, including synchronous errors.
      pending.promise = Promise.resolve().then(() => {
        if (this.disposed) throw new Error('Avatar texture cache is disposed');
        return create();
      }).then(value => {
        if (this.disposed) { this.destroy(value); throw new Error('Avatar texture cache is disposed'); }
        const bytes = this.memory?.sizeOf(value) ?? 0;
        if (!Number.isSafeInteger(bytes) || bytes < 0) { this.destroy(value); throw new Error('Invalid texture byte size'); }
        pending.value = value; pending.ready = true; pending.bytes = bytes;
        this.trim();
        return value;
      }).catch(error => {
        if (this.entries.get(key) === pending) this.entries.delete(key);
        throw error;
      });
      this.entries.set(key, pending);
    }
    entry.refs++; entry.touched = ++this.clock;
    const value = await entry.promise;
    if (this.disposed) throw new Error('Avatar texture cache is disposed');
    let released = false;
    return { value, release: (evict = false) => {
      if (released) return;
      released = true; entry.refs--; entry.touched = ++this.clock;
      if (evict && entry.refs === 0 && this.entries.get(key) === entry) {
        this.entries.delete(key); this.destroy(value);
      }
      this.trim();
    } };
  }

  private trim(): void {
    // Active recipes may temporarily exceed capacity; never invalidate a live sprite.
    const idle = [...this.entries].filter(([, entry]) => entry.ready && entry.refs === 0).sort((a, b) => a[1].touched - b[1].touched);
    let bytes = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    while ((this.entries.size > this.capacity || bytes > (this.memory?.maxBytes ?? Infinity)) && idle.length) {
      const [key, entry] = idle.shift()!;
      bytes -= entry.bytes;
      this.entries.delete(key); this.destroy(entry.value!);
    }
  }

  retainedBytes(): number { return [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0); }

  snapshot(): { total: number; active: number; pending: number } {
    const entries = [...this.entries.values()];
    return { total: entries.length, active: entries.filter(entry => entry.refs > 0).length, pending: entries.filter(entry => !entry.ready).length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) if (entry.ready) this.destroy(entry.value!);
    this.entries.clear();
  }
}
