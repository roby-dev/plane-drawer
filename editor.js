'use strict';
// Editor state, selection, undo history, plan commands and browser persistence.
// The app is split into classic scripts (not ES modules) so index.html still opens with a double-click, without a server.
// They share top-level declarations and load in order: model, shapes, editor, render, gestures, ui.
const M = PlanModel;
const $ = id => document.getElementById(id);
const STORAGE_KEY = 'planedrawer.plan.v1';
const HISTORY_LIMIT = 100;
const BASE_SCALE = 55; // screen pixels per meter at 100% zoom
const newPlan = () => ({ name: 'Untitled plan', walls: [], symbols: [], rooms: {} });
const homeCamera = () => ({ x: -2, y: -2, scale: BASE_SCALE });

// The single source of mutable editor state.
const state = {
  plan: newPlan(),
  tool: 'select',
  symbolType: 'door',
  // Selection: a wall (with its whole room unless `single`) or a symbol.
  selectedWallId: null,
  selectedSymbolId: null,
  single: false,
  // Area selection: several walls and symbols picked together (null when not in use).
  group: null,
  // Ctrl+C copy kept inside the editor, and how many times it has been pasted.
  clipboard: null,
  pastes: 0,
  // Pointer interaction and the overlays it shows.
  gesture: null,
  lastPointer: null,
  ghost: null,
  guides: [],
  reference: null,
  measure: null,
  camera: homeCamera(),
  blockedStorage: false
};
const undoStack = [], redoStack = [];
let messageTimer;

// Screen pixels to meters at the current zoom.
const px = n => n / state.camera.scale;
const snapshot = () => JSON.stringify(state.plan);
const isDrawingTool = tool => tool === 'wall' || tool === 'rectangle';

function select(wallId = null, symbolId = null, single = false) {
  state.selectedWallId = wallId; state.selectedSymbolId = symbolId; state.single = single; state.group = null;
}
// Selects several walls and symbols at once; an empty pick clears the selection.
function selectGroup(wallIds, symbolIds) {
  select();
  if (wallIds.length || symbolIds.length) state.group = { walls: wallIds, symbols: symbolIds };
}
const selectAll = () => selectGroup(state.plan.walls.map(w => w.id), state.plan.symbols.map(s => s.id));
const groupWalls = () => state.group ? state.plan.walls.filter(w => state.group.walls.includes(w.id)) : [];
const groupSymbols = () => state.group ? state.plan.symbols.filter(s => state.group.symbols.includes(s.id)) : [];
// Fresh copies of the current selection (area group, room or wall, or symbol), keeping room names.
function selectionCopies() {
  const walls = state.group ? groupWalls() : selectedWalls();
  const symbols = state.group ? groupSymbols() : [selectedSymbol()].filter(Boolean);
  return copyItems(walls, symbols, state.plan.rooms, 0);
}
function copyItems(walls, symbols, names, shift) {
  const copies = M.duplicateWalls(walls).map(w => shift ? M.move(w, { x: shift, y: shift }) : w), rooms = {};
  copies.forEach((c, i) => { const name = names[walls[i].room]; if (c.room && name) rooms[c.room] = name; });
  return { walls: copies, symbols: symbols.map(s => ({ ...M.copySymbol(s), x: M.round(s.x + shift), y: M.round(s.y + shift) })), rooms };
}
// Adds copies to the plan and selects them as one group.
function placeCopies({ walls, symbols, rooms }) {
  state.plan.walls.push(...walls); state.plan.symbols.push(...symbols); Object.assign(state.plan.rooms, rooms);
  selectGroup(walls.map(w => w.id), symbols.map(s => s.id));
}
// Ctrl+C keeps a copy of the selection in the editor; each Ctrl+V pastes it 50 cm further down and right.
function copySelection() {
  const copied = selectionCopies(), count = copied.walls.length + copied.symbols.length;
  if (!count) return;
  state.clipboard = copied; state.pastes = 0;
  notify('Copied ' + count + (count === 1 ? ' item.' : ' items.') + ' Press Ctrl+V to paste.');
}
function paste() {
  const c = state.clipboard; if (!c) return;
  const before = snapshot();
  placeCopies(copyItems(c.walls, c.symbols, c.rooms, ++state.pastes * .5)); commit(before); render();
}
const inGroup = id =>!!id && !!state.group && (state.group.walls.includes(id) || state.group.symbols.includes(id));
// The selected wall, or its whole room unless a single wall was picked with Alt.
function selectedWalls() {
  const { plan, selectedWallId, single } = state;
  const w = plan.walls.find(x => x.id === selectedWallId);
  if (!w) return [];
  if (single || !w.room) return [w];
  const room = plan.walls.filter(x => x.room === w.room);
  return room.length === 4 ? room : [w];
}
const selectedSymbol = () => state.plan.symbols.find(x => x.id === state.selectedSymbolId);
const replaceSymbol = next => { state.plan.symbols = state.plan.symbols.map(s => s.id === next.id ? next : s); };
// Swaps in edited walls by id, keeping their order in the plan.
function replaceWalls(changed) {
  const byId = new Map(changed.map(w => [w.id, w]));
  state.plan.walls = state.plan.walls.map(w => byId.get(w.id) || w);
}

