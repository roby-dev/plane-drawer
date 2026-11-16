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

// `interactive` adds the invisible, wider hit area the pointer uses; previews and exports leave it out.
function drawWall(w, parent, { preview = false, active = false, interactive = !preview } = {}) {
  const group = el('g', {}, parent);
  const coords = { x1: w.a.x, y1: w.a.y, x2: w.b.x, y2: w.b.y };
  el('line', { ...coords, stroke: preview || active ? COLORS.accent : COLORS.ink, 'stroke-width': w.thickness, 'stroke-linecap': 'square', opacity: preview ? .65 : 1 }, group);
  if (interactive) {
    const cursor = isPanning() ? 'grabbing' : state.tool === 'select' || inGroup(w.id) ? 'move' : 'inherit';
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
const symbolTransform = sym => 'translate(' + sym.x + ' ' + sym.y + ') rotate(' + sym.rotation + ')';
// Clickable area around a symbol in its own coordinates, never smaller than 40 cm so small fixtures stay easy to pick.
function symbolBox(sym) {
  const size = M.symbolSize(sym), w = Math.max(size.w, .3) + .1, h = Math.max(size.h, .3) + .1;
  return { x: -w / 2, y: -h / 2, width: w, height: h };
}
function drawSymbol(sym, parent, { preview = false, interactive = !preview } = {}) {
  const def = M.SYMBOLS[sym.type], size = M.symbolSize(sym);
  const g = el('g', { transform: symbolTransform(sym), opacity: preview ? .6 : 1 }, parent);
  // Shapes are drawn at the catalog size; a resized symbol scales them. Text draws itself at its own size.
  const shape = def.text || (size.w === def.w && size.h === def.h) ? g : el('g', { transform: 'scale(' + size.w / def.w + ' ' + size.h / def.h + ')' }, g);
  SYMBOL_SHAPES[sym.type]((tag, attrs, text) => el(tag, { ...SYMBOL_INK, ...attrs }, shape, text), sym);
  if (!interactive) return;
  const box = symbolBox(sym);
  if (sym.id === state.selectedSymbolId || inGroup(sym.id)) el('rect', { ...box, fill: 'none', stroke: COLORS.accent, 'stroke-width': px(2), 'stroke-dasharray': dashes(5, 3), 'pointer-events': 'none' }, g);
  el('rect', { ...box, fill: 'transparent', cursor: state.tool === 'select' || inGroup(sym.id) ? 'move' : 'inherit' }, g).dataset.symbol = sym.id;
}
// Handles on the selected symbol: a knob above it to rotate, and edge/corner dots to resize.
function drawSymbolHandles(sym) {
  const g = el('g', { transform: symbolTransform(sym) }, $('handles')), box = symbolBox(sym);
  const right = box.x + box.width, bottom = box.y + box.height, knob = box.y - px(24);
  el('line', { x1: 0, y1: box.y, x2: 0, y2: knob, stroke: COLORS.accentDark, 'stroke-width': px(1.5), 'pointer-events': 'none' }, g);
  const handle = (name, x, y, cursor) => { el('circle', { cx: x, cy: y, r: px(6), fill: 'white', stroke: COLORS.accentDark, 'stroke-width': px(2), cursor }, g).dataset.symbolHandle = name; };
  handle('rotate', 0, knob, 'grab');
  // Text only changes its letter height; its width follows the words.
  if (M.SYMBOLS[sym.type].text) { handle('h', 0, bottom, 'ns-resize'); return; }
  handle('w', right, 0, 'ew-resize'); handle('h', 0, bottom, 'ns-resize'); handle('wh', right, bottom, 'nwse-resize');
}
// Corner handles for a selected room, endpoint handles for a single wall.
function drawHandles(group) {
  const handle = (p, radius, cursor) => el('circle', { cx: p.x, cy: p.y, r: px(radius), fill: 'white', stroke: COLORS.accentDark, 'stroke-width': px(2), cursor }, $('handles'));
  if (group.length === 4) M.roomCorners(group).forEach((p, i) => { handle(p, 7, i % 2 ? 'nesw-resize' : 'nwse-resize').dataset.corner = i; });
  else if (group.length) ['a', 'b'].forEach(end => { handle(group[0][end], 6, isPanning() ? 'grabbing' : 'crosshair').dataset.end = end; });
}
// Every complete room (four walls) with its bounds and its area in m², measured to wall centerlines.
function roomAreas() {
  const rooms = new Map();
  state.plan.walls.forEach(w => { if (w.room) rooms.set(w.room, [...(rooms.get(w.room) || []), w]); });
  return [...rooms].filter(([, walls]) => walls.length === 4).map(([room, walls]) => {
    const b = M.roomBounds(walls);
    return { room, b, area: (b.right - b.left) * (b.bottom - b.top) };
  });
}
// Each room's name and, while dimensions are shown, its area (measured to wall centerlines), centered in it.
function drawRoomLabels(parent) {
  for (const { room, b, area: size } of roomAreas()) {
    const x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2, name = state.plan.rooms[room];
    const area = $('dimensions').checked ? size.toFixed(2) + ' m²' : null;
    const label = (dy, attrs, text) => el('text', { x, y: y + dy, 'font-family': FONT, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...halo(5), 'pointer-events': 'none', ...attrs }, parent, text);
    if (name) label(0, { fill: COLORS.ink, 'font-size': px(14), 'font-weight': 600 }, name);
    if (area) label(name ? px(16) : 0, { fill: COLORS.dimension, 'font-size': px(12) }, area);
  }
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
  if (tool === 'symbol' && ghost && !gesture) drawSymbol(ghost, parent, { preview: true });
  guides.forEach(g => drawGuide(g, parent));
  gesture?.preview?.forEach(w => drawWall(w, parent, { preview: true }));
  if (reference && !isPanning()) drawReference(reference, parent);
  if (measure && !gesture) drawMeasure(measure, parent);
  if (gesture?.kind === 'marquee') drawMarquee(gesture, parent);
  if (tool === 'calibrate' && state.calibration) drawCalibration(state.calibration, parent);
}
// The reference image under the plan; it never takes pointer events, so drawing on top works as usual.
function drawBackdrop() {
  const b = state.backdrop; if (!b) return;
  el('image', { href: b.src, x: b.x, y: b.y, width: b.width, height: b.width * b.aspect, opacity: b.opacity, preserveAspectRatio: 'none', 'pointer-events': 'none' }, $('backdrop'));
}
// Set scale: a line from the first point picked to the pointer, with its current length on the image.
function drawCalibration({ first, end }, parent) {
  el('line', { x1: first.x, y1: first.y, x2: end.x, y2: end.y, stroke: COLORS.measure, 'stroke-width': px(2), 'stroke-dasharray': dashes(6, 4), 'pointer-events': 'none' }, parent);
  [first, end].forEach(p => el('circle', { cx: p.x, cy: p.y, r: px(5), fill: COLORS.measure, 'pointer-events': 'none' }, parent));
}
const boxOf = (a, b) => ({ left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) });
// The dashed box being dragged by the area selection tool.
function drawMarquee({ start, end }, parent) {
  const b = boxOf(start, end);
  el('rect', { x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, fill: COLORS.accent, 'fill-opacity': .08, stroke: COLORS.accent, 'stroke-width': px(1.5), 'stroke-dasharray': dashes(5, 3), 'pointer-events': 'none', 'data-marquee': '' }, parent);
}
function renderStatus() {
  const { plan, tool, gesture } = state;
  $('empty').hidden = plan.walls.length > 0 || plan.symbols.length > 0 || !!state.backdrop || tool !== 'select' || !!gesture;
  $('wall-count').textContent = plan.walls.length + (plan.walls.length === 1 ? ' wall' : ' walls');
  const total = roomAreas().reduce((sum, r) => sum + r.area, 0);
  $('total-area').hidden = !total; $('total-area').textContent = 'Rooms ' + total.toFixed(2) + ' m²';
  $('zoom-level').textContent = Math.round(state.camera.scale / BASE_SCALE * 100) + '%';
  const count = state.group ? state.group.walls.length + state.group.symbols.length : 0;
  $('hint').textContent = count ? count + (count === 1 ? ' item' : ' items') + ' selected. Drag any of them to move them all; Delete removes them; Esc clears.' : TOOL_HINTS[tool];
  $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length;
}
function render() {
  const { camera, plan } = state;
  svg.style.cursor = canvasCursor();
  const width = svg.clientWidth / camera.scale, height = svg.clientHeight / camera.scale;
  svg.setAttribute('viewBox', [camera.x, camera.y, width, height].join(' '));
  Object.entries({ x: camera.x, y: camera.y, width, height }).forEach(([k, v]) => $('paper').setAttribute(k, v));
  ['backdrop', 'walls', 'symbols', 'labels', 'handles', 'preview'].forEach(id => $(id).replaceChildren());
  drawBackdrop();
  const group = selectedWalls(), sym = selectedSymbol();
  drawPlan({ walls: $('walls'), symbols: $('symbols'), labels: $('labels') }, { selection: [...group, ...groupWalls()] });
  drawHandles(group);
  if (sym && state.tool === 'select') drawSymbolHandles(sym);
  drawOverlays();
  renderStatus();
}
// Walls, symbols and room names into the given layers; shared by the canvas and the SVG export.
function drawPlan(layers, { selection = [], interactive = true } = {}) {
  const active = new Set(selection.map(w => w.id));
  state.plan.walls.forEach(w => drawWall(w, layers.walls, { active: active.has(w.id), interactive }));
  state.plan.symbols.forEach(sym => drawSymbol(sym, layers.symbols, { interactive }));
  drawRoomLabels(layers.labels);
}
// The plan as standalone SVG markup at 100% zoom (1 m = 55 px), without grid, selection or handles; null when empty.
function planSvg() {
  const { plan } = state, pad = 1;
  const points = [...plan.walls.flatMap(w => [w.a, w.b]), ...plan.symbols.flatMap(s => {
    const { w, h } = M.symbolSize(s), r = Math.hypot(w, h) / 2;
    return [{ x: s.x - r, y: s.y - r }, { x: s.x + r, y: s.y + r }];
  })];
  if (!points.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = M.round(Math.min(...xs) - pad), y = M.round(Math.min(...ys) - pad);
  const width = M.round(Math.max(...xs) + pad - x), height = M.round(Math.max(...ys) + pad - y);
  // Labels are sized in screen pixels, so draw them as if the camera were at 100%.
  const camera = state.camera;
  state.camera = { x, y, scale: BASE_SCALE };
  try {
    const root = document.createElementNS(SVG_NS, 'svg');
    [['viewBox', [x, y, width, height].join(' ')], ['width', M.round(width * BASE_SCALE)], ['height', M.round(height * BASE_SCALE)]].forEach(([k, v]) => root.setAttribute(k, v));
    el('rect', { x, y, width, height, fill: '#fff' }, root);
    drawPlan({ walls: el('g', {}, root), symbols: el('g', {}, root), labels: el('g', {}, root) }, { interactive: false });
    return new XMLSerializer().serializeToString(root);
  } finally { state.camera = camera; }
}

// The Properties panel: room, wall or symbol fields, depending on the selection.
function renderInspector() {
  const group = selectedWalls(), w = group[0], room = group.length === 4, sym = selectedSymbol();
  $('inspector').hidden = !w && !sym;
  $('properties').hidden = !w || room; $('room-properties').hidden = !room; $('symbol-properties').hidden = !sym; $('no-selection').hidden = !!w || !!sym;
  $('selection-title').textContent = sym ? M.SYMBOLS[sym.type].label : room ? 'Selected room' : w ? 'Selected wall' : 'Your floor plan';
  if (room) {
    const b = M.roomBounds(group);
    $('room-width').value = M.round(b.right - b.left).toFixed(2); $('room-height').value = M.round(b.bottom - b.top).toFixed(2);
    $('room-thickness').value = w.thickness;
    $('room-name').value = state.plan.rooms[w.room] || '';
  } else if (w) {
    $('length').value = M.length(w).toFixed(2);
    $('angle').value = (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180 / Math.PI).toFixed(1);
    $('thickness').value = w.thickness;
  }
  if (sym) {
    const size = M.symbolSize(sym), isText = !!M.SYMBOLS[sym.type].text;
    $('symbol-text-fields').hidden = !isText; $('symbol-size-fields').hidden = isText;
    if (isText) { $('symbol-text').value = sym.text; $('symbol-font').value = size.h.toFixed(2); }
    else { $('symbol-width').value = size.w.toFixed(2); $('symbol-depth').value = size.h.toFixed(2); }
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
