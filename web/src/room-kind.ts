/** Layout types are separate from the identity of a building in a town. */
export const roomKinds = ['cafe', 'bakery', 'supermarket', 'inn', 'library', 'workshop', 'station', 'greenhouse', 'home'] as const;
export type RoomKind = typeof roomKinds[number];
export type RoomId = RoomKind | `${RoomKind}--${string}` | `${RoomKind}::${string}`;
export function roomKind(id: string): RoomKind {
  const kind = id.split('::')[0].split('--')[0] as RoomKind;
  if (!roomKinds.includes(kind)) throw new Error(`Unknown room ${id}`);
  return kind;
}
