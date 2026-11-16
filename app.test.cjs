const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('./model.js');

function loadApp(extra = {}) {
  class Element {
    constructor() {
      this.attrs = {}; this.dataset = {}; this.style = {}; this.listeners = {}; this.children = []; this.checked = true; this.clientWidth = 800; this.clientHeight = 600;
      const values = new Set();
      this.classList = { toggle(name, force = !values.has(name)) { if (force) values.add(name); else values.delete(name); return force; }, add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) };
    }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    append(node) { this.children.push(node); }
    replaceChildren() { this.children = []; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    focus() { this.focused = true; }
    click() {}
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
  const tools = ['select', 'area', 'rectangle', 'wall', 'pan'].map(tool => { const el = new Element(); el.dataset.tool = tool; return el; });
  const storage = new Map(extra.seed || []), docListeners = {}, downloads = [];
  const markup = node => '<' + node.tagName + Object.entries(node.attrs).map(([k, v]) => ' ' + k + '="' + v + '"').join('') + '>' + (node.textContent ?? node.children.map(markup).join('')) + '</' + node.tagName + '>';
  const context = { PlanModel: model, Blob: class { constructor(parts, options) { this.text = parts.join(''); this.type = options.type; } }, URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:' + downloads.length; }, revokeObjectURL() {} }, XMLSerializer: class { serializeToString(node) { return markup(node); } }, structuredClone, setTimeout, clearTimeout, ResizeObserver: class { observe() {} }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => { if (extra.storageLimit && value.length > extra.storageLimit) throw new Error("QuotaExceededError"); storage.set(key, value); }, removeItem: key => storage.delete(key) }, document: { getElementById: get, querySelectorAll: () => tools, createElementNS: (ns, tag) => Object.assign(new Element(), { tagName: tag }), createElement: tag => Object.assign(new Element(), { tagName: tag }), addEventListener(type, cb) { (docListeners[type] ||= []).push(cb); } }, ...extra.globals };
  // Run the app scripts in index.html order, sharing one global scope like the browser does (model.js is injected above).
  vm.createContext(context);
  const scripts = [...fs.readFileSync(require.resolve('./index.html'), 'utf8').matchAll(/<script defer src="([^"]+)">/g)].map(m => m[1]).filter(src => src !== 'model.js');
  for (const src of scripts) vm.runInContext(fs.readFileSync(require.resolve('./' + src), 'utf8'), context, { filename: src });
  return { get, storage, downloads, key: (type, values) => (docListeners[type] || []).forEach(cb => cb({ target: { tagName: 'BODY' }, preventDefault() {}, ...values })), tool: name => tools.find(el => el.dataset.tool === name).onclick(), active: name => tools.find(el => el.dataset.tool === name).attrs['aria-pressed'] };
}

test('properties appear for a selection and closing them preserves the drawing, storage and camera', () => {
  const app = loadApp(), canvas = app.get('canvas');
  assert.equal(app.get('inspector').hidden, true);
  app.tool('rectangle');
  canvas.fire('pointerdown'); canvas.fire('pointermove', { clientX: 330, clientY: 275 }); canvas.fire('pointerup');
  const before = app.storage.get('planedrawer.plan.v1');
  const wall = JSON.parse(before).walls[0];
  app.tool('select');
  canvas.fire('pointerdown', { target: { dataset: { wall: wall.id } } }); canvas.fire('pointerup');
  assert.equal(app.get('inspector').hidden, false);
  assert.equal(app.get('room-properties').hidden, false);
  const view = canvas.attrs.viewBox;
  app.get('close-inspector').onclick();
  assert.equal(app.get('inspector').hidden, true);
  assert.equal(app.storage.get('planedrawer.plan.v1'), before);
  assert.equal(canvas.attrs.viewBox, view);
  assert.equal(canvas.focused, true);
  canvas.fire('pointerdown', { target: { dataset: { wall: wall.id } }, altKey: true }); canvas.fire('pointerup');
  assert.equal(app.get('inspector').hidden, false);
  assert.equal(app.get('properties').hidden, false);
  assert.equal(app.get('room-properties').hidden, true);
  app.key('keydown', { key: 'Escape' });
  assert.equal(app.get('inspector').hidden, true);
  assert.equal(app.storage.get('planedrawer.plan.v1'), before);
});

test('the symbol library groups every catalog item once and keeps placement and pressed states intact', () => {
  const app = loadApp();
  const groups = app.get('symbol-list').children;
  assert.deepEqual(groups.map(group => group.tagName), ['details', 'details', 'details', 'details']);
  assert.deepEqual(groups.map(group => group.children[0].textContent), ['Doors & windows', 'Kitchen & bathroom', 'Utilities', 'Stairs & details']);
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const buttons = descendants(app.get('symbol-list')).filter(node => node.dataset.symbol);
  assert.deepEqual(buttons.map(button => button.dataset.symbol).sort(), Object.keys(model.SYMBOLS).sort());
  const toilet = buttons.find(button => button.dataset.symbol === 'toilet');
  toilet.onclick();
  assert.equal(toilet.attrs['aria-pressed'], 'true');
  assert.ok(buttons.filter(button => button !== toilet).every(button => button.attrs['aria-pressed'] === 'false'));
  const canvas = app.get('canvas'); canvas.fire('pointerdown');
  const saved = JSON.parse(app.storage.get('planedrawer.plan.v1'));
  assert.equal(saved.symbols[0].type, 'toilet');
  app.tool('select');
  assert.ok(buttons.every(button => button.attrs['aria-pressed'] === 'false'));
});

test('the compact library opens on demand and closes on placement or a drawing tool without saving changes', () => {
  const app = loadApp();
  const toggle = app.get('toggle-symbols'), panel = app.get('tools-panel');
  assert.equal(toggle.attrs['aria-expanded'], 'false');
  toggle.onclick();
  assert.equal(toggle.attrs['aria-expanded'], 'true');
  assert.equal(panel.classList.contains('is-library-open'), true);
  pick(app, 'window');
  assert.equal(toggle.attrs['aria-expanded'], 'false');
  assert.equal(panel.classList.contains('is-library-open'), false);
  assert.equal(app.get('canvas').focused, true);
  toggle.onclick(); app.tool('wall');
  assert.equal(toggle.attrs['aria-expanded'], 'false');
  assert.equal(panel.classList.contains('is-library-open'), false);
  assert.equal(app.storage.size, 0);
});

test('the standalone editor includes its font and icon definitions without external runtime requests', () => {
  const html = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  const css = fs.readFileSync(require.resolve('./style.css'), 'utf8');
  const encodedFont = css.match(/data:font\/woff2;base64,([^\s"')]+)/)?.[1];
  assert.ok(encodedFont);
  assert.equal(Buffer.from(encodedFont, 'base64').subarray(0, 4).toString(), 'wOF2');
  assert.match(css, /SIL OPEN FONT LICENSE/);
  assert.match(html, /MIT License/);
  const defined = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/<use href="#([^"]+)"/g)) assert.ok(defined.has(match[1]), match[1]);
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
  assert.doesNotMatch(css, /url\(["']?https?:\/\//);
  assert.match(html, /id="inspector"[^>]+hidden/);
  assert.match(html, /aria-controls="symbol-browser"/);
});

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

function pick(app, type) {
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  descendants(app.get('symbol-list')).find(b => b.dataset.symbol === type).onclick();
}

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

const ALIGN = { ctrlKey: true, altKey: true };
const hold = (app, ...codes) => codes.forEach(code => app.key('keydown', { key: code.replace(/Left|Right/, ''), code, ...ALIGN }));
const release = (app, ...codes) => codes.forEach(code => app.key('keyup', { key: code.replace(/Left|Right/, ''), code }));
const guides = app => app.get('preview').children.filter(c => c.attrs['data-guide']).map(c => c.attrs['data-guide']);

test('symbols line up with other symbols and corners only while left Ctrl + left Alt are held', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app); pick(app, 'door');
  canvas.fire('pointermove', { clientX: 220, clientY: 125 }); canvas.fire('pointerdown', { clientX: 220, clientY: 125 }); canvas.fire('pointerup');
  canvas.fire('pointermove', { clientX: 225, clientY: 268 });
  assert.deepEqual(guides(app), []);
  hold(app, 'ControlLeft', 'AltRight'); // AltGr on Windows
  canvas.fire('pointermove', { clientX: 225, clientY: 268, ...ALIGN });
  assert.deepEqual(guides(app), []);
  release(app, 'ControlLeft', 'AltRight'); hold(app, 'ControlLeft', 'AltLeft');
  canvas.fire('pointermove', { clientX: 225, clientY: 268, ...ALIGN });
  assert.deepEqual(guides(app), ['x']);
  canvas.fire('pointerdown', { clientX: 225, clientY: 268, ...ALIGN }); canvas.fire('pointerup', ALIGN);
  const [first, second] = stored(app).symbols;
  assert.deepEqual([second.x, second.y, second.rotation], [first.x, 3, 180]);
  assert.ok(!stored(app).symbols.some(s => 'guides' in s));
  release(app, 'ControlLeft', 'AltLeft');
  canvas.fire('pointermove', { clientX: 225, clientY: 268 });
  assert.deepEqual(guides(app), []);
  canvas.fire('pointerdown', { clientX: 225, clientY: 268 }); canvas.fire('pointerup');
  assert.notEqual(stored(app).symbols[2].x, first.x);
});

test('dragging a fixture goes where the pointer goes; with left Ctrl+Alt it aligns and does not copy', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app); pick(app, 'toilet');
  canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  pick(app, 'sink');
  canvas.fire('pointerdown', { clientX: 226, clientY: 240 }); canvas.fire('pointerup');
  assert.equal(stored(app).symbols[1].x, 2.1);
  app.tool('select');
  const id = stored(app).symbols[1].id;
  canvas.fire('pointerdown', { clientX: 226, clientY: 240, target: { dataset: { symbol: id } } });
  canvas.fire('pointermove', { clientX: 113, clientY: 240 }); canvas.fire('pointerup');
  assert.equal(stored(app).symbols[1].x, .1);
  hold(app, 'ControlLeft', 'AltLeft');
  canvas.fire('pointerdown', { clientX: 113, clientY: 240, ...ALIGN, target: { dataset: { symbol: id } } });
  canvas.fire('pointermove', { clientX: 113, clientY: 240, ...ALIGN }); canvas.fire('pointerup', ALIGN);
  assert.deepEqual(stored(app).symbols.map(s => s.x), [2, 0]);
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

test('a room can be named; the name is saved, shown in the middle of the room, and kept by Ctrl+drag copies', () => {
  const app = loadApp(), canvas = app.get('canvas'), room = drawRoom(app);
  app.get('room-name').value = '  Kitchen ';
  app.get('room-properties').onsubmit({ preventDefault() {} });
  assert.deepEqual(stored(app).rooms, { [room.walls[0].room]: 'Kitchen' });
  const label = app.get('labels').children.find(t => t.textContent === 'Kitchen');
  assert.deepEqual([+label.attrs.x, +label.attrs.y], [2, 1.5]);
  canvas.fire('pointerdown', { ctrlKey: true, target: { dataset: { wall: room.walls[0].id } } });
  canvas.fire('pointermove', { clientX: 440, clientY: 110, ctrlKey: true }); canvas.fire('pointerup', { ctrlKey: true });
  assert.deepEqual(Object.values(stored(app).rooms), ['Kitchen', 'Kitchen']);
  app.get('room-name').value = '';
  app.get('room-properties').onsubmit({ preventDefault() {} });
  assert.equal(Object.keys(stored(app).rooms).length, 1);
});

test('a selected symbol can be resized from the inspector; copies keep the size', () => {
  const app = loadApp(), canvas = app.get('canvas');
  pick(app, 'sliding-door'); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  assert.equal(app.get('symbol-width').value, '1.80');
  app.get('symbol-width').value = '1'; app.get('symbol-depth').value = '0.2';
  app.get('symbol-properties').onsubmit({ preventDefault() {} });
  const sym = stored(app).symbols[0];
  assert.deepEqual([sym.type, sym.w, sym.h], ['sliding-door', 1, .2]);
  app.get('symbol-width').value = '0';
  app.get('symbol-properties').onsubmit({ preventDefault() {} });
  assert.equal(stored(app).symbols[0].w, 1);
  assert.equal(app.get('message').hidden, false);
  app.tool('select');
  canvas.fire('pointerdown', { clientX: 220, clientY: 200, ctrlKey: true, target: { dataset: { symbol: sym.id } } });
  canvas.fire('pointermove', { clientX: 330, clientY: 200, ctrlKey: true }); canvas.fire('pointerup', { ctrlKey: true });
  assert.deepEqual(stored(app).symbols.map(s => [s.w, s.h]), [[1, .2], [1, .2]]);
});

test('every catalog symbol, including stairs up and down, can be placed and is drawn', () => {
  for (const type of ['stairs-up', 'stairs-down', ...Object.keys(model.SYMBOLS)]) {
    const app = loadApp(), canvas = app.get('canvas');
    pick(app, type); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
    assert.equal(stored(app).symbols[0].type, type);
    assert.ok(app.get('symbols').children[0].children.length > 1, type + ' is drawn');
  }
  const label = type => { const app = loadApp(), canvas = app.get('canvas'); pick(app, type); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); return app.get('symbols').children[0].children.find(n => n.textContent).textContent; };
  assert.deepEqual([label('stairs-up'), label('stairs-down')], ['UP', 'DN']);
});

test('a selected symbol can be rotated and resized with the mouse using its handles', () => {
  const app = loadApp(), canvas = app.get('canvas'); pick(app, 'toilet');
  canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup'); app.tool('select');
  const handle = name => app.get('handles').children.flatMap(g => [g, ...g.children]).find(h => h.dataset.symbolHandle === name);
  canvas.fire('pointerdown', { clientX: 220, clientY: 160, target: handle('rotate') });
  canvas.fire('pointermove', { clientX: 275, clientY: 203 }); canvas.fire('pointerup');
  assert.equal(stored(app).symbols[0].rotation, 90);
  canvas.fire('pointerdown', { clientX: 220, clientY: 200, target: handle('w') });
  canvas.fire('pointermove', { clientX: 220, clientY: 227.5 }); canvas.fire('pointerup');
  assert.deepEqual(model.symbolSize(stored(app).symbols[0]), { w: 1.4, h: .7 });
  canvas.fire('pointerdown', { clientX: 220, clientY: 200, target: handle('wh') });
  canvas.fire('pointermove', { clientX: 209, clientY: 200 }); canvas.fire('pointerup');
  assert.deepEqual(model.symbolSize(stored(app).symbols[0]), { w: 1.4, h: 1.1 });
  canvas.fire('pointerdown', { clientX: 220, clientY: 200, target: handle('h') });
  canvas.fire('pointermove', { clientX: 400, clientY: 200 }); canvas.fire('pointerup');
  assert.deepEqual(model.symbolSize(stored(app).symbols[0]), { w: 1.4, h: .1 });
  assert.equal(stored(app).symbols.length, 1);
  app.key('keydown', { key: 'z', ctrlKey: true });
  assert.deepEqual(model.symbolSize(stored(app).symbols[0]), { w: 1.4, h: 1.1 });
});

test('the whole plan exports as a standalone SVG drawing without grid, selection or editing handles', () => {
  const app = loadApp(), canvas = app.get('canvas');
  app.get('export-svg').onclick();
  assert.equal(app.downloads.length, 0);
  assert.equal(app.get('message').hidden, false);
  drawRoom(app);
  app.get('room-name').value = 'Kitchen'; app.get('room-properties').onsubmit({ preventDefault() {} });
  pick(app, 'toilet'); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  app.get('export-svg').onclick();
  const { type, text } = app.downloads[0];
  assert.equal(type, 'image/svg+xml');
  assert.match(text, /^<svg viewBox="-1 -1 6 5" width="330" height="275">/);
  assert.equal(text.match(/stroke-width="0.15"/g).length, 4);
  assert.match(text, />Kitchen</);
  assert.match(text, />4.00 m</);
  assert.match(text, /<ellipse/);
  assert.doesNotMatch(text, /transparent|cursor|data-|grid/);
  assert.equal(stored(app).symbols.length, 1);
});

test('a text item can be placed anywhere, typed in, resized by its handle and exported', () => {
  const app = loadApp(), canvas = app.get('canvas');
  pick(app, 'text'); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  assert.equal(app.get('symbol-text').value, 'Text');
  assert.equal(app.get('symbol-text-fields').hidden, false);
  assert.equal(app.get('symbol-size-fields').hidden, true);
  app.get('symbol-text').value = 'Living room'; app.get('symbol-font').value = '0.5';
  app.get('symbol-properties').onsubmit({ preventDefault() {} });
  const item = stored(app).symbols[0];
  assert.deepEqual([item.type, item.text, item.h, item.x, item.y], ['text', 'Living room', .5, 2, 1.6]);
  const label = app.get('symbols').children[0].children.find(n => n.textContent === 'Living room');
  assert.equal(label.attrs['font-size'], '0.5');
  app.get('symbol-text').value = '   ';
  app.get('symbol-properties').onsubmit({ preventDefault() {} });
  assert.equal(stored(app).symbols[0].text, 'Living room');
  assert.equal(app.get('message').hidden, false);
  app.tool('select');
  const handles = app.get('handles').children.flatMap(g => g.children).map(h => h.dataset.symbolHandle).filter(Boolean);
  assert.deepEqual(handles, ['rotate', 'h']);
  const handle = app.get('handles').children.flatMap(g => g.children).find(h => h.dataset.symbolHandle === 'h');
  canvas.fire('pointerdown', { clientX: 220, clientY: 200, target: handle });
  canvas.fire('pointermove', { clientX: 220, clientY: 211 }); canvas.fire('pointerup');
  assert.equal(stored(app).symbols[0].h, .9);
  assert.equal(stored(app).symbols[0].text, 'Living room');
  app.get('export-svg').onclick();
  assert.match(app.downloads[0].text, />Living room</);
  pick(app, 'sink'); canvas.fire('pointerdown', { clientX: 400, clientY: 400 }); canvas.fire('pointerup');
  assert.equal(app.get('symbol-text-fields').hidden, true);
  assert.equal(app.get('symbol-size-fields').hidden, false);
});

test('every catalog symbol can be placed, inspected and deselected without changing saved data or camera', () => {
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  for (const type of Object.keys(model.SYMBOLS)) {
    const app = loadApp(), canvas = app.get('canvas');
    app.get('toggle-symbols').onclick();
    const buttons = descendants(app.get('symbol-list')).filter(node => node.dataset.symbol);
    buttons.find(button => button.dataset.symbol === type).onclick();
    assert.equal(app.get('toggle-symbols').attrs['aria-expanded'], 'false');
    assert.equal(buttons.filter(button => button.attrs['aria-pressed'] === 'true').length, 1);
    assert.equal(app.storage.size, 0);
    canvas.fire('pointermove', { clientX: 220, clientY: 220 });
    canvas.fire('pointerdown', { clientX: 220, clientY: 220 }); canvas.fire('pointerup');
    const before = app.storage.get('planedrawer.plan.v1'), plan = JSON.parse(before);
    assert.equal(plan.symbols[0].type, type);
    app.key('keydown', { key: 'v' });
    const target = { dataset: { symbol: plan.symbols[0].id } };
    canvas.fire('pointerdown', { target }); canvas.fire('pointerup');
    assert.equal(app.get('inspector').hidden, false);
    assert.equal(app.get('symbol-properties').hidden, false);
    assert.equal(app.get('symbol-text-fields').hidden, !model.SYMBOLS[type].text);
    const view = canvas.attrs.viewBox;
    app.get('close-inspector').onclick();
    assert.equal(app.get('inspector').hidden, true);
    assert.equal(app.storage.get('planedrawer.plan.v1'), before);
    assert.equal(canvas.attrs.viewBox, view);
    canvas.fire('pointerdown', { target }); canvas.fire('pointerup');
    app.key('keydown', { key: 'Escape' });
    assert.equal(app.get('inspector').hidden, true);
    assert.equal(app.storage.get('planedrawer.plan.v1'), before);
  }
});

test('area select picks only what is fully inside the box and drags it all as one undoable step', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  pick(app, 'toilet'); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  app.tool('wall'); canvas.fire('pointerdown', { clientX: 440, clientY: 110 }); canvas.fire('pointermove', { clientX: 440, clientY: 275 }); canvas.fire('pointerup');
  const before = stored(app);
  app.tool('area');
  assert.equal(app.active('area'), 'true');
  assert.equal(canvas.style.cursor, 'crosshair');
  canvas.fire('pointerdown', { clientX: 100, clientY: 100 }); canvas.fire('pointermove', { clientX: 340, clientY: 290 });
  assert.equal(app.get('preview').children.filter(c => c.attrs['data-marquee'] !== undefined).length, 1);
  canvas.fire('pointerup');
  assert.match(app.get('hint').textContent, /^5 items selected/);
  const room = before.walls.filter(w => w.room), outside = before.walls.find(w => !w.room), toilet = before.symbols[0];
  canvas.fire('pointerdown', { clientX: 110, clientY: 110, target: { dataset: { wall: room[0].id } } });
  canvas.fire('pointermove', { clientX: 165, clientY: 165 }); canvas.fire('pointerup');
  const after = stored(app);
  for (const w of room) {
    const moved = after.walls.find(x => x.id === w.id);
    assert.deepEqual([moved.a, moved.b], [{ x: w.a.x + 1, y: w.a.y + 1 }, { x: w.b.x + 1, y: w.b.y + 1 }]);
  }
  assert.deepEqual(after.walls.find(w => w.id === outside.id), outside);
  assert.deepEqual([after.symbols[0].x, after.symbols[0].y], [toilet.x + 1, toilet.y + 1]);
  app.key('keydown', { key: 'z', ctrlKey: true });
  assert.deepEqual(stored(app), before);
});

test('Ctrl+A selects the whole plan, Delete removes it in one step and Esc clears the selection', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  pick(app, 'toilet'); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  app.tool('select');
  app.key('keydown', { key: 'a', ctrlKey: true });
  assert.match(app.get('hint').textContent, /^5 items selected/);
  app.key('keydown', { key: 'Escape' });
  assert.doesNotMatch(app.get('hint').textContent, /items selected/);
  app.key('keydown', { key: 'a', ctrlKey: true }); app.key('keydown', { key: 'Delete' });
  assert.deepEqual([stored(app).walls.length, stored(app).symbols.length], [0, 0]);
  app.key('keydown', { key: 'z', ctrlKey: true });
  assert.deepEqual([stored(app).walls.length, stored(app).symbols.length], [4, 1]);
});

test('each room shows its area in square meters while dimensions are shown, under its name', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  const areas = () => app.get('labels').children.filter(c => c.textContent.endsWith(' m²')).map(c => c.textContent);
  assert.deepEqual(areas(), ['12.00 m²']);
  app.get('dimensions').checked = false; app.get('dimensions').onchange();
  assert.deepEqual(areas(), []);
  app.get('dimensions').checked = true; app.get('dimensions').onchange();
  const wall = stored(app).walls[0];
  app.tool('select'); canvas.fire('pointerdown', { target: { dataset: { wall: wall.id } } }); canvas.fire('pointerup');
  app.get('room-name').value = 'Kitchen'; app.get('room-width').value = '5'; app.get('room-height').value = '3'; app.get('room-thickness').value = wall.thickness;
  app.get('room-properties').onsubmit({ preventDefault() {} });
  assert.deepEqual(app.get('labels').children.map(c => c.textContent), ['Kitchen', '15.00 m²']);
});

