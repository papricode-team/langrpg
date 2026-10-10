/** Small observable store: one revision-controlled owner per adventure. */
export function createStateStore<T extends { revision: number }>(initial: T) {
  let value = initial, owner = '';
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    replace(next: T, nextOwner = owner): boolean {
      if (nextOwner === owner && next.revision < value.revision) return false;
      owner = nextOwner; value = next;
      listeners.forEach(listener => listener(value));
      return true;
    },
    subscribe(listener: (value: T) => void) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
