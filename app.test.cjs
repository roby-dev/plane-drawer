const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('./model.js');

function loadApp() {
  class Element {
    constructor() { this.attrs = {}; this.dataset = {}; this.style = {}; this.listeners = {}; this.children = []; this.checked = true; this.clientWidth = 800; this.clientHeight = 600; this.classList = { toggle() {} }; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    append(node) { this.children.push(node); }
    replaceChildren() { this.children = []; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    focus() {}
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
    getBoundingClientRect() { return { left: 0, top: 0 }; }
    fire(type, values = {}) {
      const event = { button: 0, pointerId: 1, clientX: 110, clientY: 110, target: this, preventDefault() { this.defaultPrevented = true; }, ...values };
      this.listeners[type]?.(event); return event;
    }
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const tools = ['select', 'rectangle', 'wall', 'pan'].map(tool => { const el = new Element(); el.dataset.tool = tool; return el; });
  const storage = new Map(), docListeners = {};
  const context = { PlanModel: model, structuredClone, setTimeout, clearTimeout, ResizeObserver: class { observe() {} }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, document: { getElementById: get, querySelectorAll: () => tools, createElementNS: () => new Element(), createElement: () => new Element(), addEventListener(type, cb) { (docListeners[type] ||= []).push(cb); } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), context);
  return { get, storage, key: (type, values) => (docListeners[type] || []).forEach(cb => cb({ target: { tagName: 'BODY' }, preventDefault() {}, ...values })), tool: name => tools.find(el => el.dataset.tool === name).onclick(), active: name => tools.find(el => el.dataset.tool === name).attrs['aria-pressed'] };
}

test('middle-button drag pans temporarily without drawing or changing the active tool', () => {
  for (const name of ['select', 'rectangle', 'wall', 'pan']) {
    const app = loadApp(); app.tool(name);
    const canvas = app.get('canvas');
    const down = canvas.fire('pointerdown', { button: 1 });
    assert.equal(down.defaultPrevented, true);
    assert.equal(canvas.style.cursor, 'grabbing');
    canvas.fire('pointermove', { clientX: 165, clientY: 220 });
    assert.deepEqual(canvas.attrs.viewBox.split(' ').slice(0, 2).map(Number), [-3, -4]);
    canvas.fire('pointerup', { button: 1 });
    assert.equal(app.active(name), 'true');
    assert.equal(canvas.style.cursor, name === 'select' ? 'default' : name === 'pan' ? 'grab' : 'crosshair');
    assert.equal(app.storage.size, 0);
    assert.equal(app.get('wall-count').textContent, '0 walls');
  }
});

test('left-button rectangle creation still creates and saves four walls', () => {
  const app = loadApp(); app.tool('rectangle'); const canvas = app.get('canvas');
  canvas.fire('pointerdown'); canvas.fire('pointermove', { clientX: 330, clientY: 275 }); canvas.fire('pointerup');
  const saved = JSON.parse(app.storage.get('planedrawer.plan.v1'));
  assert.deepEqual(saved.walls.map(model.length), [4, 3, 4, 3]);
  assert.equal(app.get('wall-count').textContent, '4 walls');
});

test('a new wall snaps its start and end to existing walls, with a visible reference', () => {
  const app = loadApp(); const canvas = app.get('canvas');
  app.tool('rectangle');
  canvas.fire('pointerdown'); canvas.fire('pointermove', { clientX: 330, clientY: 275 }); canvas.fire('pointerup');
  app.tool('wall');
  canvas.fire('pointermove', { clientX: 224, clientY: 117 });
  assert.ok(app.get('preview').children.some(el => el.attrs['data-reference']));
  canvas.fire('pointerdown', { clientX: 224, clientY: 117 });
  canvas.fire('pointermove', { clientX: 224, clientY: 268 });
  canvas.fire('pointerup');
  const saved = JSON.parse(app.storage.get('planedrawer.plan.v1'));
  assert.equal(saved.walls.length, 5);
  assert.equal(saved.walls[4].a.y, 0);
  assert.equal(saved.walls[4].b.y, 3);
  assert.ok(Math.abs(saved.walls[4].a.x - (224 / 55 - 2)) < 1e-8);
});

test('rectangle corners use wall references and canceling a middle drag restores the cursor', () => {
  const app = loadApp(); const canvas = app.get('canvas'); app.tool('rectangle');
  canvas.fire('pointerdown'); canvas.fire('pointermove', { clientX: 330, clientY: 275 }); canvas.fire('pointerup');
  app.tool('rectangle');
  canvas.fire('pointerdown', { clientX: 115, clientY: 116 });
  canvas.fire('pointermove', { clientX: 440, clientY: 330 }); canvas.fire('pointerup');
  const saved = JSON.parse(app.storage.get('planedrawer.plan.v1'));
  assert.equal(saved.walls.length, 8);
  assert.deepEqual(saved.walls[4].a, { x: 0, y: 0 });
  const before = app.storage.get('planedrawer.plan.v1');
  app.tool('rectangle'); canvas.fire('pointerdown', { button: 1 }); canvas.fire('pointercancel');
  assert.equal(canvas.style.cursor, 'crosshair');
  assert.equal(app.storage.get('planedrawer.plan.v1'), before);
  assert.equal(canvas.fire('auxclick', { button: 1 }).defaultPrevented, true);
});

test('left-button movement and right-button rejection preserve existing drawing behavior', () => {
  const app = loadApp(); const canvas = app.get('canvas'); app.tool('rectangle');
  canvas.fire('pointerdown'); canvas.fire('pointermove', { clientX: 330, clientY: 275 }); canvas.fire('pointerup');
  const original = JSON.parse(app.storage.get('planedrawer.plan.v1'));
  const target = { dataset: { wall: original.walls[0].id } };
  canvas.fire('pointerdown', { target, altKey: true });
  canvas.fire('pointermove', { clientX: 165, clientY: 165 }); canvas.fire('pointerup');
  const moved = JSON.parse(app.storage.get('planedrawer.plan.v1'));
  assert.deepEqual(moved.walls[0].a, { x: 1, y: 1 });
  assert.equal(model.length(moved.walls[0]), 4);
  assert.deepEqual(moved.walls.slice(1), original.walls.slice(1));
  const view = canvas.attrs.viewBox, saved = app.storage.get('planedrawer.plan.v1');
  canvas.fire('pointerdown', { button: 2 }); canvas.fire('pointermove', { clientX: 200 }); canvas.fire('pointerup', { button: 2 });
  assert.equal(canvas.attrs.viewBox, view);
  assert.equal(app.storage.get('planedrawer.plan.v1'), saved);
});

test('Shift keeps a wall straight even when the cursor is near another wall, and reacts without moving the mouse', () => {
  const app = loadApp(); const canvas = app.get('canvas');
  app.tool('rectangle'); canvas.fire('pointerdown'); canvas.fire('pointermove', { clientX: 330, clientY: 275 }); canvas.fire('pointerup');
  app.tool('wall');
  canvas.fire('pointerdown', { clientX: 110, clientY: 192.5 });
  canvas.fire('pointermove', { clientX: 330, clientY: 200, shiftKey: true });
  canvas.fire('pointerup');
  const saved = JSON.parse(app.storage.get('planedrawer.plan.v1'));
  assert.deepEqual([saved.walls[4].a, saved.walls[4].b], [{ x: 0, y: 1.5 }, { x: 4, y: 1.5 }]);
});

test('pressing Shift mid-drag straightens the preview without a mouse move', () => {
  const app = loadApp(); const canvas = app.get('canvas'); app.tool('wall');
  canvas.fire('pointerdown', { clientX: 110, clientY: 110 });
  canvas.fire('pointermove', { clientX: 330, clientY: 130 });
  app.key('keydown', { key: 'Shift', shiftKey: true });
  canvas.fire('pointerup', { clientX: 330, clientY: 130, shiftKey: true });
  const saved = JSON.parse(app.storage.get('planedrawer.plan.v1'));
  assert.equal(saved.walls[0].b.y, 0);
});

function drawRoom(app) {
  const canvas = app.get('canvas'); app.tool('rectangle');
  canvas.fire('pointerdown'); canvas.fire('pointermove', { clientX: 330, clientY: 275 }); canvas.fire('pointerup');
  return JSON.parse(app.storage.get('planedrawer.plan.v1'));
}
const stored = app => JSON.parse(app.storage.get('planedrawer.plan.v1'));

test('dragging a wall of a rectangle moves the whole room', () => {
  const app = loadApp(), canvas = app.get('canvas'), room = drawRoom(app);
  canvas.fire('pointerdown', { target: { dataset: { wall: room.walls[0].id } } });
  canvas.fire('pointermove', { clientX: 165, clientY: 165 }); canvas.fire('pointerup');
  assert.deepEqual(stored(app).walls.map(w => w.a), [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }, { x: 1, y: 4 }]);
});

test('dragging a corner handle resizes the whole rectangle', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  const corner = app.get('handles').children.find(c => String(c.dataset.corner) === '2');
  canvas.fire('pointerdown', { clientX: 330, clientY: 275, target: corner });
  canvas.fire('pointermove', { clientX: 440, clientY: 330 }); canvas.fire('pointerup');
  const walls = stored(app).walls;
  assert.deepEqual(walls.map(model.length), [6, 4, 6, 4]);
  assert.deepEqual(walls[0].a, { x: 0, y: 0 });
});

test('room width and height can be typed in', () => {
  const app = loadApp(); drawRoom(app);
  app.get('room-width').value = '5'; app.get('room-height').value = '2.5'; app.get('room-thickness').value = '0.2';
  app.get('room-properties').onsubmit({ preventDefault() {} });
  const walls = stored(app).walls;
  assert.deepEqual(walls.map(model.length), [5, 2.5, 5, 2.5]);
  assert.ok(walls.every(w => w.thickness === 0.2));
});

test('holding Ctrl on a corner and sliding along a wall measures from that corner in meters', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app); app.tool('select');
  const labels = () => app.get('preview').children.filter(c => c.textContent).map(c => c.textContent);
  canvas.fire('pointermove', { clientX: 110, clientY: 110, ctrlKey: true });
  canvas.fire('pointermove', { clientX: 220, clientY: 110, ctrlKey: true });
  assert.ok(labels().includes('2.00 m'), labels().join());
  canvas.fire('pointermove', { clientX: 220, clientY: 110, ctrlKey: false });
  assert.ok(!labels().includes('2.00 m'));
});

