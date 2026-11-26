import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { validateState } from '../public/model.js';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('Usage: node scripts/verify-migration.mjs BEFORE.json CLOUD-EXPORT.json');
const before=JSON.parse(await readFile(beforePath,'utf8')).state;
const after=JSON.parse(await readFile(afterPath,'utf8')).state;
validateState(before);validateState(after);
for (const key of ['groups','lists','rules']) assert.deepEqual(after[key],before[key],`${key} changed during migration`);
assert.equal(after.name,before.name);
for (const [key,value] of Object.entries(before.settings)) assert.deepEqual(after.settings[key],value,`Setting ${key} changed`);
const byId=new Map(after.tasks.map(task=>[task.id,task]));
for (const task of before.tasks) {
  const migrated=byId.get(task.id);assert.ok(migrated,`Missing task ${task.id}`);
  for (const [key,value] of Object.entries(task)) {
    // Automatic rollover may update an unfinished task's scheduled day.
    if (key==='date'&&!task.completed&&before.settings.autoRollover&&value&&value<after.lastRollover) { assert.equal(migrated.date,after.lastRollover);continue; }
    assert.deepEqual(migrated[key],value,`Task ${task.id} lost ${key}`);
  }
}
console.log(`Verified ${before.tasks.length} original tasks, ${before.lists.length} lists, ${before.groups.length} groups, ${before.rules.length} schedules, and all existing preferences.`);
