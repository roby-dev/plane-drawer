'use strict';
const M = PlanModel;
const $ = id => document.getElementById(id);
const svg = $('canvas');
const storageKey = 'planedrawer.plan.v1';
let plan = { name: 'Untitled plan', walls: [] };
let selected = null, tool = 'select', gesture = null, blockedStorage = false;
let reference = null;
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
  const active = w.id === selected;
  const group = el('g', {}, parent);
  const coords = { x1: w.a.x, y1: w.a.y, x2: w.b.x, y2: w.b.y };
  el('line', { ...coords, stroke: preview || active ? '#3471d5' : '#344c63', 'stroke-width': w.thickness, 'stroke-linecap': 'square', opacity: preview ? .65 : 1 }, group);
  if (!preview) {
    const hit = el('line', { ...coords, stroke: 'transparent', 'stroke-width': Math.max(w.thickness, 18 / camera.scale), cursor: 'move' }, group);
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
function render() {
  svg.style.cursor = gesture?.kind === 'pan' ? 'grabbing' : tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair';
  const width = svg.clientWidth / camera.scale, height = svg.clientHeight / camera.scale;
  svg.setAttribute('viewBox', [camera.x, camera.y, width, height].join(' '));
  Object.entries({ x: camera.x, y: camera.y, width, height }).forEach(([k,v]) => $('paper').setAttribute(k,v));
  $('walls').replaceChildren(); $('handles').replaceChildren(); $('preview').replaceChildren();
  plan.walls.forEach(w => drawWall(w, $('walls')));
  const wall = plan.walls.find(w => w.id === selected);
  if (wall) ['a','b'].forEach(end => {
    const dot = el('circle', { cx: wall[end].x, cy: wall[end].y, r: 6 / camera.scale, fill: 'white', stroke: '#265cc6', 'stroke-width': 2 / camera.scale, cursor: 'crosshair' }, $('handles'));
    dot.dataset.end = end;
  });
  if (gesture?.preview) gesture.preview.forEach(w => drawWall(w, $('preview'), true));
  $('empty').hidden = plan.walls.length > 0 || tool !== 'select' || !!gesture;
  $('wall-count').textContent = plan.walls.length + (plan.walls.length === 1 ? ' wall' : ' walls');
  $('zoom-level').textContent = Math.round(camera.scale / 55 * 100) + '%';
  $('undo').disabled = !history.length; $('redo').disabled = !future.length;
}
function properties() {
  const w = plan.walls.find(w => w.id === selected);
  $('properties').hidden = !w; $('no-selection').hidden = !!w;
  $('selection-title').textContent = w ? 'Selected wall' : 'Your floor plan';
  if (w) {
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
function drawingPoint(e) {
  reference = M.findReference(point(e, false), plan.walls, 12 / camera.scale);
  return reference ? reference.point : point(e);
}
function cancelGesture() {
  reference = null;
  if (!gesture) return;
  if (gesture.before) plan = JSON.parse(gesture.before);
  gesture = null; render(); properties();
}
function setTool(next) {
  cancelGesture(); tool = next;
  document.querySelectorAll('[data-tool]').forEach(b => { b.classList.toggle('active', b.dataset.tool === tool); b.setAttribute('aria-pressed', b.dataset.tool === tool); });
  $('hint').textContent = { select: 'Drag a wall to move it. Drag its endpoints to resize or rotate.', rectangle: 'Drag diagonally to create a room. Measurements are in meters.', wall: 'Drag from start to end. Hold Shift for horizontal or vertical walls.', pan: 'Drag the canvas to move your view. Scroll to zoom.' }[tool];
  svg.style.cursor = tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair';
  render();
}
svg.addEventListener('pointerdown', e => {
  if (![0, 1].includes(e.button) || gesture) return;
  if (e.button === 1) e.preventDefault();
  svg.focus({ preventScroll: true }); svg.setPointerCapture(e.pointerId);
  reference = null;
  const start = e.button === 0 && (tool === 'wall' || tool === 'rectangle') ? drawingPoint(e) : point(e);
  if (e.button === 1 || tool === 'pan') gesture = { kind: 'pan', clientX: e.clientX, clientY: e.clientY, camera: { ...camera } };
  else if (tool === 'wall' || tool === 'rectangle') gesture = { kind: tool, start, before: snapshot(), preview: [] };
  else {
    const end = e.target.dataset.end, id = e.target.dataset.wall;
    if (!end) selected = id || null;
    const original = plan.walls.find(w => w.id === selected);
    if (original) gesture = { kind: end ? 'endpoint' : 'move', start, end, original: structuredClone(original), before: snapshot() };
    properties();
  }
  render();
});
svg.addEventListener('pointermove', e => {
  if (!gesture) {
    if (tool === 'wall' || tool === 'rectangle') { drawingPoint(e); render(); }
    return;
  }
  const g = gesture, p = g.kind === 'wall' || g.kind === 'rectangle' ? drawingPoint(e) : point(e);
  if (g.kind === 'pan') {
    camera.x = g.camera.x - (e.clientX - g.clientX) / camera.scale;
    camera.y = g.camera.y - (e.clientY - g.clientY) / camera.scale;
  } else if (g.kind === 'move') {
    const i = plan.walls.findIndex(w => w.id === selected);
    plan.walls[i] = M.move(g.original, { x: p.x - g.start.x, y: p.y - g.start.y });
  } else if (g.kind === 'endpoint') {
    const i = plan.walls.findIndex(w => w.id === selected);
    const next = { ...g.original, [g.end]: p };
    if (M.length(next) >= .1) plan.walls[i] = next;
  } else {
    if (e.shiftKey && g.kind === 'wall' && !reference) {
      if (Math.abs(p.x - g.start.x) > Math.abs(p.y - g.start.y)) p.y = g.start.y; else p.x = g.start.x;
    }
    g.preview = g.kind === 'rectangle' ? M.rectangle(g.start, p) : [M.wall(g.start, p)];
  }
  render(); if (g.kind === 'move' || g.kind === 'endpoint') properties();
});
svg.addEventListener('pointerup', e => {
  if (!gesture) return;
  const g = gesture; gesture = null; reference = null;
  if (g.preview?.length && g.preview.every(w => M.length(w) >= .1)) {
    plan.walls.push(...g.preview); selected = g.preview[0].id;
  }
  if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  if (g.before) commit(g.before);
  if (g.preview?.length) setTool('select');
  render(); properties();
});
svg.addEventListener('pointerleave', () => { if (!gesture) { reference = null; render(); } });
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
  target.push(snapshot()); plan = JSON.parse(source.pop()); selected = null;
  $('plan-name').value = plan.name; save(); render(); properties();
}
function removeSelected() {
  if (!selected) return;
  const before = snapshot(); plan.walls = plan.walls.filter(w => w.id !== selected); selected = null; commit(before);
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
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
$('plan-name').onchange = () => { const before = snapshot(); plan.name = $('plan-name').value.trim() || 'Untitled plan'; $('plan-name').value = plan.name; commit(before); };
$('example').onclick = () => {
  const before = snapshot();
  plan.walls.push(...M.rectangle({ x: 0, y: 0 }, { x: 8, y: 6 }), M.wall({ x: 5, y: 0 }, { x: 5, y: 3.5 }), M.wall({ x: 5, y: 3.5 }, { x: 8, y: 3.5 }));
  plan.name = 'My first space'; $('plan-name').value = plan.name; commit(before); fit();
};
$('clear').onclick = () => {
  if (!confirm('Start a new plan? Export a backup first if you want to keep the current plan.')) return;
  cancelGesture(); const before = snapshot(); plan = { name: 'Untitled plan', walls: [] }; selected = null; blockedStorage = false;
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
  if (e.key === 'Escape') { cancelGesture(); selected = null; setTool('select'); properties(); }
  if ((e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase())) { e.preventDefault(); undo(e.key.toLowerCase() === 'y' || e.shiftKey); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  const next = { v: 'select', r: 'rectangle', w: 'wall', h: 'pan' }[e.key.toLowerCase()]; if (next) setTool(next);
});
try { const raw = localStorage.getItem(storageKey); if (raw) plan = M.decode(raw); }
catch { blockedStorage = true; $('save-state').textContent = 'Not saved — storage unavailable'; notify('Stored data could not be loaded. It has not been overwritten. Export your work before starting a new plan.'); }
$('plan-name').value = plan.name;
new ResizeObserver(() => render()).observe($('drawing'));
properties(); render(); if (plan.walls.length) fit();