function pick(app, type) { app.get('symbol-list').children.find(b => b.dataset.symbol === type).onclick(); }

test('a door snaps onto the wall it is placed near; a toilet goes where you click', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  pick(app, 'door');
  canvas.fire('pointermove', { clientX: 220, clientY: 125 }); canvas.fire('pointerdown', { clientX: 220, clientY: 125 }); canvas.fire('pointerup');
  pick(app, 'toilet');
  canvas.fire('pointermove', { clientX: 220, clientY: 200 }); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  const { symbols } = stored(app);
  assert.deepEqual(symbols.map(({ type, x, y, rotation }) => ({ type, x, y, rotation })),
    [{ type: 'door', x: 2, y: 0, rotation: 0 }, { type: 'toilet', x: 2, y: 1.6, rotation: 0 }]);
  assert.equal(stored(app).walls.length, 4);
});

test('a placed symbol can be rotated with Q, moved by dragging, and deleted', () => {
  const app = loadApp(), canvas = app.get('canvas');
  pick(app, 'toilet');
  canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  app.key('keydown', { key: 'q' });
  assert.equal(stored(app).symbols[0].rotation, 90);
  app.tool('select');
  const id = stored(app).symbols[0].id;
  canvas.fire('pointerdown', { clientX: 220, clientY: 200, target: { dataset: { symbol: id } } });
  canvas.fire('pointermove', { clientX: 275, clientY: 200 }); canvas.fire('pointerup');
  assert.equal(stored(app).symbols[0].x, 3);
  app.key('keydown', { key: 'Delete' });
  assert.equal(stored(app).symbols.length, 0);
  app.key('keydown', { key: 'z', ctrlKey: true });
  assert.equal(stored(app).symbols.length, 1);
});

