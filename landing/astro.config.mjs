import { defineConfig } from 'astro/config';

// Vite serves explicit public files, but does not resolve public/app/ to index.html.
// Keep the same editor URL in dev, preview and static directory-index hosts.
function editorDirectoryIndex() {
  let base;
  const configure = server => {
    server.middlewares.use((request, _response, next) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === `${base}app/`) request.url = `${base}app/index.html${url.search}`;
      next();
    });
  };
  return {
    name: 'editor-directory-index',
    configResolved(config) { base = config.base.replace(/\/?$/, '/'); },
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

export default defineConfig({
  site: 'https://roby-dev.github.io',
  base: '/plane-drawer',
  output: 'static',
  outDir: '../dist',
  vite: { plugins: [editorDirectoryIndex()] },
});
