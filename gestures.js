'use strict';
// Pointer input: hovering, drawing, selecting and dragging, plus the snapping that turns a cursor into plan coordinates.
const SNAP_RADIUS = 12; // px: wall references and measuring
const ALIGN_RADIUS = 10; // px: symbol alignment guides
const WALL_SYMBOL_RADIUS = 24; // px: doors and windows snapping onto a wall
const MIN_WALL = .1; // m

function point(e, snap = true) {
  const rect = svg.getBoundingClientRect(), camera = state.camera;
  const p = { x: camera.x + (e.clientX - rect.left) / camera.scale, y: camera.y + (e.clientY - rect.top) / camera.scale };
  if (snap && $('snap').checked) { p.x = Math.round(p.x * 10) / 10; p.y = Math.round(p.y * 10) / 10; }
  return p;
}
// Symbol centers and wall corners that a moving symbol can line up with.
function alignTargets(excludeId) {
  return [...state.plan.symbols.filter(x => x.id !== excludeId), ...state.plan.walls.flatMap(w => [w.a, w.b])].map(t => ({ x: t.x, y: t.y }));
}
function align(at, free, excludeId) {
  const a = M.findAlignment(at, alignTargets(excludeId), px(ALIGN_RADIUS), free);
  return { x: a.x, y: a.y, rotation: at.rotation, guides: a.guides };
}
// Where a symbol of `type` lands under the cursor: on a wall (doors, windows) or free, then aligned.
function placement(e, type, rotation = 0, excludeId) {
  if (M.SYMBOLS[type].wall) {
    const hit = M.snapToWall(point(e, false), state.plan.walls, px(WALL_SYMBOL_RADIUS));
    if (hit) {
      const r = Math.abs(hit.rotation), along = r === 0 || r === 180 ? { x: true, y: false } : r === 90 ? { x: false, y: true } : { x: false, y: false };
      return align(hit, along, excludeId);
    }
  }
  const p = point(e); return align({ x: p.x, y: p.y, rotation }, { x: true, y: true }, excludeId);
}
// Cursor point, replaced by a nearby wall reference (which is also shown) when there is one.
function drawingPoint(e, walls = state.plan.walls) {
  state.reference = M.findReference(point(e, false), walls, px(SNAP_RADIUS));
  return state.reference ? state.reference.point : point(e);
}
// Horizontal/vertical line from `from`, ending at an endpoint or crossing found on that line.
function straightEnd(e, from, walls) {
  const raw = point(e, false), snapped = point(e);
  const horizontal = Math.abs(raw.x - from.x) >= Math.abs(raw.y - from.y);
  const locked = horizontal ? { x: snapped.x, y: from.y } : { x: from.x, y: snapped.y };
  state.reference = M.findLineReference(from, locked, walls, px(SNAP_RADIUS));
  return state.reference ? state.reference.point : locked;
}
function wallEnd(e, g) {
  return e.shiftKey && g.kind === 'wall' ? straightEnd(e, g.start, state.plan.walls) : drawingPoint(e);
}
// While editing, references come from every wall except the ones being edited.
function editPoint(e, g) {
  const skip = new Set(g.kind === 'endpoint' ? [g.original.id] : g.originals.map(w => w.id));
  const others = state.plan.walls.filter(w => !skip.has(w.id));
  if (g.kind === 'endpoint' && e.shiftKey) return straightEnd(e, g.original[g.end === 'a' ? 'b' : 'a'], others);
  return drawingPoint(e, others);
}
// Nudge a move so the closest moved endpoint lands on a reference of a wall that is not moving.
function snapMove(delta, originals) {
  const skip = new Set(originals.map(w => w.id)), others = state.plan.walls.filter(w => !skip.has(w.id));
  let best = null;
  for (const w of originals) for (const end of [w.a, w.b]) {
    const at = { x: end.x + delta.x, y: end.y + delta.y }, ref = M.findReference(at, others, px(SNAP_RADIUS));
    if (!ref) continue;
    const shift = { x: ref.point.x - at.x, y: ref.point.y - at.y }, d = Math.hypot(shift.x, shift.y);
    if (!best || d < best.d) best = { d, ref, shift };
  }
  state.reference = best ? best.ref : null;
  return best ? { x: delta.x + best.shift.x, y: delta.y + best.shift.y } : delta;
}

