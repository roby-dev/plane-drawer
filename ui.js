'use strict';
// Toolbar, symbol palette, inspector forms, file import/export, keyboard shortcuts and startup.
const TOOL_HINTS = {
  select: 'Drag a room to move it, its corners to resize. Ctrl+drag copies. Alt+click picks a single wall. Hold Ctrl over a corner and slide along a wall to measure.',
  rectangle: 'Drag to draw a room. Orange marks snap to existing walls.',
  wall: 'Drag to draw. Orange marks snap to walls; Shift aligns free lines.',
  pan: 'Drag to pan. Hold the middle mouse button from any tool.',
  symbol: 'Click to place. Doors and windows snap onto walls (click on the side they should open). Purple lines show alignment with other symbols and corners. Q rotates, Esc finishes.'
};
const TOOL_KEYS = { v: 'select', r: 'rectangle', w: 'wall', h: 'pan' };
const palette = [];

function setTool(next) {
  cancelGesture(); state.tool = next; state.ghost = null; state.guides = [];
  palette.forEach(b => b.classList.toggle('active', next === 'symbol' && b.dataset.symbol === state.symbolType));
  document.querySelectorAll('[data-tool]').forEach(b => { b.classList.toggle('active', b.dataset.tool === next); b.setAttribute('aria-pressed', b.dataset.tool === next); });
  $('hint').textContent = TOOL_HINTS[next];
  render();
}

// Toolbar and symbol palette
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
Object.entries(M.SYMBOLS).forEach(([type, def]) => {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.symbol = type; button.textContent = def.label; button.title = def.label;
  button.onclick = () => { state.symbolType = type; setTool('symbol'); };
  palette.push(button); $('symbol-list').append(button);
});
$('start').onclick = () => setTool('rectangle');
$('undo').onclick = () => undo(); $('redo').onclick = () => undo(true);
$('zoom-in').onclick = () => zoom(1.2); $('zoom-out').onclick = () => zoom(1 / 1.2); $('fit').onclick = fit;
$('dimensions').onchange = render;

// Inspector
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
  const before = snapshot(), b = M.roomBounds(group);
  replaceWalls(M.resizeRoom(group, { left: b.left, top: b.top, right: b.left + width, bottom: b.top + height }).map(n => ({ ...n, thickness })));
  commit(before);
};

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
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([M.encode(state.plan)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = (state.plan.name.replace(/[^a-z0-9 -]/gi, '').trim() || 'floor-plan') + '.json';
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
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

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') { cancelGesture(); select(); setTool('select'); renderInspector(); }
  if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(key)) { e.preventDefault(); undo(key === 'y' || e.shiftKey); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  if (key === 'q') rotateSelected();
  if (TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
});

// Startup
loadStoredPlan();
$('plan-name').value = state.plan.name;
new ResizeObserver(() => render()).observe($('drawing'));
renderInspector(); render(); if (state.plan.walls.length) fit();