test('Ctrl+C and Ctrl+V paste a copy of the selection 50 cm further each time, as new rooms with their names', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  pick(app, 'toilet'); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  const [wall] = stored(app).walls;
  app.tool('select'); canvas.fire('pointerdown', { target: { dataset: { wall: wall.id } } }); canvas.fire('pointerup');
  app.get('room-name').value = 'Bath'; app.get('room-width').value = '4'; app.get('room-height').value = '3'; app.get('room-thickness').value = wall.thickness;
  app.get('room-properties').onsubmit({ preventDefault() {} });
  app.key('keydown', { key: 'a', ctrlKey: true }); app.key('keydown', { key: 'c', ctrlKey: true });
  const before = stored(app);
  app.key('keydown', { key: 'v', ctrlKey: true }); app.key('keydown', { key: 'v', ctrlKey: true });
  const after = stored(app);
  assert.equal(after.walls.length, 12); assert.equal(after.symbols.length, 3);
  assert.deepEqual(after.symbols.map(s => [s.x, s.y]), [[2, 1.6], [2.5, 2.1], [3, 2.6]]);
  assert.equal(new Set(after.walls.map(w => w.room)).size, 3);
  assert.deepEqual(Object.values(after.rooms), ['Bath', 'Bath', 'Bath']);
  assert.equal(new Set([...after.walls, ...after.symbols].map(x => x.id)).size, 15);
  assert.match(app.get('hint').textContent, /^5 items selected/);
  app.key('keydown', { key: 'z', ctrlKey: true }); app.key('keydown', { key: 'z', ctrlKey: true });
  assert.deepEqual(stored(app), before);
});

