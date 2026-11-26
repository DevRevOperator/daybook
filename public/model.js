export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function parseDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(key, count) {
  const date = parseDate(key);
  date.setDate(date.getDate() + count);
  return dateKey(date);
}

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '2000-01-01' && value <= '2100-12-31' && dateKey(parseDate(value)) === value;
}

function daysBetween(start, end) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
}

export function occursOn(rule, day) {
  if (rule.paused || day < rule.start || (rule.end && day > rule.end) || rule.excludedDates.includes(day)) return false;
  const current = parseDate(day);
  const start = parseDate(rule.start);
  const elapsed = daysBetween(rule.start, day);
  const interval = rule.interval;
  if (rule.frequency === 'daily') return elapsed % interval === 0;
  if (rule.frequency === 'weekdays') return current.getDay() > 0 && current.getDay() < 6;
  if (rule.frequency === 'weekly') {
    const mondayOffset = (start.getDay() + 6) % 7;
    return Math.floor((elapsed + mondayOffset) / 7) % interval === 0 && rule.weekdays.includes(current.getDay());
  }
  const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const dayMatches = current.getDate() === Math.min(start.getDate(), lastDay);
  if (rule.frequency === 'monthly') {
    const months = (current.getFullYear() - start.getFullYear()) * 12 + current.getMonth() - start.getMonth();
    return months % interval === 0 && dayMatches;
  }
  return (current.getFullYear() - start.getFullYear()) % interval === 0 && current.getMonth() === start.getMonth() && dayMatches;
}

export function newState(today = dateKey()) {
  return {
    schemaVersion: 2,
    name: 'Daybook',
    groups: [{ id: 'work', name: 'Work' }, { id: 'personal', name: 'Personal' }],
    lists: [
      { id: 'projects', groupId: 'work', name: 'Projects' },
      { id: 'follow-ups', groupId: 'work', name: 'Follow-ups' },
      { id: 'someday', groupId: 'work', name: 'Someday' },
      { id: 'personal-list', groupId: 'personal', name: 'Life & errands' }
    ],
    tasks: [],
    rules: [],
    settings: { days: 5, autoRollover: true, showCompleted: true, lines: true, celebrations: true, celebrationStyle: 'confetti', bulletStyle: 'plain', theme: 'light', accent: '#3158c9', size: 'medium', spacing: 'comfortable', startYesterday: false },
    lastRollover: today
  };
}

// Version 2 keeps scheduling and list membership independent. Preserve both
// ordering axes so dragging in one view never rearranges the other view.
export function upgradeState(state) {
  if (state.schemaVersion !== 1) return false;
  state.schemaVersion = 2;
  for (const task of state.tasks) {
    task.dayOrder = task.order;
    task.listOrder = task.order;
  }
  return true;
}

export const isInboxTask = task => !task.date && !task.listId && !task.skipped;
export const taskOrder = (task, location) => task[location.startsWith('date:') ? 'dayOrder' : 'listOrder'] ?? task.order;

export function tasksInList(state, listId) {
  const tasks = state.tasks.filter(task => task.listId === listId && !task.skipped);
  const nextOccurrences = new Map();
  for (const task of tasks.filter(task => task.ruleId && !task.completed).sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
    if (!nextOccurrences.has(task.ruleId)) nextOccurrences.set(task.ruleId, task.id);
  }
  return tasks.filter(task => !task.ruleId || task.completed || nextOccurrences.get(task.ruleId) === task.id);
}

export function unlinkLists(state, listIds) {
  const ids = new Set(listIds);
  state.tasks.filter(task => ids.has(task.listId)).forEach(task => { task.listId = null; });
  state.rules.filter(rule => ids.has(rule.listId)).forEach(rule => { rule.listId = null; });
  state.lists = state.lists.filter(list => !ids.has(list.id));
}

