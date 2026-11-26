import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('API persists across restarts, rejects stale writes, and protects imports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daybook-test-'));
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  let child;
  const base = `http://127.0.0.1:${port}`;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), DAYBOOK_DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.stdout.on('data', data => { if (String(data).includes('Daybook is ready')) { clearTimeout(timeout); resolve(); } });
      child.once('exit', code => { clearTimeout(timeout); if (code) reject(new Error(`Server exited ${code}`)); });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  const get = async () => (await fetch(`${base}/api/state`)).json();
  const put = data => fetch(`${base}/api/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  try {
    await start();
    const original = await get();
    original.state.name = 'Persisted planner';
    Object.assign(original.state.settings, { bulletStyle: 'square', celebrationStyle: 'cat', startYesterday: true, accent: '#c9ae36', theme: 'system', days: 7 });
    const savedResponse = await put(original);
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.equal((await put(original)).status, 409);
    const malformed = structuredClone(saved);
    malformed.state.settings.days = 2;
    assert.equal((await put(malformed)).status, 400);
    assert.equal((await get()).state.name, 'Persisted planner');
    assert.equal((await fetch(`${base}/api/state`, { headers: { Origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(`${base}/.data/daybook.sqlite`)).status, 404);
    const font = await fetch(`${base}/fonts/font-2.ttf`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/ttf');
    const exported = await (await fetch(`${base}/api/export`)).json();
    assert.equal(exported.format, 'daybook');
    assert.deepEqual(exported.state, saved.state);
    saved.state.name = 'Restored planner';
    assert.equal((await put({ ...saved, importing: true })).status, 200);
    assert.ok((await readdir(join(directory, 'backups'))).some(name => name.startsWith('before-import-')));
    await stop();
    await start();
    assert.equal((await get()).state.name, 'Restored planner');
    assert.deepEqual((await get()).state.settings, original.state.settings);
    const beforeCapture = await get();
    const capture = payload => fetch(`${base}/api/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const captured = { id: 'capture-00000000-0000-4000-8000-000000000001', title: 'Captured outside the browser' };
    const responses = await Promise.all([capture(captured), capture(captured), capture({ ...captured, id: 'capture-00000000-0000-4000-8000-000000000002', title: 'Another capture' })]);
    assert.deepEqual(responses.map(r=>r.status).sort(), [200,201,201]);
    assert.equal((await get()).state.tasks.length, 2);
    assert.equal((await get()).state.tasks[0].listId, null);
    assert.equal((await get()).state.tasks[0].date, null);
    assert.equal((await put(beforeCapture)).status,409);
    assert.equal((await capture({...captured,title:''})).status,400);
    assert.equal((await fetch(`${base}/api/capture`, {method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify(captured)})).status,403);
    const legacy = await get();
    legacy.state.schemaVersion = 1;
    assert.equal((await put({...legacy,importing:true})).status,200);
    assert.equal((await get()).state.schemaVersion,2);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