test('Ctrl+drag on an area selection drags a copy and leaves the original; a Ctrl+click adds nothing', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  const before = stored(app), id = before.walls[0].id;
  app.key('keydown', { key: 'a', ctrlKey: true });
  canvas.fire('pointerdown', { clientX: 110, clientY: 110, ctrlKey: true, target: { dataset: { wall: id } } }); canvas.fire('pointerup', { clientX: 110, clientY: 110 });
  assert.deepEqual(stored(app), before);
  canvas.fire('pointerdown', { clientX: 110, clientY: 110, ctrlKey: true, target: { dataset: { wall: id } } });
  canvas.fire('pointermove', { clientX: 385, clientY: 110, ctrlKey: true }); canvas.fire('pointerup');
  const after = stored(app);
  assert.equal(after.walls.length, 8);
  assert.deepEqual(after.walls.slice(0, 4), before.walls);
  assert.deepEqual(after.walls.slice(4).map(w => w.a.x - 5), before.walls.map(w => w.a.x));
});

test('the status bar shows the total area of every room and hides it when there are none', () => {
  const app = loadApp(), canvas = app.get('canvas');
  assert.equal(app.get('total-area').hidden, true);
  drawRoom(app);
  app.tool('rectangle'); canvas.fire('pointerdown', { clientX: 440, clientY: 110 }); canvas.fire('pointermove', { clientX: 550, clientY: 220 }); canvas.fire('pointerup');
  assert.equal(app.get('total-area').hidden, false);
  assert.equal(app.get('total-area').textContent, 'Rooms 16.00 m²');
  app.key('keydown', { key: 'a', ctrlKey: true }); app.key('keydown', { key: 'Delete' });
  assert.equal(app.get('total-area').hidden, true);
});

