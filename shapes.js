'use strict';
// Plan symbols, drawn in meters around their center. Local +y points into the room (away from the wall).
// Each shape receives `add(tag, attrs, text)`, which draws with SYMBOL_INK unless attrs override it.
const SYMBOL_INK = { stroke: '#344c63', 'stroke-width': .025, fill: '#fff', 'stroke-linejoin': 'round' };
const SYMBOL_PAPER = '#fbfdff';
const SYMBOL_LABEL = { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': .15, fill: '#fff', stroke: 'none', 'font-family': 'Segoe UI, sans-serif' };
// A straight flight of 12 treads. The walking line starts with a dot at the bottom step and ends with an arrow
// at the top step; going down, the line runs the other way.
function stairs(add, up) {
  add('rect', { x: -.5, y: -1.5, width: 1, height: 3 });
  for (let i = 1; i < 12; i++) add('line', { x1: -.5, y1: -1.5 + i * .25, x2: .5, y2: -1.5 + i * .25 });
  const [from, to] = up ? [1.375, -1.375] : [-1.375, 1.375], head = up ? .15 : -.15;
  add('line', { x1: 0, y1: from, x2: 0, y2: to, stroke: '#3471d5', 'stroke-width': .03 });
  add('circle', { cx: 0, cy: from, r: .05, fill: '#3471d5', stroke: 'none' });
  add('path', { d: 'M -.12 ' + (to + head) + ' L 0 ' + to + ' L .12 ' + (to + head), fill: 'none', stroke: '#3471d5', 'stroke-width': .03 });
  add('text', { ...SYMBOL_LABEL, x: .3, y: from, 'font-size': .18, fill: '#344c63' }, up ? 'UP' : 'DN');
}
const SYMBOL_SHAPES = {
  // Drawn at its real size (never scaled), so the letters keep their shape.
  text: (add, sym) => add('text', { ...SYMBOL_LABEL, 'font-size': M.symbolSize(sym).h, fill: '#253b51' }, sym.text || 'Text'),
  'stairs-up': add => stairs(add, true),
  'stairs-down': add => stairs(add, false),
  door: add => {
    add('rect', { x: -.35, y: -.125, width: .7, height: .25, fill: SYMBOL_PAPER, stroke: 'none' });
    add('line', { x1: -.35, y1: -.125, x2: -.35, y2: .125 }); add('line', { x1: .35, y1: -.125, x2: .35, y2: .125 });
    add('line', { x1: -.35, y1: 0, x2: -.35, y2: .7, 'stroke-width': .04 });
    add('path', { d: 'M .35 0 A .7 .7 0 0 1 -.35 .7', fill: 'none', 'stroke-dasharray': '.05 .04' });
  },
  window: add => {
    add('rect', { x: -.6, y: -.125, width: 1.2, height: .25, fill: SYMBOL_PAPER, stroke: 'none' });
    add('rect', { x: -.6, y: -.06, width: 1.2, height: .12 }); add('line', { x1: -.6, y1: 0, x2: .6, y2: 0 });
  },
  toilet: add => { add('rect', { x: -.2, y: -.35, width: .4, height: .18, rx: .03 }); add('ellipse', { cx: 0, cy: .07, rx: .19, ry: .27 }); },
  sink: add => { add('rect', { x: -.25, y: -.2, width: .5, height: .4, rx: .05 }); add('ellipse', { cx: 0, cy: .04, rx: .17, ry: .11 }); add('circle', { cx: 0, cy: -.14, r: .025 }); },
  shower: add => {
    add('rect', { x: -.45, y: -.45, width: .9, height: .9 });
    add('line', { x1: -.45, y1: -.45, x2: .45, y2: .45, stroke: '#9bb0c4' }); add('line', { x1: .45, y1: -.45, x2: -.45, y2: .45, stroke: '#9bb0c4' });
    add('circle', { cx: 0, cy: 0, r: .05 });
  },
  'kitchen-sink': add => {
    add('rect', { x: -.6, y: -.3, width: 1.2, height: .6 });
    add('rect', { x: -.54, y: -.22, width: .5, height: .44, rx: .04 }); add('rect', { x: .04, y: -.22, width: .5, height: .44, rx: .04 });
    add('circle', { cx: 0, cy: -.26, r: .025 });
  },
  'laundry-sink': add => {
    add('rect', { x: -.4, y: -.3, width: .8, height: .6 });
    add('rect', { x: -.35, y: -.24, width: .42, height: .48, rx: .04 });
    [-.16, -.06, .04, .14].forEach(y => add('line', { x1: .12, y1: y, x2: .33, y2: y, stroke: '#9bb0c4' }));
    add('circle', { cx: -.14, cy: -.27, r: .025 });
  },
  washer: add => {
    add('rect', { x: -.3, y: -.3, width: .6, height: .6, rx: .03 });
    add('circle', { cx: 0, cy: .03, r: .2 }); add('circle', { cx: 0, cy: .03, r: .12 }); add('circle', { cx: -.2, cy: -.22, r: .02 });
  },
  'garage-door': add => {
    add('rect', { x: -1.2, y: -.125, width: 2.4, height: .25, fill: SYMBOL_PAPER, stroke: 'none' });
    add('line', { x1: -1.2, y1: -.125, x2: -1.2, y2: .125 }); add('line', { x1: 1.2, y1: -.125, x2: 1.2, y2: .125 });
    add('rect', { x: -1.2, y: -.05, width: 2.4, height: .1 });
    [-.6, 0, .6].forEach(x => add('line', { x1: x, y1: -.05, x2: x, y2: .05, stroke: '#9bb0c4' }));
    add('rect', { x: -1.2, y: .05, width: 2.4, height: .4, fill: 'none', 'stroke-dasharray': '.08 .06', stroke: '#9bb0c4' });
  },
  // Two overlapping glass panels; the arrow shows the panel that slides.
  'sliding-door': add => {
    add('rect', { x: -.9, y: -.125, width: 1.8, height: .25, fill: SYMBOL_PAPER, stroke: 'none' });
    add('line', { x1: -.9, y1: -.125, x2: -.9, y2: .125 }); add('line', { x1: .9, y1: -.125, x2: .9, y2: .125 });
    add('rect', { x: -.9, y: -.07, width: .95, height: .05, fill: '#dcecf8' });
    add('rect', { x: -.05, y: .02, width: .95, height: .05, fill: '#dcecf8' });
    add('path', { d: 'M .65 .22 H .15 M .25 .17 L .15 .22 L .25 .27', fill: 'none', stroke: '#9bb0c4' });
  },
  car: add => {
    add('rect', { x: -.83, y: -1.8825, width: 1.66, height: 3.765, rx: .4 });
    add('path', { d: 'M -.6 -.9 L -.5 -1.38 H .5 L .6 -.9 Z', fill: '#e3edf6' });
    add('path', { d: 'M -.6 1 L -.5 1.38 H .5 L .6 1 Z', fill: '#e3edf6' });
    add('rect', { x: -.58, y: -.75, width: 1.16, height: 1.6, rx: .12, fill: 'none', stroke: '#9bb0c4' });
    [[-.83, -1.35], [.75, -1.35], [-.83, .95], [.75, .95]].forEach(([x, y]) => add('rect', { x, y, width: .08, height: .4, rx: .02, fill: '#344c63' }));
  },
  'water-cold': add => { add('circle', { cx: 0, cy: 0, r: .12, fill: '#2f80ed' }); add('text', SYMBOL_LABEL, 'C'); },
  'water-hot': add => { add('circle', { cx: 0, cy: 0, r: .12, fill: '#e5484d' }); add('text', SYMBOL_LABEL, 'H'); },
  drain: add => { add('circle', { cx: 0, cy: 0, r: .12 }); add('line', { x1: -.07, y1: -.07, x2: .07, y2: .07 }); add('line', { x1: .07, y1: -.07, x2: -.07, y2: .07 }); }
};
