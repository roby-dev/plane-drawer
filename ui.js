'use strict';
// Toolbar, symbol palette, inspector forms, file import/export, keyboard shortcuts and startup.
const TOOL_HINTS = {
  select: 'Drag a room to move it, its corners to resize. Ctrl+drag copies. Alt+click picks a single wall. Hold Ctrl over a corner and slide along a wall to measure. A selected symbol has handles to rotate and resize it; hold left Ctrl + left Alt to line it up.',
  area: 'Drag a box to select every wall and symbol fully inside it, then drag any of them to move them all. Ctrl+A selects everything.',
  calibrate: 'Set scale: click two points on the image whose real distance you know, such as both ends of a wall. Esc cancels.',
  rectangle: 'Drag to draw a room. Orange marks snap to existing walls.',
  wall: 'Drag to draw. Orange marks snap to walls; Shift aligns free lines.',
  pan: 'Drag to pan. Hold the middle mouse button from any tool.',
  symbol: 'Click to place. Doors and windows snap onto walls (click on the side they should open). Hold left Ctrl + left Alt to line up with other symbols and corners (purple lines). Q rotates, Esc finishes.'
};
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const TOOL_KEYS ={ a: 'area', v: 'select', r: 'rectangle', w: 'wall', h: 'pan' };
const palette = [];

function setLibraryOpen(open) {
  $('tools-panel').classList.toggle('is-library-open', open);
  $('toggle-symbols').setAttribute('aria-expanded', open);
}

function setTool(next) {
  cancelGesture(); state.tool = next; state.ghost = null; state.guides = []; state.calibration = null;
  setLibraryOpen(false);
  $('toggle-symbols').classList.toggle('is-active', next === 'symbol');
  palette.forEach(b => { const active = next === 'symbol' && b.dataset.symbol === state.symbolType; b.classList.toggle('is-active', active); b.setAttribute('aria-pressed', active); });
  document.querySelectorAll('[data-tool]').forEach(b => { b.classList.toggle('is-active', b.dataset.tool === next); b.setAttribute('aria-pressed', b.dataset.tool === next); });
  $('hint').textContent = TOOL_HINTS[next];
  render();
}

// Toolbar and symbol palette
$('toggle-symbols').onclick = () => setLibraryOpen(!$('tools-panel').classList.contains('is-library-open'));
setLibraryOpen(false);
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
const symbolGroups = [
  { label: 'Doors & windows', types: ['door', 'window', 'garage-door', 'sliding-door'] },
  { label: 'Kitchen & bathroom', types: ['toilet', 'sink', 'shower', 'kitchen-sink'] },
  { label: 'Utilities', types: ['laundry-sink', 'washer', 'water-cold', 'water-hot', 'drain'] },
  { label: 'Stairs & details', types: ['stairs-up', 'stairs-down', 'car', 'text'] }
];
const symbolContainers = new Map();
// New catalog items remain reachable even if their visual category is not assigned yet.
const otherTypes = Object.keys(M.SYMBOLS).filter(type => !symbolGroups.some(group => group.types.includes(type)));
if (otherTypes.length) symbolGroups.push({ label: 'More symbols', types: otherTypes });
symbolGroups.forEach((group, index) => {
  const details = document.createElement('details'), summary = document.createElement('summary'), list = document.createElement('div');
  details.className = 'symbol-group'; details.open = index === 0;
  summary.className = 'title-4'; summary.textContent = group.label;
  list.className = 'chip-grid'; list.setAttribute('role', 'group'); list.setAttribute('aria-label', group.label);
  details.append(summary); details.append(list); $('symbol-list').append(details);
  group.types.forEach(type => symbolContainers.set(type, list));
});
Object.entries(M.SYMBOLS).forEach(([type, def]) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'btn catalog-item button-xsm'; button.dataset.symbol = type; button.textContent = def.label; button.title = def.label; button.setAttribute('aria-pressed', 'false');
  button.onclick = () => { state.symbolType = type; setTool('symbol'); svg.focus({ preventScroll: true }); };
  palette.push(button); symbolContainers.get(type).append(button);
});
$('start').onclick = () => setTool('rectangle');
$('undo').onclick = () => undo(); $('redo').onclick = () => undo(true);
$('zoom-in').onclick = () => zoom(1.2); $('zoom-out').onclick = () => zoom(1 / 1.2); $('fit').onclick = fit;
$('dimensions').onchange = render;

