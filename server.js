import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dateKey, addDays, newState, maintain, validateState, validDate, upgradeState, captureTask } from './public/model.js';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DAYBOOK_DATA_DIR || join(root, '.data');
const port = Number(process.env.PORT || 4399);
mkdirSync(join(dataDir, 'backups'), { recursive: true });
const db = new DatabaseSync(join(dataDir, 'daybook.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS planner (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, data TEXT NOT NULL)');
db.prepare('INSERT OR IGNORE INTO planner VALUES (1, 0, ?)').run(JSON.stringify(newState()));
const load = () => {
  const row = db.prepare('SELECT revision, data FROM planner WHERE id = 1').get();
  return { revision: row.revision, state: JSON.parse(row.data) };
};

function backup(snapshot, prefix = dateKey()) {
  const path = join(dataDir, 'backups', `${prefix}.json`);
  if (!existsSync(path)) writeFileSync(path, JSON.stringify({ format: 'daybook', exportedAt: new Date().toISOString(), ...snapshot }, null, 2), { mode: 0o600 });
  const daily = readdirSync(join(dataDir, 'backups')).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  for (const name of daily.slice(0, -30)) unlinkSync(join(dataDir, 'backups', name));
}

function write(state, revision) {
  db.prepare('UPDATE planner SET data = ?, revision = ? WHERE id = 1').run(JSON.stringify(state), revision);
  return { state, revision };
}

function readCurrent(through) {
  const current = load();
  backup(current);
  if (current.state.schemaVersion === 1) backup(current, `before-schema-v2-${Date.now()}`);
  const upgraded = upgradeState(current.state);
  if (maintain(current.state, dateKey(), through) || upgraded) return write(current.state, current.revision + 1);
  return current;
}

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 25 * 1024 * 1024) throw new Error('Backup exceeds the 25 MB limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.ttf': 'font/ttf', '.otf': 'font/otf', '.svg': 'image/svg+xml' };
let companion = { seenAt: 0, shortcut: '⌃⌥Space', available: false };
const server = http.createServer(async (request, response) => {
  try {
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowedHosts.has(request.headers.host)) return json(response, 403, { error: 'Use the local Daybook address.' });
    const origin = request.headers.origin;
    if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) return json(response, 403, { error: 'Cross-origin requests are disabled.' });
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const requested = url.searchParams.get('through');
    const through = validDate(requested) && requested > addDays(dateKey(), 35) ? requested : addDays(dateKey(), 35);
    if (url.pathname === '/api/health' && request.method === 'GET') return json(response, 200, { app: 'daybook', schemaVersion: 2 });
    if (url.pathname === '/api/companion' && request.method === 'GET') return json(response, 200, { active: Date.now() - companion.seenAt < 25000, shortcut: companion.shortcut, available: companion.available });
    if (url.pathname === '/api/companion' && request.method === 'POST') {
      if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { error: 'Expected JSON.' });
      const incoming = await body(request);
      companion = { seenAt: Date.now(), shortcut: '⌃⌥Space', available: incoming.available === true };
      return json(response, 200, { ok: true });
    }
    if (url.pathname === '/api/capture' && request.method === 'POST') {
      if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { error: 'Expected JSON.' });
      const incoming = await body(request);
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = load();
        backup(current);
        const upgraded = upgradeState(current.state);
        const maintained = maintain(current.state, dateKey(), through);
        const created = captureTask(current.state, incoming);
        validateState(current.state);
        const saved = created || upgraded || maintained ? write(current.state, current.revision + 1) : current;
        db.exec('COMMIT');
        return json(response, created ? 201 : 200, { ...saved, taskId: incoming.id, created });
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    if (url.pathname === '/api/state' && request.method === 'GET') return json(response, 200, readCurrent(through));
    if (url.pathname === '/api/export' && request.method === 'GET') {
      response.setHeader('Content-Disposition', `attachment; filename="daybook-${dateKey()}.json"`);
      return json(response, 200, { format: 'daybook', exportedAt: new Date().toISOString(), ...readCurrent(through) });
    }
    if (url.pathname === '/api/state' && request.method === 'PUT') {
      if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { error: 'Expected JSON.' });
      const incoming = await body(request);
      validateState(incoming.state);
      upgradeState(incoming.state);
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = load();
        if (incoming.revision !== current.revision) {
          db.exec('ROLLBACK');
          return json(response, 409, { error: 'Your planner changed in another window. Your latest saved version has been loaded. Try your change again.', ...current });
        }
        backup(current);
        if (incoming.importing) backup(current, `before-import-${Date.now()}`);
        maintain(incoming.state, dateKey(), through);
        const saved = write(incoming.state, current.revision + 1);
        db.exec('COMMIT');
        return json(response, 200, saved);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    if (url.pathname.startsWith('/api/')) return json(response, 404, { error: 'Unknown action.' });
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'Method not allowed.' });
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (relative.split('/').some(part => part.startsWith('.') || part.includes('\\'))) return json(response, 404, { error: 'Not found.' });
    const content = readFileSync(join(root, 'public', relative));
    response.writeHead(200, {
      'Content-Type': mime[extname(relative)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT') return json(response, 404, { error: 'Not found.' });
    console.error(error.message);
    json(response, 400, { error: error.message || 'Unable to save. Try again.' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Daybook is ready at http://127.0.0.1:${port}\nData saved in ${dataDir}\nPress Control+C to stop.`));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Daybook may already be running.` : error.message); process.exit(1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