test('arrow keys move the selection 10 cm (1 cm with Shift), one undo step each, and do nothing without a selection', () => {
  const app = loadApp(), canvas = app.get('canvas'); drawRoom(app);
  pick(app, 'toilet'); canvas.fire('pointerdown', { clientX: 220, clientY: 200 }); canvas.fire('pointerup');
  app.tool('select'); app.key('keydown', { key: 'Escape' });
  const start = stored(app), unselected = { key: 'ArrowRight', defaultPrevented: false };
  app.key('keydown', unselected);
  assert.deepEqual(stored(app), start);
  const id = start.symbols[0].id;
  canvas.fire('pointerdown', { clientX: 220, clientY: 200, target: { dataset: { symbol: id } } }); canvas.fire('pointerup', { clientX: 220, clientY: 200 });
  app.key('keydown', { key: 'ArrowRight' }); app.key('keydown', { key: 'ArrowUp', shiftKey: true });
  assert.deepEqual([stored(app).symbols[0].x, stored(app).symbols[0].y], [2.1, 1.59]);
  assert.deepEqual(stored(app).walls, start.walls);
  app.key('keydown', { key: 'a', ctrlKey: true }); app.key('keydown', { key: 'ArrowLeft' });
  const moved = stored(app);
  assert.deepEqual(moved.walls.map(w => [w.a.x, w.a.y]), start.walls.map(w => [M(w.a.x - .1), w.a.y]));
  assert.equal(moved.symbols[0].x, 2);
  for (let i = 0; i < 3; i++) app.key('keydown', { key: 'z', ctrlKey: true });
  assert.deepEqual(stored(app), start);
});
const M = n => Math.round(n * 100) / 100;