test('a second door lines up with the first one and shows a guide', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app); pick(app, 'door');
  canvas.fire('pointermove', { clientX: 220, clientY: 125 }); canvas.fire('pointerdown', { clientX: 220, clientY: 125 }); canvas.fire('pointerup');
  canvas.fire('pointermove', { clientX: 225, clientY: 268 });
  assert.ok(app.get('preview').children.some(c => c.attrs['data-guide'] === 'x'));
  canvas.fire('pointerdown', { clientX: 225, clientY: 268 }); canvas.fire('pointerup');
  const [first, second] = stored(app).symbols;
  assert.deepEqual([second.x, second.y, second.rotation], [first.x, 3, 180]);
  assert.ok(!stored(app).symbols.some(s => 'guides' in s));
  canvas.fire('pointermove', { clientX: 400, clientY: 400 });
  assert.ok(!app.get('preview').children.some(c => c.attrs['data-guide']));
});

test('fixtures align with other symbols and corners while dragging', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app); pick(app, 'toilet');
  canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  pick(app, 'sink');
  canvas.fire('pointerdown', { clientX: 226, clientY: 240 }); canvas.fire('pointerup');
  assert.equal(stored(app).symbols[1].x, 2);
  app.tool('select');
  const id = stored(app).symbols[1].id;
  canvas.fire('pointerdown', { clientX: 226, clientY: 240, target: { dataset: { symbol: id } } });
  canvas.fire('pointermove', { clientX: 108, clientY: 240 }); canvas.fire('pointerup');
  assert.equal(stored(app).symbols[1].x, 0);
});