// Inspector
$('close-inspector').onclick = () => { cancelGesture(); select(); renderInspector(); render(); svg.focus({ preventScroll: true }); };
$('symbol-rotate').onclick = rotateSelected; $('symbol-delete').onclick = removeSelected; $('delete').onclick = removeSelected;
$('properties').onsubmit = e => {
  e.preventDefault();
  const wall = state.plan.walls.find(w => w.id === state.selectedWallId); if (!wall) return;
  const before = snapshot();
  try { replaceWalls([{ ...M.resize(wall, +$('length').value, +$('angle').value), thickness: +$('thickness').value }]); commit(before); }
  catch { notify('Enter a wall length between 0.10 and 1000 meters.'); }
};
$('room-properties').onsubmit = e => {
  e.preventDefault();
  const group = selectedWalls(); if (group.length !== 4) return;
  const width = +$('room-width').value, height = +$('room-height').value, thickness = +$('room-thickness').value;
  const valid = n => Number.isFinite(n) && n >= .1 && n <= 1000;
  if (!valid(width) || !valid(height) || !(thickness >= .05 && thickness <= 1)) { notify('Enter a width and height between 0.10 and 1000 meters, and a thickness between 0.05 and 1.'); return; }
  const before = snapshot(), b = M.roomBounds(group), name = $('room-name').value.trim().slice(0, M.ROOM_NAME_MAX);
  replaceWalls(M.resizeRoom(group, { left: b.left, top: b.top, right: b.left + width, bottom: b.top + height }).map(n => ({ ...n, thickness })));
  if (name) state.plan.rooms[group[0].room] = name; else delete state.plan.rooms[group[0].room];
  commit(before);
};
function applySymbolForm() {
  const sym = selectedSymbol(); if (!sym) return;
  const before = snapshot();
  if (M.SYMBOLS[sym.type].text) {
    try { replaceSymbol(M.editText(sym, $('symbol-text').value, +$('symbol-font').value)); commit(before); }
    catch { notify('Enter between 1 and ' + M.TEXT_MAX + ' characters, and a size between 0.10 and 2 meters.'); }
    return;
  }
  try { replaceSymbol(M.resizeSymbol(sym, +$('symbol-width').value, +$('symbol-depth').value)); commit(before); }
  catch { notify('Enter a width and depth between 0.10 and 20 meters.'); }
}
$('symbol-properties').onsubmit = e => { e.preventDefault(); applySymbolForm(); };
// Leaving the text field applies it, so typing then clicking the canvas keeps the words.
$('symbol-text').onchange = applySymbolForm;

// Plan and files
$('plan-name').onchange = () => { const before = snapshot(); state.plan.name = $('plan-name').value.trim() || 'Untitled plan'; $('plan-name').value = state.plan.name; commit(before); };
$('example').onclick = () => {
  const before = snapshot(), plan = state.plan;
  plan.walls.push(...M.rectangle({ x: 0, y: 0 }, { x: 8, y: 6 }), M.wall({ x: 5, y: 0 }, { x: 5, y: 3.5 }), M.wall({ x: 5, y: 3.5 }, { x: 8, y: 3.5 }));
  plan.symbols.push(M.symbol('door', 2, 6, 180), M.symbol('window', 6.5, 0, 0)); plan.name = 'My first space'; $('plan-name').value = plan.name; commit(before); fit();
};
$('clear').onclick = () => {
  if (!confirm('Start a new plan? Export a backup first if you want to keep the current plan.')) return;
  replacePlan(newPlan()); setTool('select'); renderInspector(); fit();
};
function download(text, type, extension) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = (state.plan.name.replace(/[^a-z0-9 -]/gi, '').trim() || 'floor-plan') + extension;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export').onclick = () => download(M.encode(state.plan), 'application/json', '.json');
$('export-svg').onclick = () => {
  const markup = planSvg();
  if (markup) download(markup, 'image/svg+xml', '.svg'); else notify('There is nothing to export yet. Draw a wall or place a symbol first.');
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async () => {
  const file = $('import-file').files[0]; if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('File too large');
    const imported = M.decode(await file.text());
    if (!confirm('Replace this plan with the imported plan? Export a backup first if needed.')) return;
    replacePlan(imported); renderInspector(); fit();
  } catch { notify('This file is not a supported PlaneDrawer plan. Your current plan was not changed.'); }
  finally { $('import-file').value = ''; }
};