function placeSymbol(e) {
  const before = snapshot(), at = placement(e, state.symbolType), sym = M.symbol(state.symbolType, at.x, at.y, at.rotation);
  state.plan.symbols.push(sym); select(null, sym.id); state.guides = []; commit(before);
}
// Ctrl+drag: duplicate the selection in place; the copy is what gets dragged. Returns the selection to restore if nothing moves.
function duplicateSelection() {
  const restore = { selectedWallId: state.selectedWallId, selectedSymbolId: state.selectedSymbolId, single: state.single };
  const sym = selectedSymbol();
  if (sym) { const copy = M.symbol(sym.type, sym.x, sym.y, sym.rotation); state.plan.symbols.push(copy); state.selectedSymbolId = copy.id; return restore; }
  const copies = M.duplicateWalls(selectedWalls());
  if (!copies.length) return null;
  state.plan.walls.push(...copies); state.selectedWallId = copies[0].id; return restore;
}

function startGesture(e) {
  if (![0, 1].includes(e.button) || state.gesture) return;
  if (e.button === 1) e.preventDefault();
  svg.focus({ preventScroll: true });
  if (e.button === 0 && state.tool === 'symbol') { placeSymbol(e); return; }
  svg.setPointerCapture(e.pointerId);
  state.reference = null; state.measure = null;
  const drawing = e.button === 0 && isDrawingTool(state.tool);
  const start = drawing ? drawingPoint(e) : point(e);
  if (e.button === 1 || state.tool === 'pan') state.gesture = { kind: 'pan', clientX: e.clientX, clientY: e.clientY, camera: { ...state.camera } };
  else if (drawing) state.gesture = { kind: state.tool, start, before: snapshot(), preview: [] };
  else startSelectGesture(e, start);
  render();
}
// Select tool: pick what is under the pointer (Ctrl copies it) and start moving it, or resize from a handle.
function startSelectGesture(e, start) {
  const { end, corner, wall: wallId, symbol: symbolId } = e.target.dataset, onHandle = end !== undefined || corner !== undefined;
  if (symbolId) select(null, symbolId);
  else if (!onHandle) select(wallId || null, null, !!wallId && !!e.altKey);
  const before = snapshot(), copy = e.ctrlKey && !onHandle && (symbolId || wallId) ? duplicateSelection() : null;
  const group = selectedWalls(), originals = structuredClone(group), symbol = selectedSymbol();
  if (symbol) state.gesture = { kind: 'symbol', start, original: { ...symbol }, before, copy };
  else if (corner !== undefined) state.gesture = { kind: 'corner', corner: +corner, start, originals, points: M.roomCorners(originals), before };
  else if (end) state.gesture = { kind: 'endpoint', start, end, original: originals[0], before };
  else if (group.length) state.gesture = { kind: 'move', start, originals, before, copy };
  renderInspector();
}