function notify(text) {
  $('message').textContent = text; $('message').hidden = false;
  clearTimeout(messageTimer); messageTimer = setTimeout(() => $('message').hidden = true, 6500);
}
function save() {
  if (state.blockedStorage) { $('save-state').textContent = 'Not saved — export a backup'; return; }
  try { localStorage.setItem(STORAGE_KEY, M.encode(state.plan)); $('save-state').textContent = 'Saved on this device'; }
  catch { $('save-state').textContent = 'Not saved — export a backup'; notify('Browser storage is unavailable or full. Export your plan to keep a copy.'); }
}
function loadStoredPlan() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) state.plan = M.decode(raw); }
  catch { state.blockedStorage = true; $('save-state').textContent = 'Not saved — storage unavailable'; notify('Stored data could not be loaded. It has not been overwritten. Export your work before starting a new plan.'); }
}

// Records `before` (a snapshot) as an undo step if the plan changed, then saves and redraws.
function commit(before) {
  if (before === snapshot()) return;
  undoStack.push(before); if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0; save(); render(); renderInspector();
}
function undo(redo = false) {
  cancelGesture();
  const source = redo ? redoStack : undoStack, target = redo ? undoStack : redoStack;
  if (!source.length) return;
  target.push(snapshot()); state.plan = JSON.parse(source.pop()); select();
  $('plan-name').value = state.plan.name; save(); render(); renderInspector();
}
// Replaces the whole plan (a new or imported one) as one undoable step.
function replacePlan(next) {
  cancelGesture(); const before = snapshot();
  state.plan = next; select(); state.blockedStorage = false;
  $('plan-name').value = next.name; commit(before); save();
}
function removeSelected() {
  const before = snapshot(), { plan } = state;
  if (state.group) {
    const walls = new Set(state.group.walls), symbols = new Set(state.group.symbols);
    plan.walls = plan.walls.filter(w => !walls.has(w.id)); plan.symbols = plan.symbols.filter(s => !symbols.has(s.id));
    forgetEmptyRooms(); select(); commit(before); return;
  }
  if (state.selectedSymbolId) { plan.symbols = plan.symbols.filter(x => x.id !== state.selectedSymbolId); select(); commit(before); return; }
  if (!state.selectedWallId) return;
  const ids = new Set(selectedWalls().map(w => w.id));
  plan.walls = plan.walls.filter(w => !ids.has(w.id));
  forgetEmptyRooms(); select(); commit(before);
}
// Forget the names of rooms that no longer have walls.
function forgetEmptyRooms() {
  const { plan } = state;
  for (const room of Object.keys(plan.rooms)) if (!plan.walls.some(w => w.room === room)) delete plan.rooms[room];
}
function rotateSelected() {
  const sym = selectedSymbol(); if (!sym) return;
  const before = snapshot(); sym.rotation = (sym.rotation + 90) % 360; if (sym.rotation > 180) sym.rotation -= 360;
  commit(before);
}