// Share link: the whole plan, compressed, travels in the URL fragment (after #), which browsers never send to a server.
const SHARE_PREFIX = '#plan=';
async function transformBytes(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes).catch(() => {}); writer.close().catch(() => {});
  const chunks = [], reader = stream.readable.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const fromBase64Url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function shareLink() {
  const packed = await transformBytes(new TextEncoder().encode(M.encode(state.plan)), new CompressionStream('deflate-raw'));
  return location.href.split('#')[0] + SHARE_PREFIX + toBase64Url(packed);
}
$('share').onclick = async () => {
  $('file-menu').open = false;
  let link;
  try { link = await shareLink(); } catch { notify('This browser cannot create share links. Use Export plan instead.'); return; }
  const note = link.length > 4000 ? ' It is long, so some chat apps may cut it; send the exported plan file if it does not open.' : '';
  try { await navigator.clipboard.writeText(link); notify('Link copied. Whoever opens it gets their own copy of this plan; the reference image is not included.' + note); }
  catch { prompt('Copy this link to share a copy of the plan:', link); }
};
// Opening a share link offers to replace this browser's plan with the shared copy (Ctrl+Z restores it), then clears the link.
async function openSharedPlan() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  try {
    const json = new TextDecoder().decode(await transformBytes(fromBase64Url(location.hash.slice(SHARE_PREFIX.length)), new DecompressionStream('deflate-raw')));
    const shared = M.decode(json), current = state.plan;
    const hasWork = current.walls.length || current.symbols.length;
    if (!hasWork || confirm('Open the shared plan "' + shared.name + '"? It replaces the plan in this browser. Export a backup first if you want to keep it.')) {
      replacePlan(shared); renderInspector(); fit(); notify('Opened the shared plan. Press Ctrl+Z to go back to your previous plan.');
    }
  } catch { notify('This share link is damaged or incomplete. Your plan was not changed.'); }
  finally { history.replaceState(null, '', location.href.split('#')[0]); }
}

// Reference image to trace over
const readDataUrl = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
const imageAspect = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img.naturalHeight / img.naturalWidth); img.onerror = reject; img.src = src; });
function renderBackdropControls() {
  $('backdrop-controls').hidden = !state.backdrop;
  $('backdrop-add-label').textContent = state.backdrop ? 'Replace image' : 'Add image to trace';
  if (state.backdrop) $('backdrop-opacity').value = state.backdrop.opacity;
}
$('backdrop-add').onclick = () => $('backdrop-file').click();
$('backdrop-file').onchange = async () => {
  const file = $('backdrop-file').files[0]; if (!file) return;
  try {
    if (file.size > 4_000_000) { notify('Choose an image under 4 MB, so this browser can keep it.'); return; }
    const src = await readDataUrl(file), aspect = await imageAspect(src);
    // Start at 80% of the visible width; Set scale then makes it match real meters.
    const camera = state.camera, viewWidth = svg.clientWidth / camera.scale, viewHeight = svg.clientHeight / camera.scale;
    const width = viewWidth * .8, backdrop = validBackdrop({ src, x: camera.x + viewWidth * .1, y: camera.y + Math.max(0, (viewHeight - width * aspect) / 2), width, aspect, opacity: .5 });
    if (!backdrop) throw new Error('Unsupported image');
    state.backdrop = backdrop; const stored = saveBackdrop(); renderBackdropControls(); render();
    $('file-menu').open = false;
    if (stored) notify('Image added. Use Files → Set scale and click two points whose real distance you know.');
  } catch { notify('This image could not be opened. Use a PNG, JPEG or WebP file.'); }
  finally { $('backdrop-file').value = ''; }
};
$('backdrop-scale').onclick = () => { $('file-menu').open = false; setTool('calibrate'); svg.focus({ preventScroll: true }); };
$('backdrop-opacity').oninput = () => { if (!state.backdrop) return; state.backdrop.opacity = +$('backdrop-opacity').value; saveBackdrop(); render(); };
$('backdrop-remove').onclick = () => { state.backdrop = null; saveBackdrop(); renderBackdropControls(); if (state.tool === 'calibrate') setTool('select'); render(); };

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') { cancelGesture(); select(); setTool('select'); renderInspector(); }
  if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(key)) { e.preventDefault(); undo(key === 'y' || e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'c') { copySelection(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'v') { e.preventDefault(); cancelGesture(); paste(); return; }
  if ((e.ctrlKey || e.metaKey) && key === 'a') { e.preventDefault(); cancelGesture(); selectAll(); renderInspector(); render(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const arrow = ARROWS[e.key];
  if (arrow && !state.gesture) {
    const step = e.shiftKey ? .01 : .1;
    if (nudge(arrow[0] * step, arrow[1] * step)) e.preventDefault();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  if (key === 'q') rotateSelected();
  if (TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
});

// Startup
loadStoredPlan(); loadBackdrop(); renderBackdropControls();
$('plan-name').value = state.plan.name;
new ResizeObserver(() => render()).observe($('drawing'));
renderInspector(); render(); if (state.plan.walls.length) fit();
openSharedPlan();
