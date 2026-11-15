import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const astro = fileURLToPath(new URL('./node_modules/astro/bin/astro.mjs', import.meta.url));

for (const command of ['dev', 'preview']) {
  test(`${command} serves the landing, editor directory and runtime assets under the Pages base`, { timeout: 30000 }, async () => {
    const args = [astro, command, '--root', 'landing', '--host', '127.0.0.1', '--port', '0'];
    if (command === 'dev') args.push('--ignore-lock');
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    let logs = '';
    try {
      const local = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Server did not become ready: ${logs}`)), 15000);
        const collect = chunk => {
          logs += chunk.toString();
          const match = logs.match(/http:\/\/127\.0\.0\.1:\d+\/plane-drawer\/?/);
          if (match) { clearTimeout(timer); resolve(`${match[0].replace(/\/$/, '')}/`); }
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
      });
      const landing = await fetch(local);
      assert.equal(landing.status, 200);
      assert.match(await landing.text(), /Put it on paper/);
      for (const page of ['privacy/', 'terms/']) {
        const response = await fetch(new URL(page, local));
        assert.equal(response.status, 200, page);
        assert.ok((await response.text()).includes('PlaneDrawer'));
      }
      const missing = await fetch(new URL('this-room-is-missing/', local));
      assert.equal(missing.status, 404);
      assert.match(await missing.text(), /This room is not on the plan/);
      for (const path of ['app/', 'app/?from=landing', 'app/index.html']) {
        const response = await fetch(new URL(path, local));
        assert.equal(response.status, 200, path);
        assert.equal(await response.text(), await readFile(new URL('./index.html', import.meta.url), 'utf8'));
      }
      for (const path of ['style.css', 'model.js', 'shapes.js', 'editor.js', 'render.js', 'gestures.js', 'ui.js']) {
        const response = await fetch(new URL(`app/${path}`, local));
        assert.equal(response.status, 200, path);
        assert.equal(await response.text(), await readFile(new URL(path, import.meta.url), 'utf8'));
      }
    } finally {
      child.kill();
      await exited;
    }
  });
}
