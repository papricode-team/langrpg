/** Pure component visibility/order rules shared by authoring proofs and recipes. */
export function resolveComponentRules(selected, facing = 'down') {
  if (!['down', 'right', 'up', 'left'].includes(facing)) throw new Error(`Unknown facing ${facing}`);
  const occupied = new Map();
  for (const part of selected) for (const slot of part.occupies ?? [])
    if (slot !== part.slot && !occupied.has(slot)) occupied.set(slot, part.id);
  const unoccupied = selected.filter(part => !occupied.has(part.slot));
  // A hairstyle excluding headwear must survive the excluded hat's hide rule.
  const excluded = new Set(unoccupied.flatMap(part => part.excludes ?? []));
  const compatible = unoccupied.filter(part => !excluded.has(part.slot));
  const hidden = new Set(compatible.flatMap(part => part.hides ?? []).filter(slot => slot !== 'hairCrown'));
  const z = part => part.zOrder?.[facing] ?? part.zOrder?.default ?? 20;
  const visible = compatible.filter(part => !hidden.has(part.slot)).slice().sort((a, b) => z(a) - z(b) || a.id.localeCompare(b.id));
  const disabled = Object.fromEntries([...occupied].map(([slot, by]) => [slot, { reason: 'occupied', by }]));
  for (const part of unoccupied) for (const slot of part.excludes ?? []) disabled[slot] = { reason: 'excluded', by: part.id };
  const overlaps = compatible.flatMap(part => Object.entries(part.covers ?? {})
    .filter(([slot]) => compatible.some(other => other.slot === slot))
    .map(([slot, coverage]) => ({ by: part.id, slot, coverage })));
  return { visible, disabled, hidden: [...hidden].sort(), overlaps };
}
