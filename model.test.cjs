const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');

test('a rectangle creates four measured walls, regardless of drawing direction', () => {
  const walls = model.rectangle({ x: 5, y: 4 }, { x: 1, y: 1 });
  assert.equal(walls.length, 4);
  assert.deepEqual(walls.map(model.length), [4, 3, 4, 3]);
  assert.deepEqual(walls[0].a, { x: 1, y: 1 });
});

test('moving and resizing walls preserves thickness and supports any direction', () => {
  const wall = model.wall({ x: 1, y: 2 }, { x: 5, y: 2 });
  const moved = model.move(wall, { x: 2, y: -1 });
  assert.deepEqual(moved.a, { x: 3, y: 1 });
  assert.equal(model.length(moved), 4);
  const resized = model.resize(moved, 3, 90);
  assert.equal(model.length(resized), 3);
  assert.deepEqual(resized.b, { x: 3, y: 4 });
  assert.equal(resized.thickness, 0.15);
});

test('saved plans round-trip and malformed data is rejected without changing storage', () => {
  const data = { name: 'My plan', walls: model.rectangle({ x: 0, y: 0 }, { x: 4, y: 3 }), symbols: [model.symbol('toilet', 1, 1, 90)], rooms: {} };
  assert.deepEqual(model.decode(model.encode(data)), data);
  assert.throws(() => model.decode('{broken'));
  assert.throws(() => model.decode(JSON.stringify({ version: 1, name: 'Bad', walls: [{ id: 'x' }] })));
  assert.throws(() => model.decode(JSON.stringify({ version: 2, ...data })));
});

test('drawing references prefer endpoints, project onto walls, and ignore distant lines', () => {
  const wall = model.wall({ x: .23, y: .27 }, { x: 4.23, y: 3.27 });
  assert.deepEqual(model.findReference({ x: .25, y: .29 }, [wall], .2).point, wall.a);
  const middle = model.findReference({ x: 2.25, y: 1.75 }, [wall], .2);
  assert.equal(middle.kind, 'wall');
  assert.ok(Math.abs((middle.point.y - .27) * 4 - (middle.point.x - .23) * 3) < 1e-8);
  assert.equal(model.findReference({ x: 20, y: 20 }, [wall], .2), null);
  assert.equal(model.findReference({ x: 1, y: 1 }, [], .2), null);
});

test('a straight-line reference finds where the line crosses a wall or reaches an endpoint', () => {
  const vertical = model.wall({ x: 4, y: 0 }, { x: 4, y: 3 });
  const start = { x: 0, y: 1.5 };
  const crossing = model.findLineReference(start, { x: 3.98, y: 1.5 }, [vertical], .2);
  assert.deepEqual(crossing, { point: { x: 4, y: 1.5 }, kind: 'wall' });
  const corner = model.findLineReference({ x: 0, y: 0 }, { x: 3.95, y: 0 }, [vertical], .2);
  assert.deepEqual(corner, { point: { x: 4, y: 0 }, kind: 'endpoint' });
  assert.equal(model.findLineReference(start, { x: 2, y: 1.5 }, [vertical], .2), null);
  assert.equal(model.findLineReference(start, start, [vertical], .2), null);
});

test('rectangles are rooms that resize as one and survive saving', () => {
  const walls = model.rectangle({ x: 0, y: 0 }, { x: 4, y: 3 });
  assert.equal(new Set(walls.map(w => w.room)).size, 1);
  assert.ok(walls[0].room);
  assert.deepEqual(model.decode(model.encode({ name: 'r', walls, symbols: [] })).walls, walls);
  assert.deepEqual(model.roomBounds(walls), { left: 0, top: 0, right: 4, bottom: 3 });
  const bigger = model.resizeRoom(walls, { left: 0, top: 0, right: 6, bottom: 4 });
  assert.deepEqual(bigger.map(w => w.id), walls.map(w => w.id));
  assert.deepEqual(bigger.map(model.length), [6, 4, 6, 4]);
  assert.equal(bigger[0].room, walls[0].room);
});

test('measuring starts at a corner, or at the nearest corner of the hovered wall', () => {
  const wall = model.wall({ x: 0, y: 0 }, { x: 4, y: 0 });
  const latched = model.findMeasure({ x: 0.05, y: 0.05 }, [wall], .2);
  assert.deepEqual([latched.anchor, latched.latched], [{ x: 0, y: 0 }, true]);
  const slid = model.findMeasure({ x: 1.5, y: 0.05 }, [wall], .2, latched.anchor);
  assert.deepEqual([slid.target, slid.distance], [{ x: 1.5, y: 0 }, 1.5]);
  const fallback = model.findMeasure({ x: 3.5, y: 0.05 }, [wall], .2);
  assert.deepEqual([fallback.anchor, fallback.distance, fallback.latched], [{ x: 4, y: 0 }, .5, false]);
  assert.equal(model.findMeasure({ x: 2, y: 2 }, [wall], .2), null);
});