export function captureTask(state, { id, title, notes = '' }) {
  if (typeof id !== 'string' || !/^capture-[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid capture identifier.');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 1000 || typeof notes !== 'string' || notes.length > 50000) throw new Error('Enter a task of 1–1,000 characters.');
  // A retry after a lost response must never create a duplicate.
  const existing = state.tasks.find(task => task.id === id);
  if (existing) {
    if (existing.title !== title.trim() || existing.notes !== notes) throw new Error('This capture is already in Inbox or your planner. Open it there to edit it.');
    return false;
  }
  const order = Date.now();
  state.tasks.push({ id, title: title.trim(), notes, date: null, listId: null, completed: false, completedAt: null, color: '', order, dayOrder: order, listOrder: order, ruleId: null, occurrenceDate: null, createdAt: new Date().toISOString() });
  return true;
}

// Materialize only the requested horizon. Stable occurrence IDs make reopening,
// changing views, and retries safe. A deleted occurrence stays in excludedDates.
export function maintain(state, today, through = addDays(today, 35)) {
  const before = JSON.stringify(state);
  const known = new Set(state.tasks.map(task => task.id));
  for (const rule of state.rules) {
    if (rule.paused) continue;
    const end = rule.end && rule.end < through ? rule.end : through;
    let cursor = rule.generatedThrough ? addDays(rule.generatedThrough, 1) : rule.start;
    for (; cursor <= end; cursor = addDays(cursor, 1)) {
      const id = `${rule.id}@${cursor}`;
      if (!known.has(id) && occursOn(rule, cursor)) {
        state.tasks.push({ id, title: rule.title, notes: rule.notes, date: cursor, listId: rule.listId || null, completed: false, completedAt: null, color: '', order: state.tasks.length, ruleId: rule.id, occurrenceDate: cursor, createdAt: new Date().toISOString() });
        known.add(id);
      }
    }
    if (!rule.generatedThrough || end > rule.generatedThrough) rule.generatedThrough = end;
  }
  if (state.lastRollover < today && state.settings.autoRollover) {
    const latest = new Map();
    for (const task of state.tasks) {
      if (!task.completed && !task.skipped && task.ruleId && task.date && task.date <= today) {
        const previous = latest.get(task.ruleId);
        if (!previous || previous.occurrenceDate < task.occurrenceDate) latest.set(task.ruleId, task);
      }
    }
    for (const task of state.tasks) {
      if (task.completed || task.skipped || !task.date || task.date >= today) continue;
      if (task.ruleId && latest.get(task.ruleId)?.id !== task.id) {
        task.skipped = true;
      } else {
        task.rolledFrom ||= task.date;
        task.date = today;
      }
    }
  }
  state.lastRollover = today;
  return before !== JSON.stringify(state);
}

export function validateState(state) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const text = (value, max = 500) => typeof value === 'string' && value.length <= max;
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9@_-]{1,100}$/.test(value);
  const unique = items => new Set(items.map(item => item.id)).size === items.length;
  check(state && [1, 2].includes(state.schemaVersion), 'This backup uses an unsupported format.');
  check(text(state.name, 60) && state.name.trim(), 'Give your planner a name.');
  check(['groups', 'lists', 'tasks', 'rules'].every(key => Array.isArray(state[key])), 'The backup is missing planner data.');
  check(state.groups.length > 0 && state.groups.length <= 500 && state.lists.length <= 5000 && state.tasks.length <= 100000 && state.rules.length <= 1000, 'The planner exceeds supported limits.');
  check(['groups', 'lists', 'tasks', 'rules'].every(key => unique(state[key])), 'Duplicate identifiers found.');
  check(validDate(state.lastRollover), 'Invalid rollover date.');
  const groups = new Set(state.groups.map(group => group.id));
  const lists = new Set(state.lists.map(list => list.id));
  for (const group of state.groups) check(id(group.id) && text(group.name, 80) && group.name.trim(), 'Invalid group.');
  for (const list of state.lists) check(id(list.id) && groups.has(list.groupId) && text(list.name, 80) && list.name.trim(), 'Invalid list.');
  for (const task of state.tasks) {
    check(id(task.id) && text(task.title, 1000) && task.title.trim() && text(task.notes, 50000), 'Invalid task text.');
    check((task.date === null || validDate(task.date)) && (task.listId === null || lists.has(task.listId)), 'A task must belong to a valid date or list, or the Inbox.');
    check(['dayOrder', 'listOrder'].every(key => task[key] === undefined || Number.isFinite(task[key])), 'Invalid task order.');
    check(typeof task.completed === 'boolean' && Number.isFinite(task.order), 'Invalid task state.');
    check(['', 'yellow', 'pink', 'blue', 'green'].includes(task.color), 'Invalid task color.');
    check(!task.ruleId || (id(task.ruleId) && validDate(task.occurrenceDate)), 'Invalid recurring occurrence.');
  }
  for (const rule of state.rules) {
    check(rule.listId == null || lists.has(rule.listId), 'A recurring task must belong to an existing list.');
    check(id(rule.id) && text(rule.title, 1000) && rule.title.trim() && text(rule.notes, 50000), 'Invalid recurring task.');
    check(['daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(rule.frequency), 'Invalid repeat frequency.');
    check(Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= 365, 'Repeat interval must be between 1 and 365.');
    check(validDate(rule.start) && (!rule.end || (validDate(rule.end) && rule.end >= rule.start)), 'Invalid repeat dates.');
    check(!rule.generatedThrough || validDate(rule.generatedThrough), 'Invalid generated date.');
    check(Array.isArray(rule.weekdays) && rule.weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6) && (rule.frequency !== 'weekly' || rule.weekdays.length > 0), 'Choose at least one weekday.');
    check(Array.isArray(rule.excludedDates) && rule.excludedDates.every(validDate) && typeof rule.paused === 'boolean', 'Invalid recurring exceptions.');
  }
  const s = state.settings;
  if (s?.timeZone !== undefined) {
    check(typeof s.timeZone === 'string' && s.timeZone.length < 100, 'Invalid planner timezone.');
    try { dateInTimeZone(new Date(), s.timeZone); } catch { throw new Error('Invalid planner timezone.'); }
  }
  check(s && [1, 3, 5, 7].includes(s.days) && ['light', 'dark', 'system'].includes(s.theme), 'Invalid view preferences.');
  check(['autoRollover', 'showCompleted', 'lines', 'startYesterday'].every(key => typeof s[key] === 'boolean'), 'Invalid planner preferences.');
  check(s.celebrations === undefined || typeof s.celebrations === 'boolean', 'Invalid celebration preference.');
  check(s.celebrationStyle === undefined || ['confetti', 'cat', 'dog'].includes(s.celebrationStyle), 'Invalid celebration style.');
  check(s.bulletStyle === undefined || ['plain', 'circle', 'square', 'indent'].includes(s.bulletStyle), 'Invalid bullet style.');
  check(/^#[0-9a-f]{6}$/i.test(s.accent) && ['small', 'medium', 'large'].includes(s.size) && ['compact', 'comfortable', 'relaxed'].includes(s.spacing), 'Invalid display preferences.');
  return state;
}

export function reorderItem(items, id, targetId, after = false) {
  if (id === targetId) return;
  const index = items.findIndex(item => item.id === id);
  if (index < 0 || !items.some(item => item.id === targetId)) throw new Error('The item has moved. Try again.');
  const [item] = items.splice(index, 1);
  items.splice(items.findIndex(item => item.id === targetId) + Number(after), 0, item);
}

export function moveList(state, id, groupId, targetId = null, after = false) {
  const list = state.lists.find(item => item.id === id);
  if (!list || !state.groups.some(group => group.id === groupId)) throw new Error('The destination group is no longer available.');
  list.groupId = groupId;
  if (targetId) return reorderItem(state.lists, id, targetId, after);
  state.lists = state.lists.filter(item => item.id !== id);
  const lastIndex = state.lists.findLastIndex(item => item.groupId === groupId);
  state.lists.splice(lastIndex < 0 ? state.lists.length : lastIndex + 1, 0, list);
}

export function moveTask(state, id, location, targetId = null, after = false) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) throw new Error('The task is no longer available.');
  if (targetId === id) return;
  let matches;
  if (location.startsWith('date:') && validDate(location.slice(5))) {
    task.date = location.slice(5);
    matches = item => item.date === task.date;
  } else if (location.startsWith('list:') && state.lists.some(list => list.id === location.slice(5))) {
    task.listId = location.slice(5);
    matches = item => item.listId === task.listId;
  } else if (location === 'inbox') {
    task.date = null;
    task.listId = null;
    matches = isInboxTask;
  } else throw new Error('The destination is no longer available.');
  const siblings = state.tasks.filter(item => item.id !== id && !item.skipped && matches(item)).sort((a, b) => taskOrder(a, location) - taskOrder(b, location));
  const index = siblings.findIndex(item => item.id === targetId);
  siblings.splice(index < 0 ? siblings.length : index + Number(after), 0, task);
  const key = location.startsWith('date:') ? 'dayOrder' : 'listOrder';
  siblings.forEach((item, position) => { item[key] = position; });
}