test('Ctrl+drag on a symbol leaves the original and drags a copy; undo removes the copy', () => {
  const app = loadApp(), canvas = app.get('canvas'); pick(app, 'toilet');
  canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup'); app.tool('select');
  const id = stored(app).symbols[0].id;
  canvas.fire('pointerdown', { clientX: 220, clientY: 200, ctrlKey: true, target: { dataset: { symbol: id } } });
  canvas.fire('pointermove', { clientX: 330, clientY: 200, ctrlKey: true }); canvas.fire('pointerup', { ctrlKey: true });
  const { symbols } = stored(app);
  assert.deepEqual(symbols.map(s => [s.type, s.x]), [['toilet', 2], ['toilet', 4]]);
  assert.notEqual(symbols[0].id, symbols[1].id);
  app.key('keydown', { key: 'z', ctrlKey: true });
  assert.equal(stored(app).symbols.length, 1);
});

test('Ctrl+drag on a rectangle copies the whole room as a new, independent room', () => {
  const app = loadApp(), canvas = app.get('canvas'), room = drawRoom(app);
  canvas.fire('pointerdown', { ctrlKey: true, target: { dataset: { wall: room.walls[0].id } } });
  canvas.fire('pointermove', { clientX: 440, clientY: 110, ctrlKey: true }); canvas.fire('pointerup', { ctrlKey: true });
  const { walls } = stored(app);
  assert.equal(walls.length, 8);
  assert.deepEqual(walls.slice(0, 4), room.walls);
  assert.deepEqual(walls.slice(4).map(w => w.a.x), [6, 10, 10, 6]);
  assert.equal(new Set(walls.map(w => w.room)).size, 2);
  assert.equal(new Set(walls.map(w => w.id)).size, 8);
});

test('Ctrl+click without dragging does not leave a duplicate behind', () => {
  const app = loadApp(), canvas = app.get('canvas'), room = drawRoom(app);
  canvas.fire('pointerdown', { ctrlKey: true, target: { dataset: { wall: room.walls[0].id } } });
  canvas.fire('pointerup', { ctrlKey: true });
  assert.equal(stored(app).walls.length, 4);
});

function roomAndLooseWall(app) {
  const canvas = app.get('canvas'); drawRoom(app); app.tool('wall');
  canvas.fire('pointerdown', { clientX: 110, clientY: 192.5 });
  canvas.fire('pointermove', { clientX: 220, clientY: 192.5 }); canvas.fire('pointerup');
  return canvas;
}
const handle = (app, end) => app.get('handles').children.find(c => c.dataset.end === end);

test('dragging a wall endpoint snaps to other walls and shows the reference marker', () => {
  const app = loadApp(), canvas = roomAndLooseWall(app);
  canvas.fire('pointerdown', { clientX: 220, clientY: 192.5, target: handle(app, 'b') });
  canvas.fire('pointermove', { clientX: 328, clientY: 196 });
  assert.ok(app.get('preview').children.some(c => c.attrs['data-reference']));
  canvas.fire('pointerup');
  assert.equal(stored(app).walls[4].b.x, 4);
  assert.deepEqual(stored(app).walls[4].a, { x: 0, y: 1.5 });
});

test('Shift while dragging an endpoint keeps the wall straight and marks where it crosses another wall', () => {
  const app = loadApp(), canvas = roomAndLooseWall(app);
  canvas.fire('pointerdown', { clientX: 220, clientY: 192.5, target: handle(app, 'b') });
  canvas.fire('pointermove', { clientX: 328, clientY: 200, shiftKey: true });
  assert.ok(app.get('preview').children.some(c => c.attrs['data-reference']));
  canvas.fire('pointerup');
  assert.deepEqual(stored(app).walls[4].b, { x: 4, y: 1.5 });
});

test('moving a wall snaps its end onto another wall', () => {
  const app = loadApp(), canvas = roomAndLooseWall(app), id = stored(app).walls[4].id;
  canvas.fire('pointerdown', { clientX: 165, clientY: 192.5, target: { dataset: { wall: id } } });
  canvas.fire('pointermove', { clientX: 268, clientY: 192.5 });
  assert.ok(app.get('preview').children.some(c => c.attrs['data-reference']));
  canvas.fire('pointerup');
  const wall = stored(app).walls[4];
  assert.deepEqual([wall.a.x, wall.b.x], [2, 4]);
});

test('dragging a room corner snaps to other walls', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  app.tool('wall'); canvas.fire('pointerdown', { clientX: 440, clientY: 110 }); canvas.fire('pointermove', { clientX: 440, clientY: 330 }); canvas.fire('pointerup');
  app.tool('select');
  canvas.fire('pointerdown', { clientX: 330, clientY: 275, target: { dataset: { wall: stored(app).walls[0].id } } }); canvas.fire('pointerup');
  const c2 = app.get('handles').children.find(c => String(c.dataset.corner) === '2');
  canvas.fire('pointerdown', { clientX: 330, clientY: 275, target: c2 });
  canvas.fire('pointermove', { clientX: 434, clientY: 290 }); canvas.fire('pointerup');
  assert.equal(stored(app).walls[0].b.x, 6);
});