test('symbols: catalog, validation and plans saved without symbols', () => {
  for (const type of ['door', 'window', 'toilet', 'sink', 'shower', 'kitchen-sink', 'laundry-sink', 'washer', 'water-cold', 'water-hot', 'drain', 'garage-door', 'car'])
    assert.ok(model.SYMBOLS[type].w > 0 && model.SYMBOLS[type].h > 0 && model.SYMBOLS[type].label, type);
  assert.deepEqual([model.SYMBOLS.car.w, model.SYMBOLS.car.h], [1.66, 3.765]);
  assert.ok(model.SYMBOLS.door.w <= 0.7, 'doors are at most 70 cm');
  assert.ok(model.SYMBOLS['garage-door'].wall && model.SYMBOLS['garage-door'].w > 2);
  const base = { version: 1, name: 'x', walls: [] };
  assert.deepEqual(model.decode(JSON.stringify(base)).symbols, []);
  const bad = symbols => () => model.decode(JSON.stringify({ ...base, symbols }));
  assert.throws(bad([{ id: 'a', type: 'dragon', x: 0, y: 0, rotation: 0 }]));
  assert.throws(bad([{ id: 'a', type: 'door', x: 'no', y: 0, rotation: 0 }]));
  assert.throws(bad([{ id: 'a', type: 'door', x: 0, y: 0, rotation: 0 }, { id: 'a', type: 'door', x: 1, y: 0, rotation: 0 }]));
});

test('doors and windows snap onto a wall, facing the side the cursor is on', () => {
  const wall = model.wall({ x: 0, y: 0 }, { x: 4, y: 0 });
  const below = model.snapToWall({ x: 2, y: .3 }, [wall], .4);
  assert.deepEqual(below, { x: 2, y: 0, rotation: 0 });
  const above = model.snapToWall({ x: 2, y: -.3 }, [wall], .4);
  assert.deepEqual(above, { x: 2, y: 0, rotation: 180 });
  assert.equal(model.snapToWall({ x: 2, y: 2 }, [wall], .4), null);
});

test('alignment snaps a point to the nearest matching x or y and reports the guide line', () => {
  const targets = [{ x: 2, y: 0 }, { x: 5, y: 3 }];
  const both = model.findAlignment({ x: 2.08, y: 2.95 }, targets, .15);
  assert.deepEqual([both.x, both.y], [2, 3]);
  assert.deepEqual(both.guides.map(g => [g.axis, g.value]), [['x', 2], ['y', 3]]);
  assert.deepEqual([both.guides[0].from, both.guides[0].to], [0, 3]);
  const onlyX = model.findAlignment({ x: 2.08, y: 2.95 }, targets, .15, { x: true, y: false });
  assert.deepEqual([onlyX.x, onlyX.y, onlyX.guides.length], [2, 2.95, 1]);
  const far = model.findAlignment({ x: 3.5, y: 1.5 }, targets, .15);
  assert.deepEqual([far.x, far.y, far.guides.length], [3.5, 1.5, 0]);
});

test('sliding glass door, symbol sizes and room names round-trip through a saved plan', () => {
  assert.ok(model.SYMBOLS['sliding-door'].wall);
  const door = model.resizeSymbol(model.symbol('door', 1, 2), .9, .8);
  assert.deepEqual(model.symbolSize(door), { w: .9, h: .8 });
  assert.deepEqual(model.symbolSize(model.symbol('door', 0, 0)), { w: .7, h: .7 });
  assert.throws(() => model.resizeSymbol(door, .05, 1));
  assert.throws(() => model.resizeSymbol(door, 1, 25));
  const copy = model.copySymbol(door);
  assert.notEqual(copy.id, door.id);
  assert.deepEqual(model.symbolSize(copy), { w: .9, h: .8 });
  const walls = model.rectangle({ x: 0, y: 0 }, { x: 4, y: 3 });
  const plan = { name: 'x', walls, symbols: [door], rooms: { [walls[0].room]: 'Kitchen' } };
  const back = model.decode(model.encode(plan));
  assert.deepEqual(back.rooms, plan.rooms);
  assert.deepEqual(model.symbolSize(back.symbols[0]), { w: .9, h: .8 });
  assert.deepEqual(model.decode(JSON.stringify({ version: 1, name: 'x', walls: [] })).rooms, {});
  const bad = extra => () => model.decode(JSON.stringify({ version: 1, name: 'x', walls: [], ...extra }));
  assert.throws(bad({ rooms: { a: 'x'.repeat(41) } }));
  assert.throws(bad({ rooms: [] }));
  assert.throws(bad({ symbols: [{ id: 'a', type: 'door', x: 0, y: 0, rotation: 0, w: -1 }] }));
});
