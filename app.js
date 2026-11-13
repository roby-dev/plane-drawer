'use strict';
const M = PlanModel;
const $ = id => document.getElementById(id);
const svg = $('canvas');
const storageKey = 'planedrawer.plan.v1';
let plan = { name: 'Untitled plan', walls: [], symbols: [] };
let selected = null, tool = 'select', gesture = null, blockedStorage = false;
let guides = [], selectedSymbol = null, symbolType = 'door', ghost = null, palette = [];
let reference = null, measure = null, single = false, highlight = new Set();
function selectedWalls() {
  const w = plan.walls.find(x => x.id === selected);
  if (!w) return [];
  if (single || !w.room) return [w];
  const room = plan.walls.filter(x => x.room === w.room);
  return room.length === 4 ? room : [w];
}
let history = [], future = [];
let camera = { x: -2, y: -2, scale: 55 };
let messageTimer;
const snapshot = () => JSON.stringify(plan);
function notify(text) {
  $('message').textContent = text; $('message').hidden = false;
  clearTimeout(messageTimer); messageTimer = setTimeout(() => $('message').hidden = true, 6500);
}
function save() {
  if (blockedStorage) { $('save-state').textContent = 'Not saved — export a backup'; return; }
  try { localStorage.setItem(storageKey, M.encode(plan)); $('save-state').textContent = 'Saved on this device'; }
  catch { $('save-state').textContent = 'Not saved — export a backup'; notify('Browser storage is unavailable or full. Export your plan to keep a copy.'); }
}
function commit(before) {
  if (before === snapshot()) return;
  history.push(before); if (history.length > 100) history.shift();
  future = []; save(); render(); properties();
}
function el(tag, attrs, parent, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  parent.append(node); return node;
}
function drawWall(w, parent, preview = false) {
  const active = highlight.has(w.id);
  const group = el('g', {}, parent);
  const coords = { x1: w.a.x, y1: w.a.y, x2: w.b.x, y2: w.b.y };
  el('line', { ...coords, stroke: preview || active ? '#3471d5' : '#344c63', 'stroke-width': w.thickness, 'stroke-linecap': 'square', opacity: preview ? .65 : 1 }, group);
  if (!preview) {
    const hit = el('line', { ...coords, stroke: 'transparent', 'stroke-width': Math.max(w.thickness, 18 / camera.scale), cursor: gesture?.kind === 'pan' ? 'grabbing' : tool === 'select' ? 'move' : 'inherit' }, group);
    hit.dataset.wall = w.id;
  }
  if ($('dimensions').checked) {
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, distance = M.length(w);
    if (!distance) return;
    const offset = .18 + 12 / camera.scale;
    const x = (w.a.x + w.b.x) / 2 + dy / distance * offset;
    const y = (w.a.y + w.b.y) / 2 - dx / distance * offset;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;
    el('text', { x, y, transform: 'rotate(' + angle + ' ' + x + ' ' + y + ')', fill: active ? '#265cc6' : '#526c83', 'font-size': 12 / camera.scale, 'font-family': 'Segoe UI, sans-serif', 'text-anchor': 'middle', 'dominant-baseline': 'central', stroke: '#f5f9fc', 'stroke-width': 5 / camera.scale, 'paint-order': 'stroke', 'pointer-events': 'none' }, group, distance.toFixed(2) + ' m');
  }
}
const INK = { stroke: '#344c63', 'stroke-width': .025, fill: '#fff', 'stroke-linejoin': 'round' };
const PAPER = '#fbfdff';
// Plan symbols, drawn in meters around their center. Local +y points into the room (away from the wall).
const SHAPES = {
  door: add => {
    add('rect', { x: -.35, y: -.125, width: .7, height: .25, fill: PAPER, stroke: 'none' });
    add('line', { x1: -.35, y1: -.125, x2: -.35, y2: .125 }); add('line', { x1: .35, y1: -.125, x2: .35, y2: .125 });
    add('line', { x1: -.35, y1: 0, x2: -.35, y2: .7, 'stroke-width': .04 });
    add('path', { d: 'M .35 0 A .7 .7 0 0 1 -.35 .7', fill: 'none', 'stroke-dasharray': '.05 .04' });
  },
  window: add => {
    add('rect', { x: -.6, y: -.125, width: 1.2, height: .25, fill: PAPER, stroke: 'none' });
    add('rect', { x: -.6, y: -.06, width: 1.2, height: .12 }); add('line', { x1: -.6, y1: 0, x2: .6, y2: 0 });
  },
  toilet: add => { add('rect', { x: -.2, y: -.35, width: .4, height: .18, rx: .03 }); add('ellipse', { cx: 0, cy: .07, rx: .19, ry: .27 }); },
  sink: add => { add('rect', { x: -.25, y: -.2, width: .5, height: .4, rx: .05 }); add('ellipse', { cx: 0, cy: .04, rx: .17, ry: .11 }); add('circle', { cx: 0, cy: -.14, r: .025 }); },
  shower: add => {
    add('rect', { x: -.45, y: -.45, width: .9, height: .9 });
    add('line', { x1: -.45, y1: -.45, x2: .45, y2: .45, stroke: '#9bb0c4' }); add('line', { x1: .45, y1: -.45, x2: -.45, y2: .45, stroke: '#9bb0c4' });
    add('circle', { cx: 0, cy: 0, r: .05 });
  },
  'kitchen-sink': add => {
    add('rect', { x: -.6, y: -.3, width: 1.2, height: .6 });
    add('rect', { x: -.54, y: -.22, width: .5, height: .44, rx: .04 }); add('rect', { x: .04, y: -.22, width: .5, height: .44, rx: .04 });
    add('circle', { cx: 0, cy: -.26, r: .025 });
  },
  'laundry-sink': add => {
    add('rect', { x: -.4, y: -.3, width: .8, height: .6 });
    add('rect', { x: -.35, y: -.24, width: .42, height: .48, rx: .04 });
    [-.16, -.06, .04, .14].forEach(y => add('line', { x1: .12, y1: y, x2: .33, y2: y, stroke: '#9bb0c4' }));
    add('circle', { cx: -.14, cy: -.27, r: .025 });
  },
  washer: add => {
    add('rect', { x: -.3, y: -.3, width: .6, height: .6, rx: .03 });
    add('circle', { cx: 0, cy: .03, r: .2 }); add('circle', { cx: 0, cy: .03, r: .12 }); add('circle', { cx: -.2, cy: -.22, r: .02 });
  },
  'garage-door': add => {
    add('rect', { x: -1.2, y: -.125, width: 2.4, height: .25, fill: PAPER, stroke: 'none' });
    add('line', { x1: -1.2, y1: -.125, x2: -1.2, y2: .125 }); add('line', { x1: 1.2, y1: -.125, x2: 1.2, y2: .125 });
    add('rect', { x: -1.2, y: -.05, width: 2.4, height: .1 });
    [-.6, 0, .6].forEach(x => add('line', { x1: x, y1: -.05, x2: x, y2: .05, stroke: '#9bb0c4' }));
    add('rect', { x: -1.2, y: .05, width: 2.4, height: .4, fill: 'none', 'stroke-dasharray': '.08 .06', stroke: '#9bb0c4' });
  },
  car: add => {
    add('rect', { x: -.83, y: -1.8825, width: 1.66, height: 3.765, rx: .4 });
    add('path', { d: 'M -.6 -.9 L -.5 -1.38 H .5 L .6 -.9 Z', fill: '#e3edf6' });
    add('path', { d: 'M -.6 1 L -.5 1.38 H .5 L .6 1 Z', fill: '#e3edf6' });
    add('rect', { x: -.58, y: -.75, width: 1.16, height: 1.6, rx: .12, fill: 'none', stroke: '#9bb0c4' });
    [[-.83, -1.35], [.75, -1.35], [-.83, .95], [.75, .95]].forEach(([x, y]) => add('rect', { x, y, width: .08, height: .4, rx: .02, fill: '#344c63' }));
  },
  'water-cold': add => { add('circle', { cx: 0, cy: 0, r: .12, fill: '#2f80ed' }); add('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': .15, fill: '#fff', stroke: 'none', 'font-family': 'Segoe UI, sans-serif' }, 'C'); },
  'water-hot': add => { add('circle', { cx: 0, cy: 0, r: .12, fill: '#e5484d' }); add('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': .15, fill: '#fff', stroke: 'none', 'font-family': 'Segoe UI, sans-serif' }, 'H'); },
  drain: add => { add('circle', { cx: 0, cy: 0, r: .12 }); add('line', { x1: -.07, y1: -.07, x2: .07, y2: .07 }); add('line', { x1: .07, y1: -.07, x2: -.07, y2: .07 }); }
};
function drawSymbol(sym, parent, preview = false) {
  const def = M.SYMBOLS[sym.type];
  const g = el('g', { transform: 'translate(' + sym.x + ' ' + sym.y + ') rotate(' + sym.rotation + ')', opacity: preview ? .6 : 1 }, parent);
  SHAPES[sym.type]((tag, attrs, text) => el(tag, { ...INK, ...attrs }, g, text));
  const w = Math.max(def.w, .3) + .1, h = Math.max(def.h, .3) + .1;
  if (sym.id === selectedSymbol && !preview) el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: 'none', stroke: '#3471d5', 'stroke-width': 2 / camera.scale, 'stroke-dasharray': (5 / camera.scale) + ' ' + (3 / camera.scale), 'pointer-events': 'none' }, g);
  if (!preview) {
    const hit = el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: 'transparent', cursor: tool === 'select' ? 'move' : 'inherit' }, g);
    hit.dataset.symbol = sym.id;
  }
}
function render() {
  svg.style.cursor = gesture?.kind === 'pan' ? 'grabbing' : tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair';
  const width = svg.clientWidth / camera.scale, height = svg.clientHeight / camera.scale;
  svg.setAttribute('viewBox', [camera.x, camera.y, width, height].join(' '));
  Object.entries({ x: camera.x, y: camera.y, width, height }).forEach(([k,v]) => $('paper').setAttribute(k,v));
  $('walls').replaceChildren(); $('symbols').replaceChildren(); $('handles').replaceChildren(); $('preview').replaceChildren();
  const group = selectedWalls(), wall = group[0];
  highlight = new Set(group.map(w => w.id));
  plan.walls.forEach(w => drawWall(w, $('walls')));
  if (group.length === 4) {
    const b = M.roomBounds(group);
    [[b.left, b.top], [b.right, b.top], [b.right, b.bottom], [b.left, b.bottom]].forEach(([x, y], i) => {
      const dot = el('circle', { cx: x, cy: y, r: 7 / camera.scale, fill: 'white', stroke: '#265cc6', 'stroke-width': 2 / camera.scale, cursor: i % 2 ? 'nesw-resize' : 'nwse-resize' }, $('handles'));
      dot.dataset.corner = i;
    });
  } else if (wall) ['a','b'].forEach(end => {
    const dot = el('circle', { cx: wall[end].x, cy: wall[end].y, r: 6 / camera.scale, fill: 'white', stroke: '#265cc6', 'stroke-width': 2 / camera.scale, cursor: gesture?.kind === 'pan' ? 'grabbing' : 'crosshair' }, $('handles'));
    dot.dataset.end = end;
  });
  plan.symbols.forEach(sym => drawSymbol(sym, $('symbols')));
  if (tool === 'symbol' && ghost && !gesture) drawSymbol(ghost, $('preview'), true);
  guides.forEach(g => {
    const pad = .4, [x1, y1, x2, y2] = g.axis === 'x' ? [g.value, g.from - pad, g.value, g.to + pad] : [g.from - pad, g.value, g.to + pad, g.value];
    el('line', { x1, y1, x2, y2, stroke: '#8b5cf6', 'stroke-width': 1.5 / camera.scale, 'stroke-dasharray': (6 / camera.scale) + ' ' + (4 / camera.scale), 'pointer-events': 'none', 'data-guide': g.axis }, $('preview'));
  });
  if (gesture?.preview) gesture.preview.forEach(w => drawWall(w, $('preview'), true));
  if (reference && gesture?.kind !== 'pan') {
    const { x, y } = reference.point;
    el('circle', { cx: x, cy: y, r: 7 / camera.scale, fill: '#fff', stroke: '#db8234', 'stroke-width': 2 / camera.scale, 'pointer-events': 'none', 'data-reference': reference.kind }, $('preview'));
    el('text', { x: x + 12 / camera.scale, y: y - 12 / camera.scale, fill: '#8d4b13', 'font-size': 11 / camera.scale, 'pointer-events': 'none', stroke: '#f5f9fc', 'stroke-width': 4 / camera.scale, 'paint-order': 'stroke' }, $('preview'), reference.kind === 'endpoint' ? 'Endpoint' : 'Wall reference');
  }
  if (measure && !gesture) {
    const { anchor, target, distance } = measure, px = 1 / camera.scale;
    el('circle', { cx: anchor.x, cy: anchor.y, r: 5 * px, fill: '#0f8f7a', 'pointer-events': 'none' }, $('preview'));
    if (target) {
      el('line', { x1: anchor.x, y1: anchor.y, x2: target.x, y2: target.y, stroke: '#0f8f7a', 'stroke-width': 3 * px, 'stroke-dasharray': (6 * px) + ' ' + (4 * px), 'pointer-events': 'none' }, $('preview'));
      el('text', { x: target.x + 14 * px, y: target.y + 22 * px, fill: '#0b6b5b', 'font-size': 14 * px, 'font-weight': 600, 'pointer-events': 'none', stroke: '#f5f9fc', 'stroke-width': 5 * px, 'paint-order': 'stroke' }, $('preview'), distance.toFixed(2) + ' m');
    }
  }
  $('empty').hidden = plan.walls.length > 0 || plan.symbols.length > 0 || tool !== 'select' || !!gesture;
  $('wall-count').textContent = plan.walls.length + (plan.walls.length === 1 ? ' wall' : ' walls');
  $('zoom-level').textContent = Math.round(camera.scale / 55 * 100) + '%';
  $('undo').disabled = !history.length; $('redo').disabled = !future.length;
}
function properties() {
  const group = selectedWalls(), w = group[0], room = group.length === 4, sym = plan.symbols.find(x => x.id === selectedSymbol);
  $('properties').hidden = !w || room; $('room-properties').hidden = !room; $('symbol-properties').hidden = !sym; $('no-selection').hidden = !!w || !!sym;
  $('selection-title').textContent = sym ? M.SYMBOLS[sym.type].label : room ? 'Selected room' : w ? 'Selected wall' : 'Your floor plan';
  if (room) {
    const b = M.roomBounds(group);
    $('room-width').value = M.round(b.right - b.left).toFixed(2); $('room-height').value = M.round(b.bottom - b.top).toFixed(2);
    $('room-thickness').value = w.thickness;
  } else if (w) {
    $('length').value = M.length(w).toFixed(2);
    $('angle').value = (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180 / Math.PI).toFixed(1);
    $('thickness').value = w.thickness;
  }
}
function point(e, snap = true) {
  const rect = svg.getBoundingClientRect();
  const p = { x: camera.x + (e.clientX - rect.left) / camera.scale, y: camera.y + (e.clientY - rect.top) / camera.scale };
  if (snap && $('snap').checked) { p.x = Math.round(p.x * 10) / 10; p.y = Math.round(p.y * 10) / 10; }
  return p;
}
// Symbol centers and wall corners that a moving symbol can line up with.
function alignTargets(excludeId) {
  return [...plan.symbols.filter(x => x.id !== excludeId), ...plan.walls.flatMap(w => [w.a, w.b])].map(t => ({ x: t.x, y: t.y }));
}
function align(at, free, excludeId) {
  const a = M.findAlignment(at, alignTargets(excludeId), 10 / camera.scale, free);
  return { x: a.x, y: a.y, rotation: at.rotation, guides: a.guides };
}
function placement(e, type, rotation = 0, excludeId) {
  if (M.SYMBOLS[type].wall) {
    const hit = M.snapToWall(point(e, false), plan.walls, 24 / camera.scale);
    if (hit) {
      const r = Math.abs(hit.rotation), along = r === 0 || r === 180 ? { x: true, y: false } : r === 90 ? { x: false, y: true } : { x: false, y: false };
      return align(hit, along, excludeId);
    }
  }
  const p = point(e); return align({ x: p.x, y: p.y, rotation }, { x: true, y: true }, excludeId);
}
function placeSymbol(e) {
  const before = snapshot(), at = placement(e, symbolType), sym = M.symbol(symbolType, at.x, at.y, at.rotation);
  plan.symbols.push(sym); selectedSymbol = sym.id; selected = null; single = false; guides = []; commit(before);
}
// Ctrl+drag: duplicate the selection in place; the copy is what gets dragged. Returns the selection to restore if nothing moves.
function duplicateSelection() {
  const restore = { selected, selectedSymbol, single };
  const sym = plan.symbols.find(x => x.id === selectedSymbol);
  if (sym) { const copy = M.symbol(sym.type, sym.x, sym.y, sym.rotation); plan.symbols.push(copy); selectedSymbol = copy.id; return restore; }
  const copies = M.duplicateWalls(selectedWalls());
  if (!copies.length) return null;
  plan.walls.push(...copies); selected = copies[0].id; return restore;
}
function rotateSelected() {
  const sym = plan.symbols.find(x => x.id === selectedSymbol); if (!sym) return;
  const before = snapshot(); sym.rotation = (sym.rotation + 90) % 360; if (sym.rotation > 180) sym.rotation -= 360;
  commit(before);
}
function drawingPoint(e, walls = plan.walls) {
  reference = M.findReference(point(e, false), walls, 12 / camera.scale);
  return reference ? reference.point : point(e);
}
function cornersOf(walls) {
  const b = M.roomBounds(walls);
  return [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom }];
}
function cancelGesture() {
  reference = null; guides = [];
  if (!gesture) return;
  if (gesture.before) plan = JSON.parse(gesture.before);
  gesture = null; render(); properties();
}
function setTool(next) {
  cancelGesture(); tool = next; ghost = null; guides = [];
  palette.forEach(b => b.classList.toggle('active', tool === 'symbol' && b.dataset.symbol === symbolType));
  document.querySelectorAll('[data-tool]').forEach(b => { b.classList.toggle('active', b.dataset.tool === tool); b.setAttribute('aria-pressed', b.dataset.tool === tool); });
  $('hint').textContent = { select: 'Drag a room to move it, its corners to resize. Ctrl+drag copies. Alt+click picks a single wall. Hold Ctrl over a corner and slide along a wall to measure.', rectangle: 'Drag to draw a room. Orange marks snap to existing walls.', wall: 'Drag to draw. Orange marks snap to walls; Shift aligns free lines.', pan: 'Drag to pan. Hold the middle mouse button from any tool.', symbol: 'Click to place. Doors and windows snap onto walls (click on the side they should open). Purple lines show alignment with other symbols and corners. Q rotates, Esc finishes.' }[tool];
  svg.style.cursor = tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair';
  render();
}
svg.addEventListener('pointerdown', e => {
  if (![0, 1].includes(e.button) || gesture) return;
  if (e.button === 1) e.preventDefault();
  if (e.button === 0 && tool === 'symbol') { svg.focus({ preventScroll: true }); placeSymbol(e); return; }
  svg.focus({ preventScroll: true }); svg.setPointerCapture(e.pointerId);
  reference = null; measure = null;
  const start = e.button === 0 && (tool === 'wall' || tool === 'rectangle') ? drawingPoint(e) : point(e);
  if (e.button === 1 || tool === 'pan') gesture = { kind: 'pan', clientX: e.clientX, clientY: e.clientY, camera: { ...camera } };
  else if (tool === 'wall' || tool === 'rectangle') gesture = { kind: tool, start, before: snapshot(), preview: [] };
  else {
    const end = e.target.dataset.end, corner = e.target.dataset.corner, id = e.target.dataset.wall, symbolId = e.target.dataset.symbol;
    if (symbolId) { selectedSymbol = symbolId; selected = null; single = false; }
    else if (!end && corner === undefined) { selected = id || null; single = !!id && !!e.altKey; selectedSymbol = null; }
    const before = snapshot(), copy = e.ctrlKey && end === undefined && corner === undefined && (symbolId || id) ? duplicateSelection() : null;
    const group = selectedWalls(), originals = structuredClone(group), movingSymbol = plan.symbols.find(x => x.id === selectedSymbol);
    if (movingSymbol) gesture = { kind: 'symbol', start, original: { ...movingSymbol }, before, copy };
    else if (corner !== undefined) gesture = { kind: 'corner', corner: +corner, start, originals, points: cornersOf(originals), before };
    else if (end) gesture = { kind: 'endpoint', start, end, original: originals[0], before };
    else if (group.length) gesture = { kind: 'move', start, originals, before, copy };
    properties();
  }
  render();
});
// Horizontal/vertical line from `from`, ending at an endpoint or crossing found on that line.
function straightEnd(e, from, walls) {
  const raw = point(e, false), snapped = point(e);
  const horizontal = Math.abs(raw.x - from.x) >= Math.abs(raw.y - from.y);
  const locked = horizontal ? { x: snapped.x, y: from.y } : { x: from.x, y: snapped.y };
  reference = M.findLineReference(from, locked, walls, 12 / camera.scale);
  return reference ? reference.point : locked;
}
function wallEnd(e, g) {
  return e.shiftKey && g.kind === 'wall' ? straightEnd(e, g.start, plan.walls) : drawingPoint(e);
}
// While editing, references come from every wall except the ones being edited.
function editPoint(e, g) {
  const skip = new Set(g.kind === 'endpoint' ? [selected] : g.originals.map(w => w.id));
  const others = plan.walls.filter(w => !skip.has(w.id));
  if (g.kind === 'endpoint' && e.shiftKey) return straightEnd(e, g.original[g.end === 'a' ? 'b' : 'a'], others);
  return drawingPoint(e, others);
}
// Nudge a move so the closest moved endpoint lands on a reference of a wall that is not moving.
function snapMove(delta, originals) {
  const skip = new Set(originals.map(w => w.id)), others = plan.walls.filter(w => !skip.has(w.id));
  let best = null;
  for (const w of originals) for (const end of [w.a, w.b]) {
    const at = { x: end.x + delta.x, y: end.y + delta.y }, ref = M.findReference(at, others, 12 / camera.scale);
    if (!ref) continue;
    const shift = { x: ref.point.x - at.x, y: ref.point.y - at.y }, d = Math.hypot(shift.x, shift.y);
    if (!best || d < best.d) best = { d, ref, shift };
  }
  reference = best ? best.ref : null;
  return best ? { x: delta.x + best.shift.x, y: delta.y + best.shift.y } : delta;
}
let lastPointer = null;
function updateGesture(e) {
  lastPointer = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey };
  if (!gesture) {
    const hadMeasure = !!measure;
    measure = e.ctrlKey ? M.findMeasure(point(e, false), plan.walls, 12 / camera.scale, measure?.latched ? measure.anchor : undefined) : null;
    const drawing = tool === 'wall' || tool === 'rectangle';
    if (drawing) drawingPoint(e);
    if (tool === 'symbol') { const at = placement(e, symbolType); ghost = { id: 'ghost', type: symbolType, x: at.x, y: at.y, rotation: at.rotation }; guides = at.guides; }
    if (drawing || tool === 'symbol' || measure || hadMeasure) render();
    return;
  }
  const g = gesture, p = g.kind === 'wall' || g.kind === 'rectangle' ? wallEnd(e, g) : g.kind === 'endpoint' || g.kind === 'corner' ? editPoint(e, g) : point(e);
  if (g.kind === 'pan') {
    camera.x = g.camera.x - (e.clientX - g.clientX) / camera.scale;
    camera.y = g.camera.y - (e.clientY - g.clientY) / camera.scale;
  } else if (g.kind === 'move') {
    const delta = snapMove({ x: p.x - g.start.x, y: p.y - g.start.y }, g.originals);
    if (delta.x || delta.y) g.moved = true;
    g.originals.forEach(o => { plan.walls[plan.walls.findIndex(w => w.id === o.id)] = M.move(o, delta); });
  } else if (g.kind === 'symbol') {
    const o = g.original, i = plan.symbols.findIndex(x => x.id === o.id);
    const at = M.SYMBOLS[o.type].wall ? placement(e, o.type, o.rotation, o.id)
      : align({ x: M.round(o.x + p.x - g.start.x), y: M.round(o.y + p.y - g.start.y), rotation: o.rotation }, { x: true, y: true }, o.id);
    if (at.x !== o.x || at.y !== o.y) g.moved = true;
    plan.symbols[i] = { ...o, x: at.x, y: at.y, rotation: at.rotation }; guides = at.guides;
  } else if (g.kind === 'corner') {
    const opposite = g.points[(g.corner + 2) % 4];
    const rect = { left: Math.min(opposite.x, p.x), right: Math.max(opposite.x, p.x), top: Math.min(opposite.y, p.y), bottom: Math.max(opposite.y, p.y) };
    if (rect.right - rect.left >= .1 && rect.bottom - rect.top >= .1) M.resizeRoom(g.originals, rect).forEach(n => { plan.walls[plan.walls.findIndex(w => w.id === n.id)] = n; });
  } else if (g.kind === 'endpoint') {
    const i = plan.walls.findIndex(w => w.id === selected);
    const next = { ...g.original, [g.end]: p };
    if (M.length(next) >= .1) plan.walls[i] = next;
  } else {
    g.preview = g.kind === 'rectangle' ? M.rectangle(g.start, p) : [M.wall(g.start, p)];
  }
  render(); if (['move', 'endpoint', 'corner', 'symbol'].includes(g.kind)) properties();
}
svg.addEventListener('pointermove', updateGesture);
// Shift takes effect immediately, even if the mouse is not moving.
const onModifier = e => { if (['Shift', 'Control'].includes(e.key) && lastPointer) updateGesture({ ...lastPointer, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey }); };
document.addEventListener('keydown', onModifier); document.addEventListener('keyup', onModifier);
svg.addEventListener('pointerup', e => {
  if (!gesture) return;
  const g = gesture; gesture = null; reference = null; guides = [];
  if (g.preview?.length && g.preview.every(w => M.length(w) >= .1)) {
    plan.walls.push(...g.preview); selected = g.preview[0].id; single = false; selectedSymbol = null;
  }
  if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  if (g.copy && !g.moved) { plan = JSON.parse(g.before); ({ selected, selectedSymbol, single } = g.copy); g.before = null; }
  if (g.before) commit(g.before);
  if (g.preview?.length) setTool('select');
  render(); properties();
});
svg.addEventListener('pointerleave', () => { if (!gesture) { reference = null; measure = null; ghost = null; guides = []; lastPointer = null; render(); } });
svg.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
svg.addEventListener('pointercancel', cancelGesture);
svg.addEventListener('lostpointercapture', cancelGesture);
function zoom(factor) {
  if (gesture) return;
  const cx = camera.x + svg.clientWidth / camera.scale / 2, cy = camera.y + svg.clientHeight / camera.scale / 2;
  camera.scale = Math.max(15, Math.min(180, camera.scale * factor));
  camera.x = cx - svg.clientWidth / camera.scale / 2; camera.y = cy - svg.clientHeight / camera.scale / 2;
  render();
}
svg.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
function fit() {
  if (!plan.walls.length) { camera = { x: -2, y: -2, scale: 55 }; render(); return; }
  const points = plan.walls.flatMap(w => [w.a, w.b]);
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
  camera.scale = Math.max(.05, Math.min(110, svg.clientWidth / (width + 3), svg.clientHeight / (height + 3)));
  camera.x = minX + width / 2 - svg.clientWidth / camera.scale / 2;
  camera.y = minY + height / 2 - svg.clientHeight / camera.scale / 2; render();
}
function undo(redo = false) {
  cancelGesture();
  const source = redo ? future : history, target = redo ? history : future;
  if (!source.length) return;
  target.push(snapshot()); plan = JSON.parse(source.pop()); selected = null; selectedSymbol = null;
  $('plan-name').value = plan.name; save(); render(); properties();
}
function removeSelected() {
  if (selectedSymbol) { const before = snapshot(); plan.symbols = plan.symbols.filter(x => x.id !== selectedSymbol); selectedSymbol = null; commit(before); return; }
  if (!selected) return;
  const before = snapshot(), ids = new Set(selectedWalls().map(w => w.id)); plan.walls = plan.walls.filter(w => !ids.has(w.id)); selected = null; commit(before);
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
Object.entries(M.SYMBOLS).forEach(([type, def]) => {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.symbol = type; button.textContent = def.label; button.title = def.label;
  button.onclick = () => { symbolType = type; setTool('symbol'); };
  palette.push(button); $('symbol-list').append(button);
});
$('symbol-rotate').onclick = rotateSelected; $('symbol-delete').onclick = removeSelected;
$('start').onclick = () => setTool('rectangle');
$('undo').onclick = () => undo(); $('redo').onclick = () => undo(true);
$('zoom-in').onclick = () => zoom(1.2); $('zoom-out').onclick = () => zoom(1 / 1.2); $('fit').onclick = fit;
$('dimensions').onchange = render; $('delete').onclick = removeSelected;
$('properties').onsubmit = e => {
  e.preventDefault();
  const i = plan.walls.findIndex(w => w.id === selected); if (i < 0) return;
  const before = snapshot();
  try { plan.walls[i] = { ...M.resize(plan.walls[i], +$('length').value, +$('angle').value), thickness: +$('thickness').value }; commit(before); }
  catch { notify('Enter a wall length between 0.10 and 1000 meters.'); }
};
$('room-properties').onsubmit = e => {
  e.preventDefault();
  const group = selectedWalls(); if (group.length !== 4) return;
  const width = +$('room-width').value, height = +$('room-height').value, thickness = +$('room-thickness').value;
  const valid = n => Number.isFinite(n) && n >= .1 && n <= 1000;
  if (!valid(width) || !valid(height) || !(thickness >= .05 && thickness <= 1)) { notify('Enter a width and height between 0.10 and 1000 meters, and a thickness between 0.05 and 1.'); return; }
  const before = snapshot(), b = M.roomBounds(group);
  M.resizeRoom(group, { left: b.left, top: b.top, right: b.left + width, bottom: b.top + height })
    .forEach(n => { plan.walls[plan.walls.findIndex(w => w.id === n.id)] = { ...n, thickness }; });
  commit(before);
};
$('plan-name').onchange = () => { const before = snapshot(); plan.name = $('plan-name').value.trim() || 'Untitled plan'; $('plan-name').value = plan.name; commit(before); };
$('example').onclick = () => {
  const before = snapshot();
  plan.walls.push(...M.rectangle({ x: 0, y: 0 }, { x: 8, y: 6 }), M.wall({ x: 5, y: 0 }, { x: 5, y: 3.5 }), M.wall({ x: 5, y: 3.5 }, { x: 8, y: 3.5 }));
  plan.symbols.push(M.symbol('door', 2, 6, 180), M.symbol('window', 6.5, 0, 0)); plan.name = 'My first space'; $('plan-name').value = plan.name; commit(before); fit();
};
$('clear').onclick = () => {
  if (!confirm('Start a new plan? Export a backup first if you want to keep the current plan.')) return;
  cancelGesture(); const before = snapshot(); plan = { name: 'Untitled plan', walls: [], symbols: [] }; selected = null; selectedSymbol = null; blockedStorage = false;
  $('plan-name').value = plan.name; commit(before); save(); setTool('select'); properties(); fit();
};
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([M.encode(plan)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = (plan.name.replace(/[^a-z0-9 -]/gi, '').trim() || 'floor-plan') + '.json';
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async () => {
  const file = $('import-file').files[0]; if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('File too large');
    const imported = M.decode(await file.text());
    if (!confirm('Replace this plan with the imported plan? Export a backup first if needed.')) return;
    cancelGesture(); const before = snapshot(); plan = imported; selected = null; blockedStorage = false;
    $('plan-name').value = plan.name; commit(before); save(); properties(); fit();
  } catch { notify('This file is not a supported PlaneDrawer plan. Your current plan was not changed.'); }
  finally { $('import-file').value = ''; }
};
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'Escape') { cancelGesture(); selected = null; selectedSymbol = null; setTool('select'); properties(); }
  if ((e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase())) { e.preventDefault(); undo(e.key.toLowerCase() === 'y' || e.shiftKey); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  if (e.key.toLowerCase() === 'q') rotateSelected();
  const next = { v: 'select', r: 'rectangle', w: 'wall', h: 'pan' }[e.key.toLowerCase()]; if (next) setTool(next);
});
try { const raw = localStorage.getItem(storageKey); if (raw) plan = M.decode(raw); }
catch { blockedStorage = true; $('save-state').textContent = 'Not saved — storage unavailable'; notify('Stored data could not be loaded. It has not been overwritten. Export your work before starting a new plan.'); }
$('plan-name').value = plan.name;
new ResizeObserver(() => render()).observe($('drawing'));
properties(); render(); if (plan.walls.length) fit();

