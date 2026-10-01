function remapPreset(current, target, closedNumbers = [], reservedIds = []) {
  const oldPanes = current.panes;
  const newCount = target.panes.length;
  const toClose = Math.max(0, oldPanes.length - newCount);
  const closed = new Set(closedNumbers);
  if (closed.size !== toClose || [...closed].some((number) => !Number.isInteger(number) || number < 1 || number > oldPanes.length)) {
    throw new Error(`Select exactly ${toClose} window numbers to close`);
  }
  const remaining = oldPanes.filter((_, index) => !closed.has(index + 1));
  const used = new Set([...reservedIds, ...oldPanes.map((pane) => pane.id)]);
  const replacedIds = [];
  let nextId = 1;
  const panes = target.panes.map((pane, index) => {
    const { id: _slotId, ...slot } = pane;
    const existing = remaining[index];
    const title = pane.kind === 'terminal' ? `TERMINAL ${index + 1}` : pane.title || pane.id;
    if (existing?.kind === pane.kind && (pane.kind === 'terminal' || existing.source === pane.source)) {
      return { ...slot, id: existing.id, title };
    }
    if (existing) replacedIds.push(existing.id);
    while (used.has(`session${nextId}`)) nextId += 1;
    const id = `session${nextId++}`;
    used.add(id);
    return { ...slot, id, title };
  });
  const ids = new Map(target.panes.map((pane, index) => [pane.id, panes[index].id]));
  return {
    closedIds: [...oldPanes.filter((_, index) => closed.has(index + 1)).map((pane) => pane.id), ...replacedIds],
    replacedIds,
    layout: {
      columns: target.columns,
      rows: target.rows,
      areas: target.areas.map((row) => row.trim().split(/\s+/).map((id) => ids.get(id) || id).join(' ')),
      panes
    }
  };
}

module.exports = { remapPreset };
