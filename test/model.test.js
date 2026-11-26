import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, maintain, occursOn, addDays, validateState, moveTask, moveList, reorderItem, taskOrder, upgradeState, captureTask, isInboxTask, tasksInList, unlinkLists } from '../public/model.js';

function rule(overrides = {}) {
  return { id: 'routine', title: 'A routine', notes: '', frequency: 'daily', interval: 1, start: '2026-11-20', end: '', weekdays: [5], excludedDates: [], paused: false, generatedThrough: null, ...overrides };
}

test('calendar arithmetic preserves dates through daylight saving changes', () => {
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('month-end and leap-day schedules clamp without drifting', () => {
  const monthly = rule({ frequency: 'monthly', start: '2026-01-31' });
  assert.equal(occursOn(monthly, '2026-02-28'), true);
  assert.equal(occursOn(monthly, '2026-03-31'), true);
  assert.equal(occursOn(monthly, '2026-03-28'), false);
  const yearly = rule({ frequency: 'yearly', start: '2024-02-29' });
  assert.equal(occursOn(yearly, '2025-02-28'), true);
  assert.equal(occursOn(yearly, '2028-02-29'), true);
});

test('weekly intervals support several weekdays and boundaries', () => {
  const weekly = rule({ frequency: 'weekly', interval: 2, start: '2026-11-18', weekdays: [1, 3, 5], end: '2026-12-01' });
  assert.equal(occursOn(weekly, '2026-11-20'), true);
  assert.equal(occursOn(weekly, '2026-11-23'), false);
  assert.equal(occursOn(weekly, '2026-11-30'), true);
  assert.equal(occursOn(weekly, '2026-12-02'), false);
});

test('materialization is idempotent and respects deleted occurrences', () => {
  const state = newState('2026-11-20');
  state.rules.push(rule({ excludedDates: ['2026-11-21'] }));
  maintain(state, '2026-11-20', '2026-11-23');
  assert.equal(state.tasks.length, 3);
  assert.equal(maintain(state, '2026-11-20', '2026-11-23'), false);
  assert.equal(state.tasks.some(task => task.occurrenceDate === '2026-11-21'), false);
  maintain(state, '2026-11-20', '2026-11-25');
  assert.equal(state.tasks.length, 5);
  validateState(state);
});

test('rollover preserves completed tasks and coalesces missed recurring work', () => {
  const state = newState('2026-11-20');
  state.rules.push(rule());
  maintain(state, '2026-11-20', '2026-11-23');
  state.tasks[0].completed = true;
  state.tasks.push({ ...state.tasks[1], id: 'ordinary', ruleId: null, title: 'Finish report', date: '2026-11-21' });
  maintain(state, '2026-11-23', '2026-11-23');
  assert.equal(state.tasks[0].date, '2026-11-20');
  assert.equal(state.tasks.find(task => task.id === 'ordinary').date, '2026-11-23');
  assert.equal(state.tasks.filter(task => task.ruleId && !task.completed && !task.skipped).length, 1);
  assert.equal(maintain(state, '2026-11-23', '2026-11-23'), false);
});

test('rollover can be disabled and manually assigned past dates survive the day', () => {
  const state = newState('2026-11-20');
  state.settings.autoRollover = false;
  state.rules.push(rule());
  maintain(state, '2026-11-22', '2026-11-22');
  assert.equal(state.tasks[0].date, '2026-11-20');
  state.settings.autoRollover = true;
  maintain(state, '2026-11-22', '2026-11-22');
  assert.equal(state.tasks[0].date, '2026-11-20');
});

test('backups reject invalid destinations, duplicate IDs, and invalid dates', () => {
  const state = newState('2026-11-20');
  state.rules.push(rule());
  maintain(state, '2026-11-20', '2026-11-20');
  const duplicate = structuredClone(state);
  duplicate.tasks.push(duplicate.tasks[0]);
  assert.throws(() => validateState(duplicate), /Duplicate/);
  const destination = structuredClone(state);
  destination.tasks[0].date = null;
  destination.tasks[0].listId = 'missing';
  assert.throws(() => validateState(destination), /belong/);
  state.rules[0].start = '2026-02-30';
  assert.throws(() => validateState(state), /dates/);
});

test('list and group reordering can insert after the last item in either direction', () => {
  const items = [{ id: 'first' }, { id: 'middle' }, { id: 'last' }];
  reorderItem(items, 'first', 'last', true);
  assert.deepEqual(items.map(item => item.id), ['middle', 'last', 'first']);
  reorderItem(items, 'first', 'middle');
  assert.deepEqual(items.map(item => item.id), ['first', 'middle', 'last']);
});

test('moving a list into another or empty group preserves its tasks and notes', () => {
  const state = newState('2026-11-20');
  state.groups.push({ id: 'empty', name: 'Empty' });
  state.rules.push(rule());
  maintain(state, '2026-11-20', '2026-11-20');
  const task = state.tasks[0];
  task.notes = 'Keep these notes';
  moveTask(state, task.id, 'list:projects');
  moveList(state, 'projects', 'personal', 'personal-list', true);
  assert.deepEqual(state.lists.filter(list => list.groupId === 'personal').map(list => list.id), ['personal-list', 'projects']);
  moveList(state, 'projects', 'empty');
  assert.equal(task.listId, 'projects');
  assert.equal(task.notes, 'Keep these notes');
  assert.equal(task.ruleId, 'routine');
  assert.equal(state.lists.find(list => list.id === 'projects').groupId, 'empty');
  validateState(state);
});

test('tasks can move after a sibling or into an empty list without losing completion', () => {
  const state = newState('2026-11-20');
  state.rules.push(rule());
  maintain(state, '2026-11-20', '2026-11-22');
  state.tasks.forEach(task => { task.date = '2026-11-20'; });
  const [first, second, third] = state.tasks;
  first.completed = true;
  moveTask(state, first.id, 'date:2026-11-20', third.id, true);
  assert.deepEqual([...state.tasks].sort((a, b) => taskOrder(a, 'date:2026-11-20') - taskOrder(b, 'date:2026-11-20')).map(task => task.id), [second.id, third.id, first.id]);
  moveTask(state, first.id, 'list:someday');
  assert.equal(first.completed, true);
  assert.equal(first.date, '2026-11-20');
  assert.equal(first.listId, 'someday');
  validateState(state);
});

test('older backups accept the optional celebration preference', () => {
  const state = newState('2026-11-20');
  delete state.settings.celebrations;
  assert.doesNotThrow(() => validateState(state));
  state.settings.celebrations = false;
  assert.doesNotThrow(() => validateState(state));
  state.settings.celebrations = 'false';
  assert.throws(() => validateState(state), /celebration/);
});

test('preference additions preserve old backups and reject unsupported styles', () => {
  const state = newState('2026-11-20');
  delete state.settings.bulletStyle;
  delete state.settings.celebrationStyle;
  assert.doesNotThrow(() => validateState(state));
  state.settings.bulletStyle = 'square';
  state.settings.celebrationStyle = 'dog';
  assert.doesNotThrow(() => validateState(state));
  state.settings.bulletStyle = '<script>';
  assert.throws(() => validateState(state), /bullet style/);
  state.settings.bulletStyle = 'plain';
  state.settings.celebrationStyle = 'unrecognized';
  assert.throws(() => validateState(state), /celebration style/);
});

test('legacy planners upgrade without losing task locations, ordering, or notes', () => {
  const state = newState('2026-11-20');
  state.schemaVersion = 1;
  state.rules.push(rule());
  maintain(state, '2026-11-20', '2026-11-20');
  state.tasks[0].notes = 'Keep this';
  state.tasks[0].order = 17;
  assert.equal(upgradeState(state), true);
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.tasks[0].dayOrder, 17);
  assert.equal(state.tasks[0].listOrder, 17);
  assert.equal(state.tasks[0].notes, 'Keep this');
  assert.equal(state.tasks[0].date, '2026-11-20');
  assert.equal(upgradeState(state), false);
  validateState(state);
});

test('one task stays linked when scheduled, rescheduled, filed and completed', () => {
  const state = newState('2026-11-20');
  captureTask(state, { id: 'capture-00000000-0000-4000-8000-000000000001', title: 'Write proposal' });
  const task = state.tasks[0];
  task.notes = 'Customer context';
  assert.equal(isInboxTask(task), true);
  moveTask(state, task.id, 'list:projects');
  moveTask(state, task.id, 'date:2026-11-21');
  assert.equal(task.listId, 'projects');
  assert.equal(tasksInList(state, 'projects')[0], task);
  moveTask(state, task.id, 'date:2026-11-22');
  moveTask(state, task.id, 'list:follow-ups');
  assert.equal(task.date, '2026-11-22');
  task.completed = true;
  assert.equal(tasksInList(state, 'follow-ups')[0].completed, true);
  assert.equal(state.tasks.length, 1);
  assert.equal(task.notes, 'Customer context');
  task.date = null;
  assert.equal(isInboxTask(task), false);
  moveTask(state, task.id, 'inbox');
  assert.equal(isInboxTask(task), true);
  validateState(state);
});

test('day order and list order stay independent across linked tasks from different lists', () => {
  const state = newState('2026-11-20');
  for (let i = 1; i <= 3; i++) {
    captureTask(state, { id: `capture-00000000-0000-4000-8000-00000000000${i}`, title: `Task ${i}` });
    const task = state.tasks.at(-1);
    moveTask(state, task.id, 'list:projects');
    moveTask(state, task.id, 'date:2026-11-20');
  }
  const [a,b,c] = state.tasks;
  const ordered = location => [...state.tasks].sort((a,b) => taskOrder(a,location)-taskOrder(b,location)).map(t=>t.id);
  moveTask(state, a.id, 'date:2026-11-20', c.id, true);
  assert.deepEqual(ordered('date:2026-11-20'), [b.id,c.id,a.id]);
  assert.deepEqual(ordered('list:projects'), [a.id,b.id,c.id]);
  moveTask(state, c.id, 'list:projects', a.id);
  assert.deepEqual(ordered('list:projects'), [c.id,a.id,b.id]);
  assert.deepEqual(ordered('date:2026-11-20'), [b.id,c.id,a.id]);
});

test('capture retries are idempotent and removing lists keeps tasks and schedules', () => {
  const state = newState('2026-11-20');
  const input = { id: 'capture-00000000-0000-4000-8000-000000000001', title: '  A thought  ' };
  assert.equal(captureTask(state,input),true);
  assert.equal(captureTask(state,input),false);
  assert.throws(() => captureTask(state,{...input,title:'A changed thought'}), /already/);
  assert.equal(state.tasks[0].title,'A thought');
  moveTask(state,state.tasks[0].id,'list:projects');
  state.rules.push(rule({listId:'projects'}));
  maintain(state,'2026-11-20','2026-11-25');
  assert.equal(tasksInList(state,'projects').length,2); // One ordinary task, next open recurrence.
  assert.equal(state.tasks[1].listId,'projects');
  unlinkLists(state,['projects']);
  assert.equal(state.tasks[0].listId,null);
  assert.equal(isInboxTask(state.tasks[0]),true);
  assert.equal(state.rules[0].listId,null);
  assert.equal(state.tasks[1].date,'2026-11-20');
  validateState(state);
  assert.throws(()=>captureTask(state,{...input,id:'bad'}), /identifier/);
  assert.throws(()=>captureTask(state,{...input,title:' '}), /Enter a task/);
});
