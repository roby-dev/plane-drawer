(function (root) {
  'use strict';
  const round = n => Math.round(n * 10000) / 10000;
  const wall = (a, b) => ({ id: globalThis.crypto.randomUUID(), a: { ...a }, b: { ...b }, thickness: 0.15 });
  const length = w => round(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y));
  function rectangle(a, b) {
    const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
    const points = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    const room = globalThis.crypto.randomUUID();
    return points.map((p, i) => ({ ...wall(p, points[(i + 1) % 4]), room }));
  }
  // Size in meters (w along the wall, h across it). `wall` symbols snap onto walls.
  const SYMBOLS = {
    door: { label: 'Door', w: .9, h: .9, wall: true },
    window: { label: 'Window', w: 1.2, h: .25, wall: true },
    toilet: { label: 'Toilet', w: .4, h: .7 },
    sink: { label: 'Sink', w: .5, h: .4 },
    shower: { label: 'Shower', w: .9, h: .9 },
    'kitchen-sink': { label: 'Kitchen sink', w: 1.2, h: .6 },
    'laundry-sink': { label: 'Laundry sink', w: .8, h: .6 },
    washer: { label: 'Washing machine', w: .6, h: .6 },
    'water-cold': { label: 'Cold water', w: .24, h: .24 },
    'water-hot': { label: 'Hot water', w: .24, h: .24 },
    drain: { label: 'Drain', w: .24, h: .24 }
  };
  const symbol = (type, x, y, rotation = 0) => ({ id: globalThis.crypto.randomUUID(), type, x: round(x), y: round(y), rotation });
  // Closest point on a wall plus the wall's angle; the symbol faces the side of the wall the cursor is on.
  function snapToWall(point, walls, tolerance) {
    let best = tolerance, found = null;
    for (const w of walls) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, squared = dx * dx + dy * dy;
      if (!squared) continue;
      const t = Math.max(0, Math.min(1, ((point.x - w.a.x) * dx + (point.y - w.a.y) * dy) / squared));
      const px = w.a.x + t * dx, py = w.a.y + t * dy, d = Math.hypot(point.x - px, point.y - py);
      if (d > best) continue;
      best = d;
      let rotation = Math.atan2(dy, dx) * 180 / Math.PI;
      if ((point.x - px) * -dy + (point.y - py) * dx < 0) rotation += 180;
      rotation = round(((rotation + 180) % 360 + 360) % 360 - 180);
      found = { x: round(px), y: round(py), rotation: rotation === -180 ? 180 : rotation };
    }
    return found;
  }
  // Snap a point's x and/or y to the closest target value; each snapped axis reports a guide line spanning the aligned targets.
  function findAlignment(point, targets, tolerance, free = { x: true, y: true }) {
    const out = { x: point.x, y: point.y, guides: [] };
    for (const axis of ['x', 'y']) {
      if (!free[axis]) continue;
      let best = tolerance, value = null;
      for (const t of targets) { const d = Math.abs(t[axis] - point[axis]); if (d <= best) { best = d; value = t[axis]; } }
      if (value !== null) { out[axis] = round(value); out.guides.push({ axis, value: out[axis] }); }
    }
    for (const g of out.guides) {
      const other = g.axis === 'x' ? 'y' : 'x';
      const spans = targets.filter(t => Math.abs(t[g.axis] - g.value) < 1e-6).map(t => t[other]).concat(out[other]);
      g.from = Math.min(...spans); g.to = Math.max(...spans);
    }
    return out;
  }
  function roomBounds(walls) {
    const xs = walls.flatMap(w => [w.a.x, w.b.x]), ys = walls.flatMap(w => [w.a.y, w.b.y]);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }
  // The four walls of a room (top, right, bottom, left) stretched to a new rectangle; ids and thickness are kept.
  function resizeRoom(walls, rect) {
    const points = [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }, { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }]
      .map(p => ({ x: round(p.x), y: round(p.y) }));
    return walls.map((w, i) => ({ ...w, a: points[i], b: points[(i + 1) % 4] }));
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
        if (d <= best) { best = d; closest = { point: { ...end }, kind: 'endpoint', wall }; }
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
      if (d <= best) { best = d; closest = { point: projected, kind: 'wall', wall }; }
    }
    return closest;
  }
  // Distance in meters from a corner to the hovered point of a wall. Hovering a corner latches it as the anchor.
  function findMeasure(point, walls, tolerance, anchor) {
    const ref = findReference(point, walls, tolerance);
    if (!ref) return anchor ? { anchor, target: null, distance: null, latched: true } : null;
    let latched = !!anchor;
    if (!anchor) {
      if (ref.kind === 'endpoint') { anchor = ref.point; latched = true; }
      else {
        const [a, b] = [ref.wall.a, ref.wall.b], d = p => Math.hypot(p.x - ref.point.x, p.y - ref.point.y);
        anchor = { ...(d(a) <= d(b) ? a : b) };
      }
    }
    const target = { x: round(ref.point.x), y: round(ref.point.y) };
    return { anchor, target, distance: round(Math.hypot(target.x - anchor.x, target.y - anchor.y)), latched };
  }
  // Reference on the straight line start->point: an endpoint beside the line, or where the line crosses a wall.
  function findLineReference(start, point, walls, tolerance) {
    const ux = point.x - start.x, uy = point.y - start.y, len = Math.hypot(ux, uy);
    if (!len) return null;
    const dir = { x: ux / len, y: uy / len };
    let best = tolerance, found = null;
    const consider = (candidate, kind) => {
      const d = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (d <= best) { best = d; found = { point: { x: round(candidate.x), y: round(candidate.y) }, kind }; }
    };
    for (const wall of walls) for (const end of [wall.a, wall.b]) {
      const along = (end.x - start.x) * dir.x + (end.y - start.y) * dir.y;
      const across = Math.abs((end.x - start.x) * dir.y - (end.y - start.y) * dir.x);
      if (across <= tolerance) consider({ x: start.x + dir.x * along, y: start.y + dir.y * along }, 'endpoint');
    }
    if (found) return found;
    for (const wall of walls) {
      const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y;
      const denominator = dir.x * dy - dir.y * dx;
      if (Math.abs(denominator) < 1e-9) continue;
      const t = ((wall.a.x - start.x) * dir.y - (wall.a.y - start.y) * dir.x) / denominator;
      if (t < 0 || t > 1) continue;
      consider({ x: wall.a.x + t * dx, y: wall.a.y + t * dy }, 'wall');
    }
    return found;
  }
  function decode(raw) {
    const data = JSON.parse(raw);
    const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 10000 && Math.abs(p.y) <= 10000;
    if (!data || data.version !== 1 || typeof data.name !== 'string' || data.name.length > 80 || !Array.isArray(data.walls) || data.walls.length > 5000) throw new Error('Invalid plan');
    const ids = new Set();
    for (const w of data.walls) {
      if (w && w.room !== undefined && (typeof w.room !== 'string' || w.room.length > 64)) throw new Error('Invalid wall');
      if (!w || typeof w.id !== 'string' || ids.has(w.id) || !point(w.a) || !point(w.b) || length(w) < .1 || !Number.isFinite(w.thickness) || w.thickness < .05 || w.thickness > 1) throw new Error('Invalid wall');
      ids.add(w.id);
    }
    const symbols = data.symbols === undefined ? [] : data.symbols, symbolIds = new Set();
    if (!Array.isArray(symbols) || symbols.length > 2000) throw new Error('Invalid plan');
    for (const s of symbols) {
      if (!s || typeof s.id !== 'string' || symbolIds.has(s.id) || !SYMBOLS[s.type] || !point(s) || !Number.isFinite(s.rotation)) throw new Error('Invalid symbol');
      symbolIds.add(s.id);
    }
    return { name: data.name, symbols: symbols.map(s => ({ id: s.id, type: s.type, x: s.x, y: s.y, rotation: s.rotation })), walls: data.walls.map(w => ({ id: w.id, a: { x: w.a.x, y: w.a.y }, b: { x: w.b.x, y: w.b.y }, thickness: w.thickness, ...(w.room ? { room: w.room } : {}) })) };
  }
  function encode(plan) {
    const text = JSON.stringify({ version: 1, name: plan.name, walls: plan.walls, symbols: plan.symbols || [] });
    decode(text);
    return text;
  }
  const api = { round, wall, length, rectangle, move, resize, decode, encode, findReference, findLineReference, findMeasure, findAlignment, roomBounds, resizeRoom, SYMBOLS, symbol, snapToWall };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PlanModel = api;
})(globalThis);
