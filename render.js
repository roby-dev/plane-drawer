'use strict';
// Draws the plan, selection handles and pointer overlays as SVG; updates the status bar, the inspector and the camera.
const svg = $('canvas');
const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT = 'Segoe UI, sans-serif';
const COLORS = {
  ink: '#344c63', dimension: '#526c83', paper: '#f5f9fc',
  accent: '#3471d5', accentDark: '#265cc6',
  guide: '#8b5cf6',
  reference: '#db8234', referenceText: '#8d4b13',
  measure: '#0f8f7a', measureText: '#0b6b5b'
};

function el(tag, attrs, parent, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  parent.append(node); return node;
}
// A light outline that keeps text readable over lines and the grid; `width` is in screen pixels.
const halo = width => ({ stroke: COLORS.paper, 'stroke-width': px(width), 'paint-order': 'stroke' });
const dashes = (on, off) => px(on) + ' ' + px(off);
const isPanning = () => state.gesture?.kind === 'pan';
function canvasCursor() {
  if (isPanning()) return 'grabbing';
  return { select: 'default', pan: 'grab' }[state.tool] || 'crosshair';
}

function drawWall(w, parent, { preview = false, active = false } = {}) {
  const group = el('g', {}, parent);
  const coords = { x1: w.a.x, y1: w.a.y, x2: w.b.x, y2: w.b.y };
  el('line', { ...coords, stroke: preview || active ? COLORS.accent : COLORS.ink, 'stroke-width': w.thickness, 'stroke-linecap': 'square', opacity: preview ? .65 : 1 }, group);
  if (!preview) {
    const cursor = isPanning() ? 'grabbing' : state.tool === 'select' ? 'move' : 'inherit';
    el('line', { ...coords, stroke: 'transparent', 'stroke-width': Math.max(w.thickness, px(18)), cursor }, group).dataset.wall = w.id;
  }
  if ($('dimensions').checked) drawDimension(w, group, active);
}
// Length label beside the wall, kept upright.
function drawDimension(w, parent, active) {
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, distance = M.length(w);
  if (!distance) return;
  const offset = .18 + px(12);
  const x = (w.a.x + w.b.x) / 2 + dy / distance * offset;
  const y = (w.a.y + w.b.y) / 2 - dx / distance * offset;
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  el('text', { x, y, transform: 'rotate(' + angle + ' ' + x + ' ' + y + ')', fill: active ? COLORS.accentDark : COLORS.dimension, 'font-size': px(12), 'font-family': FONT, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...halo(5), 'pointer-events': 'none' }, parent, distance.toFixed(2) + ' m');
}
function drawSymbol(sym, parent, preview = false) {
  const def = M.SYMBOLS[sym.type];
  const g = el('g', { transform: 'translate(' + sym.x + ' ' + sym.y + ') rotate(' + sym.rotation + ')', opacity: preview ? .6 : 1 }, parent);
  SYMBOL_SHAPES[sym.type]((tag, attrs, text) => el(tag, { ...SYMBOL_INK, ...attrs }, g, text));
  if (preview) return;
  const w = Math.max(def.w, .3) + .1, h = Math.max(def.h, .3) + .1, box = { x: -w / 2, y: -h / 2, width: w, height: h };
  if (sym.id === state.selectedSymbolId) el('rect', { ...box, fill: 'none', stroke: COLORS.accent, 'stroke-width': px(2), 'stroke-dasharray': dashes(5, 3), 'pointer-events': 'none' }, g);
  el('rect', { ...box, fill: 'transparent', cursor: state.tool === 'select' ? 'move' : 'inherit' }, g).dataset.symbol = sym.id;
}
// Corner handles for a selected room, endpoint handles for a single wall.
function drawHandles(group) {
  const handle = (p, radius, cursor) => el('circle', { cx: p.x, cy: p.y, r: px(radius), fill: 'white', stroke: COLORS.accentDark, 'stroke-width': px(2), cursor }, $('handles'));
  if (group.length === 4) M.roomCorners(group).forEach((p, i) => { handle(p, 7, i % 2 ? 'nesw-resize' : 'nwse-resize').dataset.corner = i; });
  else if (group.length) ['a', 'b'].forEach(end => { handle(group[0][end], 6, isPanning() ? 'grabbing' : 'crosshair').dataset.end = end; });
}
function drawGuide(g, parent) {
  const pad = .4, [x1, y1, x2, y2] = g.axis === 'x' ? [g.value, g.from - pad, g.value, g.to + pad] : [g.from - pad, g.value, g.to + pad, g.value];
  el('line', { x1, y1, x2, y2, stroke: COLORS.guide, 'stroke-width': px(1.5), 'stroke-dasharray': dashes(6, 4), 'pointer-events': 'none', 'data-guide': g.axis }, parent);
}
function drawReference({ point: { x, y }, kind }, parent) {
  el('circle', { cx: x, cy: y, r: px(7), fill: '#fff', stroke: COLORS.reference, 'stroke-width': px(2), 'pointer-events': 'none', 'data-reference': kind }, parent);
  el('text', { x: x + px(12), y: y - px(12), fill: COLORS.referenceText, 'font-size': px(11), 'pointer-events': 'none', ...halo(4) }, parent, kind === 'endpoint' ? 'Endpoint' : 'Wall reference');
}
function drawMeasure({ anchor, target, distance }, parent) {
  el('circle', { cx: anchor.x, cy: anchor.y, r: px(5), fill: COLORS.measure, 'pointer-events': 'none' }, parent);
  if (!target) return;
  el('line', { x1: anchor.x, y1: anchor.y, x2: target.x, y2: target.y, stroke: COLORS.measure, 'stroke-width': px(3), 'stroke-dasharray': dashes(6, 4), 'pointer-events': 'none' }, parent);
  el('text', { x: target.x + px(14), y: target.y + px(22), fill: COLORS.measureText, 'font-size': px(14), 'font-weight': 600, 'pointer-events': 'none', ...halo(5) }, parent, distance.toFixed(2) + ' m');
}
// Transient feedback: symbol ghost, alignment guides, walls being drawn, snap references and measurements.
function drawOverlays() {
  const parent = $('preview'), { tool, ghost, gesture, guides, reference, measure } = state;
  if (tool === 'symbol' && ghost && !gesture) drawSymbol(ghost, parent, true);
  guides.forEach(g => drawGuide(g, parent));
  gesture?.preview?.forEach(w => drawWall(w, parent, { preview: true }));
  if (reference && !isPanning()) drawReference(reference, parent);
  if (measure && !gesture) drawMeasure(measure, parent);
}
function renderStatus() {
  const { plan, tool, gesture } = state;
  $('empty').hidden = plan.walls.length > 0 || plan.symbols.length > 0 || tool !== 'select' || !!gesture;
  $('wall-count').textContent = plan.walls.length + (plan.walls.length === 1 ? ' wall' : ' walls');
  $('zoom-level').textContent = Math.round(state.camera.scale / BASE_SCALE * 100) + '%';
  $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
}
function render() {
  const { camera, plan } = state;
  svg.style.cursor = canvasCursor();
  const width = svg.clientWidth / camera.scale, height = svg.clientHeight / camera.scale;
  svg.setAttribute('viewBox', [camera.x, camera.y, width, height].join(' '));
  Object.entries({ x: camera.x, y: camera.y, width, height }).forEach(([k, v]) => $('paper').setAttribute(k, v));
  ['walls', 'symbols', 'handles', 'preview'].forEach(id => $(id).replaceChildren());
  const group = selectedWalls(), active = new Set(group.map(w => w.id));
  plan.walls.forEach(w => drawWall(w, $('walls'), { active: active.has(w.id) }));
  drawHandles(group);
  plan.symbols.forEach(sym => drawSymbol(sym, $('symbols')));
  drawOverlays();
  renderStatus();
}

// The Properties panel: room, wall or symbol fields, depending on the selection.
function renderInspector() {
  const group = selectedWalls(), w = group[0], room = group.length === 4, sym = selectedSymbol();
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

// Camera: zoom around the canvas center, or fit the whole plan.
function zoom(factor) {
  if (state.gesture) return;
  const camera = state.camera;
  const cx = camera.x + svg.clientWidth / camera.scale / 2, cy = camera.y + svg.clientHeight / camera.scale / 2;
  camera.scale = Math.max(15, Math.min(180, camera.scale * factor));
  camera.x = cx - svg.clientWidth / camera.scale / 2; camera.y = cy - svg.clientHeight / camera.scale / 2;
  render();
}
function fit() {
  if (!state.plan.walls.length) { state.camera = homeCamera(); render(); return; }
  const camera = state.camera, points = state.plan.walls.flatMap(w => [w.a, w.b]);
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
  camera.scale = Math.max(.05, Math.min(110, svg.clientWidth / (width + 3), svg.clientHeight / (height + 3)));
  camera.x = minX + width / 2 - svg.clientWidth / camera.scale / 2;
  camera.y = minY + height / 2 - svg.clientHeight / camera.scale / 2; render();
}