// One pointer-move handler per gesture kind.
const DRAG = {
  pan(g, e) {
    const camera = state.camera;
    camera.x = g.camera.x - (e.clientX - g.clientX) / camera.scale;
    camera.y = g.camera.y - (e.clientY - g.clientY) / camera.scale;
  },
  wall(g, e) { g.preview = [M.wall(g.start, wallEnd(e, g))]; },
  rectangle(g, e) { g.preview = M.rectangle(g.start, wallEnd(e, g)); },
  move(g, e) {
    const p = point(e), delta = snapMove({ x: p.x - g.start.x, y: p.y - g.start.y }, g.originals);
    if (delta.x || delta.y) g.moved = true;
    replaceWalls(g.originals.map(o => M.move(o, delta)));
  },
  symbol(g, e) {
    const o = g.original;
    let at;
    if (M.SYMBOLS[o.type].wall) at = placement(e, o.type, o.rotation, o.id);
    else { const p = point(e); at = align({ x: M.round(o.x + p.x - g.start.x), y: M.round(o.y + p.y - g.start.y), rotation: o.rotation }, { x: true, y: true }, o.id); }
    if (at.x !== o.x || at.y !== o.y) g.moved = true;
    state.plan.symbols = state.plan.symbols.map(s => s.id === o.id ? { ...o, x: at.x, y: at.y, rotation: at.rotation } : s);
    state.guides = at.guides;
  },
  corner(g, e) {
    const p = editPoint(e, g), opposite = g.points[(g.corner + 2) % 4];
    const rect = { left: Math.min(opposite.x, p.x), right: Math.max(opposite.x, p.x), top: Math.min(opposite.y, p.y), bottom: Math.max(opposite.y, p.y) };
    if (rect.right - rect.left >= MIN_WALL && rect.bottom - rect.top >= MIN_WALL) replaceWalls(M.resizeRoom(g.originals, rect));
  },
  endpoint(g, e) {
    const next = { ...g.original, [g.end]: editPoint(e, g) };
    if (M.length(next) >= MIN_WALL) replaceWalls([next]);
  }
};
const EDIT_GESTURES = new Set(['move', 'endpoint', 'corner', 'symbol']);

function updateGesture(e) {
  state.lastPointer = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey };
  const g = state.gesture;
  if (!g) { hover(e); return; }
  DRAG[g.kind](g, e);
  render(); if (EDIT_GESTURES.has(g.kind)) renderInspector();
}
// No button pressed: measuring (Ctrl), snap references while drawing, and the symbol ghost.
function hover(e) {
  const { tool } = state, hadMeasure = !!state.measure;
  state.measure = e.ctrlKey ? M.findMeasure(point(e, false), state.plan.walls, px(SNAP_RADIUS), state.measure?.latched ? state.measure.anchor : undefined) : null;
  if (isDrawingTool(tool)) drawingPoint(e);
  if (tool === 'symbol') {
    const at = placement(e, state.symbolType);
    state.ghost = { id: 'ghost', type: state.symbolType, x: at.x, y: at.y, rotation: at.rotation }; state.guides = at.guides;
  }
  if (isDrawingTool(tool) || tool === 'symbol' || state.measure || hadMeasure) render();
}
function endGesture(e) {
  const g = state.gesture; if (!g) return;
  state.gesture = null; state.reference = null; state.guides = [];
  const drew = g.preview?.length > 0;
  if (drew && g.preview.every(w => M.length(w) >= MIN_WALL)) { state.plan.walls.push(...g.preview); select(g.preview[0].id); }
  if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  let before = g.before;
  // A Ctrl+drag copy that never moved is discarded, restoring the original selection.
  if (g.copy && !g.moved) { state.plan = JSON.parse(g.before); Object.assign(state, g.copy); before = null; }
  if (before) commit(before);
  if (drew) setTool('select');
  render(); renderInspector();
}
function cancelGesture() {
  state.reference = null; state.guides = [];
  const g = state.gesture; if (!g) return;
  if (g.before) state.plan = JSON.parse(g.before);
  state.gesture = null; render(); renderInspector();
}

svg.addEventListener('pointerdown', startGesture);
svg.addEventListener('pointermove', updateGesture);
svg.addEventListener('pointerup', endGesture);
svg.addEventListener('pointerleave', () => {
  if (state.gesture) return;
  Object.assign(state, { reference: null, measure: null, ghost: null, guides: [], lastPointer: null }); render();
});
svg.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
svg.addEventListener('pointercancel', cancelGesture);
svg.addEventListener('lostpointercapture', cancelGesture);
svg.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
// Shift and Ctrl take effect immediately, even if the mouse is not moving.
const onModifier = e => { if (['Shift', 'Control'].includes(e.key) && state.lastPointer) updateGesture({ ...state.lastPointer, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey }); };
document.addEventListener('keydown', onModifier); document.addEventListener('keyup', onModifier);
