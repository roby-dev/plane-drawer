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
  const data = { name: 'My plan', walls: model.rectangle({ x: 0, y: 0 }, { x: 4, y: 3 }) };
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
