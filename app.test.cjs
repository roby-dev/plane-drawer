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
  const storage = new Map();
  const context = { PlanModel: model, structuredClone, setTimeout, clearTimeout, ResizeObserver: class { observe() {} }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, document: { getElementById: get, querySelectorAll: () => tools, createElementNS: () => new Element(), addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), context);
  return { get, storage, tool: name => tools.find(el => el.dataset.tool === name).onclick(), active: name => tools.find(el => el.dataset.tool === name).attrs['aria-pressed'] };
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
