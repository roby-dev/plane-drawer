(function (root) {
  'use strict';
  const round = n => Math.round(n * 10000) / 10000;
  const wall = (a, b) => ({ id: globalThis.crypto.randomUUID(), a: { ...a }, b: { ...b }, thickness: 0.15 });
  const length = w => round(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y));
  function rectangle(a, b) {
    const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
    const points = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    return points.map((p, i) => wall(p, points[(i + 1) % 4]));
  }
  function move(w, delta) {
    const shift = p => ({ x: round(p.x + delta.x), y: round(p.y + delta.y) });
    return { ...w, a: shift(w.a), b: shift(w.b) };
  }
  function resize(w, distance, degrees) {
    if (!Number.isFinite(distance) || distance < 0.1 || distance > 1000 || !Number.isFinite(degrees)) throw new Error('Invalid dimensions');
    const radians = degrees * Math.PI / 180;
    return { ...w, b: { x: round(w.a.x + Math.cos(radians) * distance), y: round(w.a.y + Math.sin(radians) * distance) } };
  }
  function findReference(point, walls, tolerance) {
    const distance = p => Math.hypot(p.x - point.x, p.y - point.y);
    let closest = null, best = tolerance;
    for (const wall of walls) {
      for (const end of [wall.a, wall.b]) {
        const d = distance(end);
        if (d <= best) { best = d; closest = { point: { ...end }, kind: 'endpoint' }; }
      }
    }
    if (closest) return closest;
    for (const wall of walls) {
      const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y;
      const squared = dx * dx + dy * dy;
      if (!squared) continue;
      const t = Math.max(0, Math.min(1, ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / squared));
      const projected = { x: wall.a.x + t * dx, y: wall.a.y + t * dy };
      const d = distance(projected);
      if (d <= best) { best = d; closest = { point: projected, kind: 'wall' }; }
    }
    return closest;
  }
  function decode(raw) {
    const data = JSON.parse(raw);
    const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 10000 && Math.abs(p.y) <= 10000;
    if (!data || data.version !== 1 || typeof data.name !== 'string' || data.name.length > 80 || !Array.isArray(data.walls) || data.walls.length > 5000) throw new Error('Invalid plan');
    const ids = new Set();
    for (const w of data.walls) {
      if (!w || typeof w.id !== 'string' || ids.has(w.id) || !point(w.a) || !point(w.b) || length(w) < .1 || !Number.isFinite(w.thickness) || w.thickness < .05 || w.thickness > 1) throw new Error('Invalid wall');
      ids.add(w.id);
    }
    return { name: data.name, walls: data.walls.map(w => ({ id: w.id, a: { x: w.a.x, y: w.a.y }, b: { x: w.b.x, y: w.b.y }, thickness: w.thickness })) };
  }
  function encode(plan) {
    const text = JSON.stringify({ version: 1, name: plan.name, walls: plan.walls });
    decode(text);
    return text;
  }
  const api = { round, wall, length, rectangle, move, resize, decode, encode, findReference };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PlanModel = api;
})(globalThis);
