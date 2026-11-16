import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
const editorFiles = ['index.html', 'style.css', 'model.js', 'shapes.js', 'editor.js', 'render.js', 'gestures.js', 'ui.js'];

test('the static landing explains drawing a familiar space without an existing plan', async () => {
  const html = await readFile(new URL('index.html', output), 'utf8');
  assert.match(html, /You know your space/);
  assert.match(html, /Put it on paper/);
  assert.match(html, /No existing floor plan needed/);
  assert.match(html, /first draft, not a construction document/);
  assert.match(html, /Export a JSON backup/);
  const stylesheet = html.match(/rel="stylesheet" href="([^"]+)"/)[1];
  const base = process.env.TEST_BASE ?? '/plane-drawer/';
  const css = await readFile(new URL(stylesheet.slice(base.length), output), 'utf8');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html, /<html lang="en"/);
});

test('every drawing CTA respects the deployment base and points to the real editor', async () => {
  const html = await readFile(new URL('index.html', output), 'utf8');
  const base = process.env.TEST_BASE ?? '/plane-drawer/';
  const links = [...html.matchAll(/href="([^"]+)"[^>]*data-editor-link/g)].map(match => match[1]);
  assert.ok(links.length >= 3);
  assert.ok(links.every(link => link === `${base}app/`));
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  for (const asset of assets.filter(link => link.startsWith(base))) {
    const pathname = new URL(asset, 'https://example.test').pathname;
    if (!pathname.endsWith('/')) await readFile(new URL(pathname.slice(base.length), output));
  }
  const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  // Outbound links the visitor chooses to follow (such as the credit) are not runtime requests.
  const outbound = new Set([...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map(match => match[1]));
  assert.deepEqual([...outbound].filter(link => /^https?:\/\//.test(link)), ['https://github.com/Gentleman-Programming/gentle-ai']);
  assert.ok(!assets.some(link => /^https?:\/\//.test(link) && link !== canonical && !outbound.has(link)), 'no external runtime assets');
});

test('the published editor is byte-identical to the double-click version and includes only runtime files', async () => {
  assert.deepEqual((await readdir(new URL('app/', output))).sort(), [...editorFiles].sort());
  for (const file of editorFiles) {
    assert.deepEqual(await readFile(new URL(`app/${file}`, output)), await readFile(new URL(file, import.meta.url)), file);
  }
});

test('the illustrative walkthrough has three keyboard-accessible stages and a live caption', async () => {
  const html = await readFile(new URL('index.html', output), 'utf8');
  assert.equal([...html.matchAll(/data-stage-button=/g)].length, 3);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Illustrative floor plan/);
});

test('activating each walkthrough step updates the picture, pressed state and caption', async () => {
  const { initializeLanding } = await import('./landing/src/scripts/landing.mjs');
  const animationCalls = [];
  const plan = { dataset: { stage: '2' }, getAnimations: () => [{ cancel: () => animationCalls.push('cancel'), play: () => animationCalls.push('play') }] };
  const caption = { textContent: '' };
  const replay = { addEventListener(event, handler) { this.activate = handler; } };
  const buttons = [0, 1, 2].map(stage => ({
    dataset: { stageButton: String(stage) },
    attributes: {},
    addEventListener(event, handler) { assert.equal(event, 'click'); this.activate = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
  }));
  const document = {
    querySelector: selector => ({ '#demo-plan': plan, '#stage-caption': caption, '#replay-sketch': replay })[selector] ?? null,
    querySelectorAll: selector => selector === '[data-stage-button]' ? buttons : [],
  };
  initializeLanding(document, { matchMedia: () => ({ matches: false }) });
  const captions = ['outline of the rooms', 'doors, windows and familiar fixtures', 'room names'];
  for (const stage of [0, 1, 2, 0]) {
    buttons[stage].activate();
    assert.equal(plan.dataset.stage, String(stage));
    assert.ok(caption.textContent.includes(captions[stage]));
    assert.ok(caption.textContent.includes('Illustrative sketch'));
    buttons.forEach((button, index) => assert.equal(button.attributes['aria-pressed'], String(index === stage)));
  }
  assert.equal(typeof replay.activate, 'function', 'the animated sketch has a replay control');
  replay.activate();
  assert.equal(plan.dataset.stage, '2');
  assert.deepEqual(animationCalls, ['cancel', 'play']);
  buttons.forEach((button, index) => assert.equal(button.attributes['aria-pressed'], String(index === 2)));
});

test('the supplied design system uses one approved local font and reduced-motion transform animations', async () => {
  const html = await readFile(new URL('index.html', output), 'utf8');
  const base = process.env.TEST_BASE ?? '/plane-drawer/';
  const stylesheet = html.match(/rel="stylesheet" href="([^"]+)"/)[1];
  const css = await readFile(new URL(stylesheet.slice(base.length), output), 'utf8');
  assert.match(css, /@font-face/);
  assert.match(css, /Manrope/);
  assert.doesNotMatch(css, /Barlow Condensed|Space Grotesk|Georgia/);
  assert.match(css, /@keyframes/);
  assert.doesNotMatch(css, /stroke-dashoffset/);
  assert.match(css, /cubic-bezier\(0?\.22,\s*1,\s*0?\.36,\s*1\)/);
  assert.match(css, /prefers-reduced-motion/);
  for (const style of ['heading-1', 'heading-2', 'heading-3', 'body-3', 'button-md', 'caption-5']) assert.ok(css.includes(`.${style}`));
  const fonts = [...css.matchAll(/url\(["']?([^\)"']+\.woff2)["']?\)/g)].map(match => match[1]);
  assert.equal(new Set(fonts).size, 1);
  for (const font of fonts) {
    const fontUrl = new URL(font, `https://example.test${stylesheet}`).pathname;
    assert.ok(fontUrl.startsWith(base));
    const bytes = await readFile(new URL(fontUrl.slice(base.length), output));
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
  }
  for (const license of ['manrope-OFL.txt']) {
    assert.match(await readFile(new URL(`fonts/${license}`, output), 'utf8'), /SIL OPEN FONT LICENSE/);
  }
});

test('the landing includes objection answers, a separate word reveal, real supporting pages and social artwork', async () => {
  const html = await readFile(new URL('index.html', output), 'utf8');
  const base = process.env.TEST_BASE ?? '/plane-drawer/';
  assert.equal([...html.matchAll(/data-faq(?:[\s>])/g)].length, 6);
  assert.match(html, /data-tagline/);
  assert.ok([...html.matchAll(/data-tagline-word/g)].length >= 8);
  for (const page of ['privacy', 'terms']) {
    assert.ok(html.includes(`href="${base}${page}/"`));
    const content = await readFile(new URL(`${page}/index.html`, output), 'utf8');
    assert.ok(content.includes(`href="${base}"`));
  }
  assert.match(await readFile(new URL('404.html', output), 'utf8'), /This room is not on the plan/);
  assert.match(html, /property="og:image" content="https:\/\/roby-dev.github.io\//);
  const png = await readFile(new URL('social.png', output));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

const classes = () => {
  const values = new Set();
  return { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) };
};

test('mobile navigation uses a modal, synchronizes expanded state and restores focus on close', async () => {
  const { initializeLanding } = await import('./landing/src/scripts/landing.mjs');
  const events = {};
  const links = [{}, {}].map(link => ({ ...link, addEventListener: (name, handler) => { link[name] = handler; }, source: link }));
  const menu = { open: false, showModal() { this.open = true; }, close() { this.open = false; events.close(); }, addEventListener: (name, handler) => { events[name] = handler; }, querySelectorAll: () => links };
  const toggle = { hidden: true, addEventListener: (name, handler) => { events.toggle = handler; }, setAttribute(name, value) { this[name] = value; }, focus() { this.focused = true; } };
  const document = { documentElement: { classList: classes() }, querySelector: selector => ({ '#mobile-menu': menu, '#menu-toggle': toggle })[selector] ?? null, querySelectorAll: () => [] };
  initializeLanding(document, { matchMedia: () => ({ matches: true }) });
  assert.equal(toggle.hidden, false);
  events.toggle();
  assert.equal(menu.open, true);
  assert.equal(toggle['aria-expanded'], 'true');
  assert.equal(document.documentElement.classList.contains('menu-open'), true);
  links[0].source.click();
  assert.equal(menu.open, false);
  assert.equal(toggle['aria-expanded'], 'false');
  assert.equal(document.documentElement.classList.contains('menu-open'), false);
  assert.equal(toggle.focused, true);
});

test('tagline words reveal in reading order through one scheduled frame and never dim on return', async () => {
  const { initializeLanding } = await import('./landing/src/scripts/landing.mjs');
  const words = Array.from({ length: 12 }, () => ({ classList: classes() }));
  let top = 1000;
  const tagline = { classList: classes(), querySelectorAll: () => words, getBoundingClientRect: () => ({ top, height: 100 }) };
  const listeners = {};
  const frames = [];
  const environment = { innerHeight: 800, matchMedia: () => ({ matches: false }), requestAnimationFrame: callback => frames.push(callback), addEventListener: (name, callback) => { listeners[name] = callback; }, removeEventListener: name => { delete listeners[name]; } };
  const document = { querySelector: selector => selector === '[data-tagline]' ? tagline : null, querySelectorAll: () => [] };
  initializeLanding(document, environment);
  frames.shift()();
  assert.equal(words.filter(word => word.classList.contains('word-active')).length, 0);
  top = 500;
  listeners.scroll(); listeners.scroll(); listeners.scroll();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.deepEqual(words.map(word => word.classList.contains('word-active')), words.map((_, index) => index < 3));
  top = 1000; listeners.scroll(); frames.shift()();
  assert.equal(words.filter(word => word.classList.contains('word-active')).length, 3);
  top = 0; listeners.scroll(); frames.shift()();
  assert.equal(words.filter(word => word.classList.contains('word-active')).length, 12);
  assert.equal(listeners.scroll, undefined);
});

test('reduced motion keeps tagline words visible and replays only an opacity change', async () => {
  const { initializeLanding } = await import('./landing/src/scripts/landing.mjs');
  let effect;
  let replay;
  const plan = { dataset: {}, animate: (frames, options) => { effect = { frames, options }; }, getAnimations: () => { throw Error('Movement must not replay'); } };
  const tagline = { classList: classes() };
  const caption = {};
  const document = { querySelector: selector => ({ '#demo-plan': plan, '#stage-caption': caption, '#replay-sketch': { addEventListener: (_name, handler) => { replay = handler; } }, '[data-tagline]': tagline })[selector] ?? null, querySelectorAll: () => [] };
  initializeLanding(document, { matchMedia: () => ({ matches: true }) });
  assert.equal(tagline.classList.contains('is-word-reveal'), false);
  replay();
  assert.equal(plan.dataset.stage, '2');
  assert.deepEqual(effect.frames, [{ opacity: .7 }, { opacity: 1 }]);
  assert.equal(effect.options.duration, 300);
});