// A browser-like file and image pipeline: every image is 200 × 100 px.
const imageGlobals = (answers = []) => ({
  FileReader: class { readAsDataURL(file) { this.result = file.dataUrl; queueMicrotask(() => this.onload()); } },
  Image: class { set src(value) { this.naturalWidth = 200; this.naturalHeight = 100; queueMicrotask(() => this.onload()); } },
  prompt: () => answers.shift() ?? null,
  confirm: () => true
});
const PNG = 'data:image/png;base64,' + 'A'.repeat(1000);
async function addImage(app, file = { size: 1000, dataUrl: PNG }) {
  app.get('backdrop-file').files = [file];
  await app.get('backdrop-file').onchange();
}
const backdropImage = app => app.get('backdrop').children.find(c => c.tagName === 'image');

test('a reference image is drawn under the plan, scaled from two points and a real distance, and kept in this browser only', async () => {
  const app = loadApp({ globals: imageGlobals(['4']) }), canvas = app.get('canvas'); drawRoom(app);
  assert.equal(app.get('backdrop-controls').hidden, true);
  await addImage(app);
  assert.equal(app.get('backdrop-controls').hidden, false);
  assert.equal(app.get('backdrop-add-label').textContent, 'Replace image');
  const first = JSON.parse(app.storage.get('planedrawer.backdrop.v1'));
  assert.equal(first.src, PNG); assert.equal(first.aspect, .5); assert.equal(first.opacity, .5);
  assert.equal(backdropImage(app).attrs['pointer-events'], 'none');
  assert.equal(backdropImage(app).attrs.height, String(first.width / 2));
  const plan = app.storage.get('planedrawer.plan.v1');
  app.get('backdrop-scale').onclick();
  assert.match(app.get('hint').textContent, /^Set scale/);
  canvas.fire('pointerdown', { clientX: 110, clientY: 110 });
  canvas.fire('pointermove', { clientX: 220, clientY: 110 });
  assert.ok(app.get('preview').children.some(c => c.tagName === 'line'));
  canvas.fire('pointerdown', { clientX: 220, clientY: 110 });
  const scaled = JSON.parse(app.storage.get('planedrawer.backdrop.v1'));
  assert.ok(Math.abs(scaled.width - first.width * 2) < 1e-9);
  assert.ok(Math.abs(scaled.x - first.x * 2) < 1e-9 && Math.abs(scaled.y - first.y * 2) < 1e-9);
  assert.equal(app.active('select'), 'true');
  assert.equal(app.storage.get('planedrawer.plan.v1'), plan);
  app.get('backdrop-opacity').value = '0.8'; app.get('backdrop-opacity').oninput();
  assert.equal(backdropImage(app).attrs.opacity, '0.8');
  app.get('export').onclick(); app.get('export-svg').onclick();
  assert.ok(app.downloads.every(d => !d.text.includes('data:image') && !d.text.includes('<image')));
  const reloaded = loadApp({ seed: app.storage });
  assert.equal(backdropImage(reloaded).attrs.opacity, '0.8');
  app.get('backdrop-remove').onclick();
  assert.equal(app.storage.has('planedrawer.backdrop.v1'), false);
  assert.equal(backdropImage(app), undefined);
  assert.equal(app.get('backdrop-controls').hidden, true);
});

