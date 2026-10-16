/**
 * Story items the client checks by role. The server sends inventory as public
 * IDs, so the content bootstrap publishes the IDs behind each role; the slugs
 * stay recognised for authored fixtures and saves from before the UUID move.
 */
const legacyLamps = ['signal-lamp', 'registered-lamp'];
const lampItemIds = new Set(legacyLamps);

/** Installs the lamp IDs from the bootstrap's `storyItems.lamp`. */
export function installStoryItems(value: unknown): void {
  const lamp = (value as { lamp?: unknown } | undefined)?.lamp;
  lampItemIds.clear();
  for (const id of [...legacyLamps, ...(Array.isArray(lamp) ? lamp : [])]) if (typeof id === 'string') lampItemIds.add(id);
}

/** Either lamp from the workshop choice: kept by the Lamplighters or registered with the Brass Office. */
export function carriesLamp(inventory: readonly string[] | undefined): boolean {
  return !!inventory?.some(id => lampItemIds.has(id));
}
