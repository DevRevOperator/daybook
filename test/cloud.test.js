import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { CloudStore } from '../public/cloud-store.js';
import { newState, dateInTimeZone } from '../public/model.js';

test('cloud database isolates accounts and protects revisioned saves, captures, and backups', async t => {
  const db = new PGlite();
  const alice = '00000000-0000-4000-8000-000000000001';
  const bob = '00000000-0000-4000-8000-000000000002';
  const stranger = '00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      insert into auth.users values ('${alice}','alice@example.test',now()),('${bob}','bob@example.test',now()),('${stranger}','stranger@example.test',now());`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611260001_daybook.sql', import.meta.url), 'utf8'));
    await db.exec("insert into daybook_private.allowed_emails values ('alice@example.test'),('bob@example.test');");
    const login = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']); await db.exec(`set role ${id ? 'authenticated' : 'anon'}`); };
    const rpc = async (name, args = {}) => {
      const entries = Object.entries(args);
      const { rows } = await db.query(`select public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(',')}) as result`, entries.map(([,v]) => typeof v === 'object' ? JSON.stringify(v) : v));
      return rows[0].result;
    };
    const client = { rpc: async (name,args) => { try { return {data:await rpc(name,args),error:null}; } catch(error) {return {data:null,error};} } };
    const store = new CloudStore(client, { timeZone:'Asia/Kolkata', now:() => new Date('2026-11-26T19:00:00Z') });
    let first;

    await t.test('anonymous and unapproved accounts cannot call the planner API', async () => {
      await login(null); await assert.rejects(rpc('daybook_load'), /permission denied/);
      await login(stranger); await assert.rejects(rpc('daybook_load'), /does not have access/);
    });
    await t.test('initialization uses the planner timezone and survives stale writes', async () => {
      await login(alice);first=await store.load();
      assert.equal(first.state.lastRollover,'2026-11-27');
      assert.equal(first.state.settings.timeZone,'Asia/Kolkata');
      const changed=structuredClone(first.state);changed.name='Alice planner';
      const saved=await rpc('daybook_save',{expected_revision:first.revision,next_state:changed});
      const stale=await rpc('daybook_save',{expected_revision:first.revision,next_state:first.state});
      assert.equal(stale.conflict,true);assert.equal(stale.state.name,'Alice planner');
      assert.equal(stale.revision,saved.revision);
      await assert.rejects(db.query('update public.daybook_planners set revision = 0'),/permission denied/);
    });
    await t.test('capture retries add exactly one task and preserve a concurrent edit', async () => {
      const capture={capture_id:'capture-00000000-0000-4000-8000-000000000010',capture_title:'Inbox task',capture_notes:'A note'};
      const added=await rpc('daybook_capture',capture);const retry=await rpc('daybook_capture',capture);
      assert.equal(added.created,true);assert.equal(retry.created,false);assert.equal(retry.state.tasks.length,1);
      assert.equal(retry.state.name,'Alice planner');assert.equal(retry.state.tasks[0].date,null);
      await assert.rejects(rpc('daybook_capture',{...capture,capture_title:'Changed retry'}),/different text/);
      await assert.rejects(rpc('daybook_capture',{...capture,capture_id:'invalid'}),/1–1,000/);
    });
    await t.test('backups are created before imports and are isolated by owner', async () => {
      const current=await rpc('daybook_load');const replacement=newState('2026-11-27');
      await rpc('daybook_save',{expected_revision:current.revision,next_state:replacement,reason:'before-import'});
      const list=await rpc('daybook_list_backups');assert.ok(list.some(b=>b.reason==='before-import'));
      const before=list.find(b=>b.reason==='before-import');
      const backup=await rpc('daybook_get_backup',{backup_id:before.id});assert.equal(backup.state.tasks[0].title,'Inbox task');
      await login(bob);assert.equal((await rpc('daybook_load')).state,null);
      assert.equal((await db.query('select * from public.daybook_planners')).rows.length,0);
      assert.equal((await db.query('select * from public.daybook_backups')).rows.length,0);
      await assert.rejects(rpc('daybook_get_backup',{backup_id:before.id}),/Backup not found/);
      const b=await store.load();assert.equal(b.state.tasks.length,0);
      await login(alice);assert.equal((await rpc('daybook_load')).state.tasks.length,0);
    });
    await t.test('cloud transport validates state and keeps dates linked to lists', async () => {
      const current=await store.load();const next=structuredClone(current.state);next.lastRollover='2026-11-26';
      next.tasks.push({id:'linked-task',title:'Linked',notes:'Keep this note',date:'2026-11-26',listId:'projects',completed:false,completedAt:null,color:'',order:0,ruleId:null,occurrenceDate:null,createdAt:'2026-11-26T10:00:00Z'});
      const saved=await store.handle('/api/state',{method:'PUT',body:JSON.stringify({revision:current.revision,state:next})});
      assert.equal(saved.status,200);assert.equal(saved.body.state.tasks[0].date,'2026-11-27');assert.equal(saved.body.state.tasks[0].listId,'projects');
      const stale=await store.handle('/api/state',{method:'PUT',body:JSON.stringify({revision:current.revision,state:next})});assert.equal(stale.status,409);
      next.settings.timeZone='invalid';const bad=await store.handle('/api/state',{method:'PUT',body:JSON.stringify({revision:saved.body.revision,state:next})});assert.equal(bad.status,400);
      const exported=await store.handle('/api/export');assert.equal(exported.body.format,'daybook');assert.equal(exported.body.state.tasks[0].notes,'Keep this note');
    });
  } finally { await db.close(); }
});

test('timezone dates do not inherit the cloud server timezone', () => {
  const now=new Date('2026-11-26T20:00:00Z');
  assert.equal(dateInTimeZone(now,'Asia/Kolkata'),'2026-11-27');
  assert.equal(dateInTimeZone(now,'America/Los_Angeles'),'2026-11-26');
});