test('Set scale changes nothing when canceled or given an invalid distance', async () => {
  const app = loadApp({ globals: imageGlobals([null, '0']) }), canvas = app.get('canvas');
  await addImage(app);
  const before = app.storage.get('planedrawer.backdrop.v1');
  for (const expected of [undefined, /between 0.10 and 1000/]) {
    app.get('backdrop-scale').onclick();
    canvas.fire('pointerdown', { clientX: 110, clientY: 110 }); canvas.fire('pointerdown', { clientX: 220, clientY: 110 });
    assert.equal(app.storage.get('planedrawer.backdrop.v1'), before);
    if (expected) assert.match(app.get('message').textContent, expected);
  }
  app.get('backdrop-scale').onclick(); canvas.fire('pointerdown', { clientX: 110, clientY: 110 });
  app.key('keydown', { key: 'Escape' });
  assert.equal(app.active('select'), 'true');
  assert.equal(app.storage.get('planedrawer.backdrop.v1'), before);
});

test('reference images that are too large, unsupported or corrupt are refused without breaking the editor', async () => {
  const app = loadApp({ globals: imageGlobals() });
  await addImage(app, { size: 5_000_000, dataUrl: PNG });
  assert.match(app.get('message').textContent, /under 4 MB/);
  await addImage(app, { size: 100, dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' });
  assert.match(app.get('message').textContent, /could not be opened/);
  assert.equal(backdropImage(app), undefined);
  const full = loadApp({ globals: imageGlobals(), storageLimit: 500 });
  await addImage(full);
  assert.match(full.get('message').textContent, /too large to keep/);
  assert.ok(backdropImage(full));
  const corrupt = loadApp({ seed: [['planedrawer.backdrop.v1', JSON.stringify({ src: 'javascript:alert(1)', x: 0, y: 0, width: 1, aspect: 1, opacity: .5 })]] });
  assert.equal(backdropImage(corrupt), undefined);
  assert.equal(corrupt.get('backdrop-controls').hidden, true);
});
