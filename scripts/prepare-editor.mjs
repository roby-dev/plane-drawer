import { copyFile, mkdir } from 'node:fs/promises';

// Keep the standalone editor as the source of truth. Only runtime assets are published.
const root = new URL('../', import.meta.url);
const destination = new URL('landing/public/app/', root);
const files = ['index.html', 'style.css', 'model.js', 'shapes.js', 'editor.js', 'render.js', 'gestures.js', 'ui.js'];
await mkdir(destination, { recursive: true });
await Promise.all(files.map(file => copyFile(new URL(file, root), new URL(file, destination))));
