const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assets = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/model.js': ['model.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'] };
const server = http.createServer((req, res) => {
  const asset = assets[new URL(req.url, 'http://localhost').pathname];
  if (!asset) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, asset[0]), (error, content) => {
    if (error) { res.writeHead(500); res.end('Unable to read application file'); return; }
    res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(content);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 4173 is already in use. Close the other server and try again.' : error.message); process.exitCode = 1; });
server.listen(4173, '127.0.0.1', () => console.log('PlaneDrawer: http://127.0.0.1:4173 — keep this terminal open. Ctrl+C to stop.'));

