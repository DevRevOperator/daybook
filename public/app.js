import { dateKey, dateInTimeZone, addDays, parseDate, validateState, reorderItem, moveList, moveTask, isInboxTask, taskOrder, tasksInList, unlinkLists } from './model.js';
import { preferencesMarkup, syncPreferences, mascotSVG } from './preferences.js';

import { isCloud, initializeStorage, plannerFetch, captureDraftKey, signOut, accountLabel } from './storage.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toastElement = document.querySelector('#toast');
const preferences = document.querySelector('#preferences');
let preferencesOpen = false;
let state;
let revision;
let saveError = false;
function todayKey() { return isCloud ? dateInTimeZone(new Date(), state?.settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone) : dateKey(); }
let viewStart = todayKey();
let activeGroup;
let pending = 0;
let saveQueue = Promise.resolve();
let toastTimer;
let dragging;
let observedToday = todayKey();
const undoStack = [];
const redoStack = [];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const uid = () => crypto.randomUUID();
const clone = value => structuredClone(value);
const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  previous: '<path d="m11 6-6 6 6 6m7-12-6 6 6 6"/>', next: '<path d="m6 6 6 6-6 6m7-12 6 6-6 6"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/>',
  settings: '<path d="M10 2h4l.7 3 2 .9 2.7-.9 2 3.5-2 2.1v2.8l2 2.1-2 3.5-2.7-.9-2 .9-.7 3h-4l-.7-3-2-.9-2.7.9-2-3.5 2-2.1v-2.8l-2-2.1 2-3.5 2.7.9 2-.9Z"/><circle cx="12" cy="12" r="3"/>',
  grip: '<circle cx="9" cy="5" r=".8"/><circle cx="15" cy="5" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="19" r=".8"/><circle cx="15" cy="19" r=".8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
  moon: '<path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  note: '<path d="M6 6h12M6 10h12M6 14h8M6 18h5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  inbox: '<path d="m4 4-2 10v6h20v-6L20 4H4Z"/><path d="M2 14h6l2 3h4l2-3h6"/>',
  pause: '<path d="M9 5v14m6-14v14"/>', play: '<path d="m8 5 11 7-11 7Z"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.more}</svg>`;
const iconButton = (name, label, action, extra = '') => `<button class="icon" title="${escape(label)}" aria-label="${escape(label)}" data-action="${action}" ${extra}>${icon(name)}</button>`;

function toast(message, undo = false) {
  clearTimeout(toastTimer);
  toastElement.innerHTML = `${escape(message)}${undo ? '<button data-action="undo">Undo</button>' : ''}`;
  toastElement.classList.add('visible');
  toastTimer = setTimeout(() => toastElement.classList.remove('visible'), 6500);
}

function celebrate(anchor) {
  if (state.settings.celebrations === false || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('popover', 'manual');
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  layer.showPopover();
  const colors = [state.settings.accent, '#ec849d', '#ecc964', '#5ebfa4', '#9b8bda'];
  const x = anchor.left + anchor.width / 2;
  const y = anchor.top + anchor.height / 2;
  const animations = Array.from({ length: 36 }, (_, index) => {
    const piece = document.createElement('i');
    piece.className = 'confetti-piece';
    piece.style.background = colors[index % colors.length];
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.borderRadius = index % 3 === 0 ? '50%' : '1px';
    layer.append(piece);
    const horizontal = (Math.random() - .5) * 230;
    const rise = 45 + Math.random() * 90;
    const rotation = (Math.random() - .5) * 600;
    return piece.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${horizontal * .65}px,${-rise}px) rotate(${rotation * .5}deg)`, opacity: 1, offset: .4 },
      { transform: `translate(${horizontal}px,${80 + Math.random() * 90}px) rotate(${rotation}deg)`, opacity: 0 }
    ], { duration: 850 + Math.random() * 400, easing: 'cubic-bezier(.15,.65,.45,1)', fill: 'forwards' }).finished;
  });
  if (['cat', 'dog'].includes(state.settings.celebrationStyle)) {
    const mascot = document.createElement('div');
    mascot.className = `celebration-mascot ${state.settings.celebrationStyle}`;
    mascot.innerHTML = `${mascotSVG(state.settings.celebrationStyle)}<span>Nice work!</span>`;
    layer.append(mascot);
    animations.push(mascot.animate([
      { transform: 'translateY(160px) rotate(-8deg)', opacity: 0 },
      { transform: 'translateY(-12px) rotate(5deg)', opacity: 1, offset: .2 },
      { transform: 'translateY(0) rotate(-3deg)', opacity: 1, offset: .38 },
      { transform: 'translateY(0) rotate(3deg)', opacity: 1, offset: .7 },
      { transform: 'translateY(160px) rotate(0)', opacity: 0 }
    ], { duration: 2100, easing: 'ease-in-out', fill: 'forwards' }).finished);
  }
  Promise.allSettled(animations).then(() => layer.remove());
}

async function toggleTask(id, anchor) {
  let completed;
  const saved = await commit(next => {
    const task = next.tasks.find(task => task.id === id);
    completed = !task.completed;
    task.completed = completed;
    task.completedAt = completed ? new Date().toISOString() : null;
  });
  if (saved && completed) celebrate(anchor);
}

async function request(path, options) {
  const response = await plannerFetch(path, options);
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 409) {
      state = result.state;
      revision = result.revision;
      undoStack.length = 0;
      redoStack.length = 0;
      render();
    }
    const error = new Error(result.error || 'Unable to connect to Daybook.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function endpoint() { return `/api/state?through=${addDays(viewStart, state?.settings.days || 5)}`; }

function commit(change, message, options = {}) {
  pending++;
  updateStatus();
  const operation = saveQueue.then(async () => {
    let before;
    try {
      before = clone(state);
      const next = clone(state);
      change(next);
      validateState(next);
      // A stale toggle or form must not be replayed against another device's edit.
      // request() reloads the newer revision and asks the user to retry deliberately.
      const saved = await request(endpoint(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: next, revision, importing: options.importing || false }) });
      saveError = false;
      state = saved.state;
      revision = saved.revision;
      if (options.history !== false) {
        undoStack.push(before);
        if (undoStack.length > 50) undoStack.shift();
        redoStack.length = 0;
      }
      render();
      if (message) toast(message, options.history !== false);
      return true;
    } catch (error) {
      saveError = true;
      toast(error.message, false);
      return false;
    } finally {
      pending--;
      updateStatus();
    }
  });
  saveQueue = operation.catch(() => {});
  return operation;
}

function updateStatus() {
  const element = document.querySelector('.save-status');
  const label = pending ? 'Saving…' : saveError ? 'Couldn’t save — retry' : isCloud ? 'Saved to cloud' : 'Saved on this Mac';
  if (element) element.textContent = label;
  const preferenceStatus = preferences.querySelector('.preferences-status');
  if (preferenceStatus) preferenceStatus.textContent = label;
  preferences.setAttribute('aria-busy', String(pending > 0));
}

async function history(direction) {
  await saveQueue;
  const source = direction === 'undo' ? undoStack : redoStack;
  const target = direction === 'undo' ? redoStack : undoStack;
  if (!source.length) return;
  const previous = source.at(-1);
  const current = clone(state);
  if (await commit(next => Object.assign(next, clone(previous)), direction === 'undo' ? 'Change undone' : 'Change restored', { history: false })) {
    source.pop();
    target.push(current);
    render();
  }
}

function formatDate(day, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return parseDate(day).toLocaleDateString('en-GB', options);
}

function taskRow(task, location) {
  const linkedList = location.startsWith('date:') && state.lists.find(list => list.id === task.listId);
  const scheduled = location.startsWith('list:') && task.date;
  const badge = linkedList ? `<button class="task-context" data-action="show-list" data-id="${linkedList.id}" title="In ${escape(linkedList.name)}" aria-label="Show list ${escape(linkedList.name)}">${escape(linkedList.name)}</button>` : scheduled ? `<button class="task-context" data-action="show-day" data-date="${task.date}" title="Scheduled for ${formatDate(task.date)}" aria-label="Show scheduled day ${formatDate(task.date)}">${formatDate(task.date, { day: 'numeric', month: 'short' })}</button>` : '';

  return `<div class="task-row ${task.completed ? 'done' : ''} ${task.color ? `color-${task.color}` : ''}" draggable="true" data-task="${task.id}">
    <button class="task-check" role="checkbox" aria-checked="${task.completed}" aria-label="${task.completed ? 'Reopen' : 'Complete'} ${escape(task.title)}" data-action="toggle" data-id="${task.id}"></button>
    <button class="task-title" draggable="true" data-action="edit-title" data-id="${task.id}" title="${escape(task.title)}">${escape(task.title)}</button>
    ${badge}
    ${task.ruleId ? `<button class="repeat-mark" aria-label="Edit recurring schedule" title="Recurring task" data-action="edit-rule" data-id="${task.ruleId}">↻</button>` : ''}
    <button class="icon task-more ${task.notes ? 'has-notes' : ''}" aria-label="Details for ${escape(task.title)}" title="Open task details" data-action="task" data-id="${task.id}">${icon('note')}</button>
  </div>`;
}

function taskZone(location, tasks) {
  const visible = tasks.filter(task => !task.skipped && (state.settings.showCompleted || !task.completed)).sort((a, b) => taskOrder(a, location) - taskOrder(b, location));
  const label = location === 'inbox' ? 'Inbox' : location.startsWith('date:') ? formatDate(location.slice(5)) : state.lists.find(list => list.id === location.slice(5))?.name;
  return `<div class="task-zone" data-location="${location}">${visible.map(task => taskRow(task, location)).join('')}
    <form class="new-task" data-location="${location}"><input name="title" data-entry="${location}" aria-label="Add task to ${escape(label)}" placeholder="Type a to-do…" maxlength="1000" autocomplete="off"></form>
  </div>`;
}

function render() {
  if (!state) return;
  const drafts = [...app.querySelectorAll('[data-entry]')].map(input => [input.dataset.entry, input.value]);
  const focused = document.activeElement?.dataset.entry;
  const selection = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const s = state.settings;
  document.documentElement.style.setProperty('--accent', s.accent);
  const rgb = s.accent.match(/[a-f\d]{2}/gi).map(hex => parseInt(hex, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  document.documentElement.style.setProperty('--accent-ink', luminance > .179 ? '#17191d' : '#ffffff');
  document.documentElement.style.setProperty('--text', { small: '12px', medium: '14px', large: '16px' }[s.size]);
  document.documentElement.style.setProperty('--row', { compact: '30px', comfortable: '34px', relaxed: '40px' }[s.spacing]);
  document.body.classList.toggle('dark', s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
  document.body.classList.toggle('no-lines', !s.lines);
  document.body.dataset.bullets = s.bulletStyle || 'plain';
  syncPreferences(preferences, s);
  document.title = `${state.name} · Daily planner`;
  activeGroup = activeGroup === 'inbox' || state.groups.some(group => group.id === activeGroup) ? activeGroup : state.groups[0].id;
  const lists = state.lists.filter(list => list.groupId === activeGroup);
  const today = todayKey();
  app.innerHTML = `
    <header class="topbar">
      <div class="top-left">${iconButton('plus', 'Quick capture (Q)', 'capture')}${iconButton('search', 'Search tasks (⌘K)', 'search')}<span class="month-caption">${formatDate(viewStart, { month: 'long', year: 'numeric' })}</span></div>
      <button class="brand" data-action="rename-planner" title="Rename your planner">${escape(state.name)}</button>
      <nav class="nav" aria-label="Date navigation">
        <button class="text-button" data-action="today">Today</button>
        ${iconButton('previous', 'Previous page', 'navigate', `data-offset="-${s.days}"`)}
        ${iconButton('left', 'Previous day', 'navigate', 'data-offset="-1"')}
        ${iconButton('right', 'Next day', 'navigate', 'data-offset="1"')}
        ${iconButton('next', 'Next page', 'navigate', `data-offset="${s.days}"`)}
        ${iconButton('calendar', 'Jump to date', 'calendar')}
      </nav>
    </header>
    <main>
      <section class="planner" aria-label="Daily planner">
        <div class="days-grid" style="--days:${s.days}">${Array.from({ length: s.days }, (_, index) => {
          const day = addDays(viewStart, index);
          return `<section class="day-column ${day === today ? 'today' : ''}" aria-label="${formatDate(day)}">
            <div class="day-heading"><div class="date-label">${formatDate(day)}</div><h2>${weekdayNames[parseDate(day).getDay()]}${day === today ? '<span class="today-label">today</span>' : ''}</h2></div>
            ${taskZone(`date:${day}`, state.tasks.filter(task => task.date === day))}
          </section>`;
        }).join('')}</div>
      </section>
      <nav class="groups-bar" aria-label="List groups"><button class="group-tab inbox-tab ${activeGroup === 'inbox' ? 'active' : ''}" data-action="inbox" data-inbox-drop aria-current="${activeGroup === 'inbox'}">${icon('inbox')}Inbox<span class="group-count">${state.tasks.filter(task => isInboxTask(task) && !task.completed).length}</span></button>${state.groups.map(group => `<button class="group-tab ${activeGroup === group.id ? 'active' : ''}" draggable="true" data-group="${group.id}" data-action="group" data-id="${group.id}" title="Drag to reorder; drop a list here to move it" aria-current="${activeGroup === group.id}"><span class="drag-grip" aria-hidden="true">${icon('grip')}</span>${escape(group.name)}<span class="group-count">${state.lists.filter(list => list.groupId === group.id).length}</span></button>`).join('')}
        ${iconButton('plus', 'Add group', 'add-group')}
        <span class="group-settings">${activeGroup === 'inbox' ? '' : iconButton('more', 'Manage this group', 'manage-group', `data-id="${activeGroup}"`)}</span>
      </nav>
      <section class="shelf" aria-label="Task lists">
        ${activeGroup === 'inbox' ? `<section class="inbox-column"><div class="inbox-heading"><div><h2>Inbox</h2><p>Capture now. Give it a day or a list when you’re ready.</p></div><button class="secondary" data-action="capture">Quick capture <kbd>Q</kbd></button></div>${taskZone('inbox', state.tasks.filter(isInboxTask))}</section>` : `
        <div class="lists-grid ${lists.length === 0 ? 'empty-group' : ''}" style="--list-count:${lists.length}">${lists.map(list => `<section class="list-column" data-list="${list.id}">
          <div class="list-heading" draggable="true" data-list-drag="${list.id}" title="Drag to reorder or move to another group"><span class="drag-grip" aria-hidden="true">${icon('grip')}</span><h2>${escape(list.name)}</h2>${iconButton('more', `Manage ${list.name}`, 'manage-list', `data-id="${list.id}"`)}</div>
          ${taskZone(`list:${list.id}`, tasksInList(state, list.id))}
        </section>`).join('')}
        <button class="add-list" data-action="add-list">＋ New list</button></div>`}
      </section>
    </main>
    <footer>
      <div class="footer-left">${iconButton('settings', 'Preferences', 'settings', `aria-expanded="${preferencesOpen}" aria-controls="preferences"`)}${iconButton('repeat', 'Recurring tasks', 'rules')}${iconButton('undo', 'Undo (⌘Z)', 'undo', undoStack.length ? '' : 'disabled')}</div>
      <div class="view-switch" aria-label="Day view">${[1, 3, 5, 7].map(days => `<button class="${s.days === days ? 'active' : ''}" aria-label="${days} day view" aria-pressed="${s.days === days}" data-action="view" data-days="${days}">${days}</button>`).join('')}<span class="divider"></span>${iconButton('moon', 'Toggle dark mode', 'theme')}</div>
      <div class="footer-right"><span class="save-status">Saved on this Mac</span>${iconButton('download', 'Backups and data', 'data')}${iconButton('help', 'Help and shortcuts', 'help')}</div>
    </footer>`;
  for (const [key, value] of drafts) {
    const input = app.querySelector(`[data-entry="${key}"]`);
    if (input) input.value = value;
  }
  if (focused) {
    const input = app.querySelector(`[data-entry="${focused}"]`);
    if (input) { input.focus(); input.setSelectionRange(...selection); }
  }
  updateStatus();
}

function openDialog(title, body, drawer = false) {
  dialog.className = drawer ? 'drawer' : '';
  dialog.innerHTML = `<div class="dialog-head"><h2>${escape(title)}</h2>${iconButton('close', 'Close dialog', 'close')}</div><div class="dialog-body">${body}</div>`;
  dialog.setAttribute('aria-label', title);
  if (!dialog.open) dialog.showModal();
  return dialog.querySelector('.dialog-body');
}

function simpleForm(title, label, value, save) {
  openDialog(title, `<form id="simple-form"><label class="field"><span>${escape(label)}</span><input name="name" required maxlength="60" value="${escape(value)}" autofocus></label><div class="actions"><button type="button" class="secondary" data-action="close">Cancel</button><button class="primary">Save</button></div></form>`);
  dialog.querySelector('input').select();
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('name').trim();
    if (value && await save(value)) dialog.close();
  };
}

function newTask(title, location) {
  return { id: uid(), title, notes: '', date: location.startsWith('date:') ? location.slice(5) : null, listId: location.startsWith('list:') ? location.slice(5) : null, completed: false, completedAt: null, color: '', order: Date.now(), ruleId: null, occurrenceDate: null, createdAt: new Date().toISOString() };
}

function captureDialog() {
  if (dialog.open) return;
  let draft;
  try { draft = JSON.parse(localStorage.getItem(captureDraftKey())); } catch {}
  if (!draft || typeof draft.title !== 'string' || !/^capture-[a-f0-9-]{36}$/i.test(draft.id)) draft = { id: `capture-${uid()}`, title: '' };
  openDialog('Quick capture', `<form id="capture-form"><label class="sr-only" for="capture-title">Task to capture</label><input id="capture-title" name="title" class="capture-input" placeholder="What’s on your mind?" value="${escape(draft.title)}" maxlength="1000" required autocomplete="off" autofocus><div class="capture-destination">${icon('inbox')} Inbox <span>Organise it later</span></div><div class="capture-status" role="status" aria-live="polite"></div><div class="capture-bottom"><span class="capture-shortcut">Q here · ⌃⌥Space on your Mac</span><button class="primary">Add to Inbox</button></div><p class="hint companion-status">Checking Mac shortcut…</p></form>`);
  dialog.classList.add('capture-dialog');
  const form = dialog.querySelector('form');
  const input = form.elements.title;
  const status = form.querySelector('.capture-status');
  const remember = () => { draft.title = input.value; try { localStorage.setItem(captureDraftKey(), JSON.stringify(draft)); } catch {} };
  input.addEventListener('input', remember);
  input.focus();
  request('/api/companion').then(info => {
    if (!form.isConnected) return;
    form.querySelector('.companion-status').textContent = isCloud ? 'Saved to your cloud Inbox. The Mac shortcut can open this capture window.' : info.active && info.available ? 'Mac shortcut ready · Control + Option + Space' : info.active ? 'The Mac shortcut is in use by another app. Quick capture is available in the Daybook menu bar.' : 'For capture from any app, open Daybook Capture.app in the teuxdeux folder.';
  }).catch(() => { if (form.isConnected) form.querySelector('.companion-status').textContent = 'Mac shortcut requires Daybook Capture.app.'; });
  form.onsubmit = event => {
    event.preventDefault();
    if (!input.value.trim()) return;
    remember();
    const captured = { ...draft };
    const submit = form.querySelector('button');
    submit.disabled = true;
    input.readOnly = true;
    status.textContent = 'Saving…';
    pending++;
    updateStatus();
    const operation = saveQueue.then(async () => {
      try {
        const result = await request('/api/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(captured) });
        state = result.state;
        revision = result.revision;
        saveError = false;
        undoStack.length = 0;
        redoStack.length = 0;
        try { localStorage.removeItem(captureDraftKey()); } catch {}
        activeGroup = 'inbox';
        render();
        if (form.isConnected) dialog.close();
        toast('Added to Inbox');
      } catch (error) {
        saveError = true;
        status.textContent = `${error.message} Your draft is kept. Retry when connected.`;
        submit.disabled = false;
        input.readOnly = false;
        input.focus();
      } finally { pending--; updateStatus(); }
    });
    saveQueue = operation.catch(() => {});
  };
}

function removeTask(next, id) {
  const task = next.tasks.find(task => task.id === id);
  if (task?.ruleId) {
    const rule = next.rules.find(rule => rule.id === task.ruleId);
    if (rule) rule.excludedDates.push(task.occurrenceDate);
  }
  next.tasks = next.tasks.filter(task => task.id !== id);
}

function editTitle(id, sourceRow) {
  const task = state.tasks.find(task => task.id === id);
  const row = sourceRow || app.querySelector(`[data-task="${id}"]`);
  if (!task || !row || row.querySelector('input')) return;
  const button = row.querySelector('.task-title');
  const input = document.createElement('input');
  input.className = 'inline-title';
  input.value = task.title;
  input.maxLength = 1000;
  input.setAttribute('aria-label', 'Edit task title');
  button.replaceWith(input);
  row.draggable = false;
  input.focus();
  input.select();
  let finished = false;
  const save = async () => {
    if (finished) return;
    finished = true;
    const title = input.value.trim();
    if (title && title !== task.title) {
      const saved = await commit(next => { next.tasks.find(item => item.id === id).title = title; });
      if (!saved) { finished = false; input.focus(); }
    } else render();
  };
  input.onblur = save;
  input.onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); save(); }
    if (event.key === 'Escape') { finished = true; render(); }
  };
}

function locationOptions(selected) {
  return `<option value="" ${!selected ? 'selected' : ''}>No list</option>${state.groups.map(group => `<optgroup label="${escape(group.name)}">${state.lists.filter(list => list.groupId === group.id).map(list => `<option value="${list.id}" ${selected === list.id ? 'selected' : ''}>${escape(list.name)}</option>`).join('')}</optgroup>`).join('')}`;
}

function taskDialog(id) {
  const task = state.tasks.find(task => task.id === id);
  if (!task) return;
  openDialog('Task details', `<form id="task-form">
    <div class="task-panel-title"><button type="button" class="panel-complete ${task.completed ? 'is-complete' : ''}" id="task-complete" aria-label="${task.completed ? 'Reopen task' : 'Complete task'}" title="${task.completed ? 'Reopen task' : 'Complete task'}">${icon('check')}</button><input class="panel-title-input" aria-label="To-do" name="title" required maxlength="1000" value="${escape(task.title)}"></div>
    <div class="field-row"><label class="field"><span>List · optional</span><select name="location">${locationOptions(task.listId)}</select></label><label class="field" id="task-date-field"><span>Scheduled day · optional</span><input type="date" name="date" min="2000-01-01" max="2100-12-31" value="${task.date || ''}"></label></div>
    <p class="hint linked-explanation">Scheduled tasks stay in their list. With no list or day, this task lives in Inbox.</p>
    <label class="field"><span>Notes</span><textarea class="task-notes" name="notes" placeholder="Add a note, a link, or the next step…" maxlength="50000">${escape(task.notes)}</textarea></label>
    <label class="field"><span>Highlight</span><select name="color">${[['', 'None'], ['yellow', 'Yellow'], ['pink', 'Pink'], ['blue', 'Blue'], ['green', 'Green']].map(([value, label]) => `<option value="${value}" ${task.color === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <div class="actions" style="justify-content:flex-start;margin-top:0"><button type="button" class="secondary" id="move-tomorrow">Tomorrow</button><button type="button" class="secondary" id="clear-task-date">Clear day</button><button type="button" class="secondary" id="task-repeat">${task.ruleId ? 'Edit repeat' : 'Make recurring'}</button></div>
    ${task.rolledFrom ? `<p class="hint">Carried forward from ${formatDate(task.rolledFrom)}.</p>` : ''}
    <div class="actions"><button type="button" class="danger" id="delete-task">Delete ${task.ruleId ? 'this occurrence' : 'task'}</button><button type="button" class="secondary" data-action="close">Cancel</button><button class="primary">Save task</button></div>
  </form>`, true);
  dialog.classList.add('task-drawer');
  const form = dialog.querySelector('form');
  const fields = form.elements;
  const saveDetails = async (complete = false) => {
    if (!form.reportValidity()) return false;
    const values = new FormData(form);
    const location = values.get('location');
    return commit(next => {
      const item = next.tasks.find(item => item.id === id);
      Object.assign(item, { title: values.get('title').trim(), notes: values.get('notes'), color: values.get('color'), date: values.get('date') || null, listId: location || null });
      if (complete) { item.completed = !item.completed; item.completedAt = item.completed ? new Date().toISOString() : null; }
    }, complete ? undefined : 'Task saved');
  };
  dialog.querySelector('#task-complete').onclick = async event => {
    const anchor = event.currentTarget.getBoundingClientRect();
    if (await saveDetails(true)) {
      const completed = state.tasks.find(item => item.id === id).completed;
      dialog.close();
      if (completed) celebrate(anchor);
    }
  };
  dialog.querySelector('#move-tomorrow').onclick = () => { fields.date.value = addDays(todayKey(), 1); };
  dialog.querySelector('#clear-task-date').onclick = () => { fields.date.value = ''; };
  dialog.querySelector('#task-repeat').onclick = async () => {
    const draft = { ...task, title: fields.title.value.trim(), notes: fields.notes.value, color: fields.color.value, date: fields.date.value || null, listId: fields.location.value || null };
    if (await commit(next => Object.assign(next.tasks.find(item => item.id === id), draft))) ruleDialog(task.ruleId, draft);
  };
  dialog.querySelector('#delete-task').onclick = async () => { if (await commit(next => removeTask(next, id), 'Task deleted')) dialog.close(); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (await saveDetails()) dialog.close();
  };
}

function ruleLabel(rule) {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.frequency];
  let label = rule.frequency === 'weekdays' ? 'Every weekday' : `Every ${rule.interval === 1 ? '' : `${rule.interval} `}${unit}${rule.interval > 1 ? 's' : ''}`;
  if (rule.frequency === 'weekly') label += ` · ${rule.weekdays.map(day => weekdayNames[day].slice(0, 3)).join(', ')}`;
  if (rule.frequency === 'monthly') label += ` · day ${parseDate(rule.start).getDate()}`;
  if (rule.frequency === 'yearly') label += ` · ${formatDate(rule.start, { day: 'numeric', month: 'short' })}`;
  return rule.paused ? `Paused · ${label}` : label;
}

function rulesDialog() {
  openDialog('Recurring tasks', `<button class="primary" data-action="add-rule">＋ New recurring task</button>
    ${state.rules.length ? `<div style="margin-top:20px">${state.rules.map(rule => `<div class="rule-row ${rule.paused ? 'paused' : ''}"><button class="rule-title" data-action="edit-rule" data-id="${rule.id}"><strong>${escape(rule.title)}</strong><small>${escape(ruleLabel(rule))}</small></button>${iconButton(rule.paused ? 'play' : 'pause', rule.paused ? 'Resume schedule' : 'Pause schedule', 'pause-rule', `data-id="${rule.id}"`)}</div>`).join('')}</div>` : '<p class="empty">Make room for your routines.<br>Add a task and choose when it repeats.</p>'}
    <p class="hint">You can also type “Water plants every week” directly into a day.</p>`, true);
}

function ruleDialog(id, task) {
  const existing = state.rules.find(rule => rule.id === id);
  const rule = existing || { id: uid(), title: task?.title || '', notes: task?.notes || '', listId: task?.listId || null, frequency: 'weekly', interval: 1, start: task?.date || todayKey(), end: '', weekdays: [parseDate(task?.date || todayKey()).getDay()], paused: false, excludedDates: [] };
  openDialog(existing ? 'Edit recurring task' : 'New recurring task', `<form id="rule-form">
    <label class="field"><span>To-do</span><input name="title" required maxlength="1000" value="${escape(rule.title)}" autofocus></label>
    <div class="field-row"><label class="field"><span>Repeats</span><select name="frequency">${[['daily', 'Daily'], ['weekdays', 'Every weekday'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([value, label]) => `<option value="${value}" ${rule.frequency === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field" id="interval-field"><span>Every how many?</span><input name="interval" type="number" min="1" max="365" value="${rule.interval}" required></label></div>
    <div id="weekdays-field"><span class="field-label">On these days</span><div class="weekday-picker">${[1, 2, 3, 4, 5, 6, 0].map(day => `<label><input type="checkbox" name="weekdays" value="${day}" aria-label="${weekdayNames[day]}" ${rule.weekdays.includes(day) ? 'checked' : ''}><span>${weekdayNames[day].slice(0, 2)}</span></label>`).join('')}</div></div>
    <div class="field-row"><label class="field"><span>Starts</span><input type="date" name="start" value="${rule.start}" min="2000-01-01" max="2100-12-31" required></label><label class="field"><span>Ends · optional</span><input type="date" name="end" value="${rule.end || ''}" min="2000-01-01" max="2100-12-31"></label></div>
    <label class="field"><span>List · optional</span><select name="listId">${locationOptions(rule.listId)}</select></label>
    <label class="field"><span>Notes for each occurrence</span><textarea name="notes" style="min-height:90px" maxlength="50000">${escape(rule.notes)}</textarea></label>
    <p class="hint">${existing ? 'Changes apply to unfinished occurrences from today onward. Completed tasks keep their history.' : 'Each occurrence gets its own checkbox. Dates near the end of a month use that month’s last day when needed.'}</p>
    <div class="actions">${existing ? '<button type="button" class="danger" id="delete-rule">Stop repeating</button>' : ''}<button type="button" class="secondary" data-action="close">Cancel</button><button class="primary">Save schedule</button></div>
  </form>`);
  const form = dialog.querySelector('form');
  const toggle = () => {
    dialog.querySelector('#weekdays-field').hidden = form.elements.frequency.value !== 'weekly';
    dialog.querySelector('#interval-field').hidden = form.elements.frequency.value === 'weekdays';
  };
  toggle();
  form.elements.frequency.onchange = toggle;
  if (existing) dialog.querySelector('#delete-rule').onclick = async () => {
    if (await commit(next => {
      next.rules = next.rules.filter(item => item.id !== id);
      next.tasks = next.tasks.filter(item => !(item.ruleId === id && item.occurrenceDate > todayKey() && !item.completed));
      next.tasks.filter(item => item.ruleId === id).forEach(item => { item.ruleId = null; });
    }, 'Recurring schedule stopped')) rulesDialog();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(form);
    const updated = { ...rule, listId: data.get('listId') || null, title: data.get('title').trim(), notes: data.get('notes'), frequency: data.get('frequency'), interval: Number(data.get('interval')), start: data.get('start'), end: data.get('end'), weekdays: data.getAll('weekdays').map(Number), generatedThrough: null };
    if (updated.frequency === 'weekly' && !updated.weekdays.length) { toast('Choose at least one weekday.'); return; }
    if (await commit(next => {
      next.rules = next.rules.filter(item => item.id !== rule.id);
      if (existing) next.tasks = next.tasks.filter(item => !(item.ruleId === id && item.occurrenceDate >= todayKey() && !item.completed));
      if (task && !existing) next.tasks = next.tasks.filter(item => item.id !== task.id);
      next.rules.push(updated);
    }, 'Recurring schedule saved')) dialog.close();
  };
}

function manageList(id) {
  const list = state.lists.find(item => item.id === id);
  const count = state.tasks.filter(task => task.listId === id).length;
  openDialog('Manage list', `<form><label class="field"><span>List name</span><input name="name" required maxlength="80" value="${escape(list.name)}"></label>
    <label class="field"><span>Group</span><select name="group">${state.groups.map(group => `<option value="${group.id}" ${group.id === list.groupId ? 'selected' : ''}>${escape(group.name)}</option>`).join('')}</select></label>
    <p class="hint">Drag the list heading to change its position. Tasks move with the list when you change its group.</p>
    <div class="actions"><button type="button" class="danger" id="delete-list">Delete list</button><button class="primary">Save list</button></div></form>`);
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (await commit(next => Object.assign(next.lists.find(item => item.id === id), { name: values.get('name').trim(), groupId: values.get('group') }), 'List saved')) { activeGroup = values.get('group'); render(); dialog.close(); }
  };
  dialog.querySelector('#delete-list').onclick = () => confirmDelete(`Delete ${list.name}?`, `The ${count} task${count === 1 ? '' : 's'} will be kept. Scheduled tasks keep their day; undated tasks move to Inbox. You can undo this.`, async () => commit(next => { unlinkLists(next, [id]); }, 'List deleted'));
}

function manageGroup(id) {
  const group = state.groups.find(item => item.id === id);
  openDialog('Manage group', `<form><label class="field"><span>Group name</span><input name="name" required maxlength="80" value="${escape(group.name)}"></label><p class="hint">Drag group tabs to rearrange them. Use a list’s menu to move it between groups.</p><div class="actions"><button type="button" class="danger" id="delete-group" ${state.groups.length === 1 ? 'disabled' : ''}>Delete group</button><button class="primary">Save group</button></div></form>`);
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get('name').trim();
    if (await commit(next => { next.groups.find(item => item.id === id).name = name; }, 'Group saved')) dialog.close();
  };
  dialog.querySelector('#delete-group').onclick = () => confirmDelete(`Delete ${group.name}?`, 'The group and its lists will be removed. Tasks keep their scheduled days; undated tasks move to Inbox. You can undo this.', async () => commit(next => {
    const ids = new Set(next.lists.filter(list => list.groupId === id).map(list => list.id));
    unlinkLists(next, [...ids]);
    next.groups = next.groups.filter(group => group.id !== id);
  }, 'Group deleted'));
}

function confirmDelete(title, description, action) {
  openDialog(title, `<p class="hint">${escape(description)}</p><div class="actions"><button class="secondary" data-action="close">Cancel</button><button class="primary" id="confirm-action">Confirm</button></div>`);
  dialog.querySelector('#confirm-action').onclick = async () => { if (await action()) dialog.close(); };
}

function settingsDialog() {
  if (preferencesOpen) { closePreferences(); return; }
  if (dialog.open) dialog.close();
  preferencesOpen = true;
  if (!preferences.childElementCount) preferences.innerHTML = preferencesMarkup();
  if (isCloud && !preferences.querySelector('[data-setting="timeZone"]')) {
    const zones = [...new Set([state.settings.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone, ...Intl.supportedValuesOf('timeZone')])].filter(Boolean);
    preferences.querySelector('.local-preferences').insertAdjacentHTML('beforeend', `<label class="field timezone-field"><span>Planner timezone</span><select data-setting="timeZone" aria-label="Planner timezone">${zones.map(zone => `<option value="${escape(zone)}">${escape(zone)}</option>`).join('')}</select></label><button class="preferences-link" data-action="account">Account & sign out</button>`);
  }
  preferences.hidden = false;
  document.body.classList.add('preferences-open');
  document.querySelector('.preferences-backdrop').hidden = false;
  app.querySelector('[data-action="settings"]')?.setAttribute('aria-expanded', 'true');
  syncPreferences(preferences, state.settings);
  updateStatus();
  preferences.querySelector('[data-action="close-preferences"]').focus({ preventScroll: true });
}

function closePreferences() {
  preferencesOpen = false;
  preferences.hidden = true;
  document.body.classList.remove('preferences-open');
  document.querySelector('.preferences-backdrop').hidden = true;
  const opener = app.querySelector('[data-action="settings"]');
  opener?.setAttribute('aria-expanded', 'false');
  opener?.focus({ preventScroll: true });
}

async function updatePreference(key, value) {
  const saved = await commit(next => {
    next.settings[key] = value;
    if (key === 'autoRollover' && value) next.lastRollover = addDays(todayKey(), -1);
  });
  if (saved && key === 'startYesterday') await navigate(addDays(todayKey(), value ? -1 : 0));
  if (saved && key === 'days') await refresh();
  if (saved && key === 'timeZone') { observedToday = todayKey(); await navigate(addDays(todayKey(), state.settings.startYesterday ? -1 : 0)); }
  syncPreferences(preferences, state.settings);
  if (!saved) preferences.querySelector('.preferences-status').textContent = 'Couldn’t save. Please try again.';
}

preferences.addEventListener('click', event => {
  const button = event.target.closest('[data-preference]');
  if (button) updatePreference(button.dataset.preference, JSON.parse(button.dataset.value));
});
preferences.addEventListener('change', event => {
  const input = event.target.closest('[data-setting]');
  if (input) updatePreference(input.dataset.setting, input.type === 'checkbox' ? input.checked : input.value);
});

function searchDialog() {
  openDialog('Find a task', '<input class="search-box" id="search-input" type="search" placeholder="Search tasks and notes…" aria-label="Search tasks and notes" autofocus><div class="search-results"></div>');
  const input = dialog.querySelector('input');
  const results = dialog.querySelector('.search-results');
  input.oninput = () => {
    const query = input.value.trim().toLocaleLowerCase();
    const found = state.tasks.filter(task => !task.skipped && `${task.title} ${task.notes}`.toLocaleLowerCase().includes(query));
    results.innerHTML = query ? (found.length ? found.slice(0, 100).map(task => `<button class="search-result" data-action="search-result" data-id="${task.id}"><strong>${escape(task.title)}</strong><small>${task.completed ? 'Completed · ' : ''}${escape(task.date ? formatDate(task.date) : state.lists.find(list => list.id === task.listId)?.name || 'Inbox')}</small></button>`).join('') : '<p class="empty">No tasks found.</p>') : '<p class="hint">Search includes completed tasks and notes.</p>';
  };
  input.oninput();
}

function downloadJSON(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dataDialog() {
  openDialog('Backups & data', `<p class="hint">${isCloud ? 'Your planner is stored in your private Supabase account. Daybook keeps up to 30 daily save-point snapshots and 20 pre-import snapshots in that database. These are not a separate off-site backup; export a copy for independent recovery.' : 'Your tasks are saved in a SQLite database on this Mac, with 30 daily backups in .data/backups.'}</p>
    <div class="section-label">Take a copy</div><button class="primary" data-action="export">Export Daybook backup</button>
    <div class="section-label">Restore a backup</div><p class="hint">Import a Daybook JSON backup to replace this planner. A copy of your current data is saved before importing.</p><button class="secondary" data-action="import">Choose backup file</button>
    ${isCloud ? '<div class="section-label">Cloud snapshots</div><div id="cloud-backups" class="hint">Loading snapshots…</div>' : ''}`, true);
  if (isCloud) {
    const list = dialog.querySelector('#cloud-backups');
    request('/api/backups').then(items => {
      if (!list.isConnected) return;
      list.innerHTML = items.length ? items.map(item => `<button class="backup-row" data-action="download-backup" data-id="${item.id}">${escape(new Date(item.created_at).toLocaleString())}<small>${item.reason === 'before-import' ? 'Before import' : 'Daily snapshot'} · revision ${item.revision}</small></button>`).join('') : 'Snapshots appear after your planner changes.';
    }).catch(error => { if (list.isConnected) list.textContent = error.message; });
  }
}

function accountDialog() {
  openDialog('Your account', `<p class="hint">${accountLabel()}</p><p class="hint">Your tasks are saved online. Signing out removes this browser’s access until you sign in again.</p><div class="actions"><button class="secondary" data-action="close">Close</button><button class="primary" data-action="sign-out">Sign out</button></div>`);
}

function helpDialog() {
  openDialog('A little help', `<p class="hint">Type in any ruled row and press Enter. Click a task to edit its title. Use its checkbox to complete it, or its note icon to open the details panel.</p><p class="hint">Drag a list task onto a day to schedule it while keeping its list. Drag a dated task into a list to file it while keeping its day. Use Clear day in task details to unschedule it. Inbox holds tasks with no list or date. A line shows where each item will land. Drag list headings and group tabs to reorder them. Drop a list on a group tab to move it. Drop a task on a group to choose one of its lists.</p>
    ${[['Quick capture here', 'Q'], ['Quick capture anywhere (Mac companion)', '⌃ ⌥ Space'], ['Find a task', '⌘ K'], ['Add to the first day', 'N'], ['Go to today', 'T'], ['Previous / next day', '← / →'], ['Change day view', '1 / 3 / 5 / 7'], ['Undo', '⌘ Z'], ['Redo', '⌘ ⇧ Z'], ['Close dialog / cancel edit', 'Esc']].map(([label, key]) => `<div class="shortcut"><span>${label}</span><kbd>${key}</kbd></div>`).join('')}
    <p class="hint">“every day”, “every weekday”, “every week”, “every month”, and “every year” at the end of a task create a recurring schedule. Fine-tune it from Recurring tasks.</p>
    <p class="hint">${isCloud ? 'Daybook saves online. Keep this page open until Saving changes to Saved to cloud. Use Backups & data to export a recovery copy.' : 'Daybook runs locally. Keep its server running while you use it. Reopen with Start Daybook.command.'}</p>`, true);
}

async function refresh() {
  if (pending) return;
  try {
    const today = todayKey();
    if (today !== observedToday) {
      if (viewStart === observedToday || viewStart === addDays(observedToday, -1)) {
        viewStart = addDays(today, state.settings.startYesterday ? -1 : 0);
      }
      observedToday = today;
    }
    const result = await request(endpoint());
    if (!pending && result.revision > revision) {
      state = result.state;
      revision = result.revision;
      undoStack.length = 0;
      redoStack.length = 0;
      render();
    }
  } catch (error) { toast(error.message); }
}

async function navigate(day) {
  viewStart = day;
  render();
  await refresh();
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, id } = button.dataset;
  switch (action) {
    case 'close': dialog.close(); break;
    case 'navigate': navigate(addDays(viewStart, Number(button.dataset.offset))); break;
    case 'today': navigate(addDays(todayKey(), state.settings.startYesterday ? -1 : 0)); break;
    case 'view': await commit(next => { next.settings.days = Number(button.dataset.days); }); await refresh(); break;
    case 'group': activeGroup = id; render(); break;
    case 'toggle': toggleTask(id, button.getBoundingClientRect()); break;
    case 'edit-title': editTitle(id, button.closest('[data-task]')); break;
    case 'capture': captureDialog(); break;
    case 'inbox': activeGroup = 'inbox'; render(); break;
    case 'show-list': activeGroup = state.lists.find(list => list.id === id)?.groupId; render(); app.querySelector(`[data-list="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); break;
    case 'show-day': navigate(button.dataset.date); break;
    case 'task': taskDialog(id); break;
    case 'search': searchDialog(); break;
    case 'search-result': {
      const task = state.tasks.find(task => task.id === id);
      if (task.date) viewStart = task.date;
      else activeGroup = state.lists.find(list => list.id === task.listId)?.groupId || 'inbox';
      render(); taskDialog(id); break;
    }
    case 'calendar': {
      openDialog('Go to a date', `<form><label class="field"><span>Date</span><input type="date" name="date" value="${viewStart}" min="2000-01-01" max="2100-12-31" required autofocus></label><div class="actions"><button class="primary">Go to date</button></div></form>`);
      dialog.querySelector('form').onsubmit = event => { event.preventDefault(); navigate(new FormData(event.currentTarget).get('date')); dialog.close(); }; break;
    }
    case 'add-group': simpleForm('New group', 'Group name', '', name => { const groupId = uid(); return commit(next => { next.groups.push({ id: groupId, name }); activeGroup = groupId; }, 'Group created'); }); break;
    case 'add-list': simpleForm('New list', 'List name', '', name => commit(next => next.lists.push({ id: uid(), name, groupId: activeGroup }), 'List created')); break;
    case 'rename-planner': simpleForm('Your planner', 'Name', state.name, name => commit(next => { next.name = name; })); break;
    case 'manage-list': manageList(id); break;
    case 'manage-group': manageGroup(id); break;
    case 'settings': settingsDialog(); break;
    case 'close-preferences': closePreferences(); break;
    case 'preview-celebration': celebrate(button.getBoundingClientRect()); break;
    case 'rules': rulesDialog(); break;
    case 'add-rule': ruleDialog(); break;
    case 'edit-rule': ruleDialog(id); break;
    case 'pause-rule': {
      if (await commit(next => {
        const rule = next.rules.find(rule => rule.id === id);
        rule.paused = !rule.paused;
        if (rule.paused) next.tasks = next.tasks.filter(task => !(task.ruleId === id && task.occurrenceDate > todayKey() && !task.completed));
        rule.generatedThrough = rule.paused ? todayKey() : addDays(todayKey(), -1);
      }, 'Schedule updated')) rulesDialog(); break;
    }
    case 'theme': commit(next => { next.settings.theme = document.body.classList.contains('dark') ? 'light' : 'dark'; }); break;
    case 'undo': history('undo'); break;
    case 'data': dataDialog(); break;
    case 'export': try { downloadJSON(await request('/api/export'), `daybook-${todayKey()}.json`); } catch (error) { toast(error.message); } break;
    case 'download-backup': try { downloadJSON(await request(`/api/backups/${id}`), `daybook-snapshot-${id}.json`); } catch (error) { toast(error.message); } break;
    case 'account': accountDialog(); break;
    case 'sign-out': await saveQueue; try { await signOut(); } catch (error) { toast(error.message); } break;
    case 'import': document.querySelector('#import-file').click(); break;
    case 'help': helpDialog(); break;
  }
});

app.addEventListener('submit', async event => {
  const form = event.target.closest('.new-task');
  if (!form) return;
  event.preventDefault();
  const input = form.elements.title;
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  const location = form.dataset.location;
  const recurring = location === 'inbox' ? null : title.match(/^(.+?) every (day|weekday|week|month|year)$/i);
  const saved = await commit(next => {
    if (recurring) {
      const start = location.startsWith('date:') ? location.slice(5) : todayKey();
      next.rules.push({ id: uid(), title: recurring[1].trim(), notes: '', listId: location.startsWith('list:') ? location.slice(5) : null, start, end: '', frequency: { day: 'daily', weekday: 'weekdays', week: 'weekly', month: 'monthly', year: 'yearly' }[recurring[2].toLowerCase()], interval: 1, weekdays: [parseDate(start).getDay()], paused: false, excludedDates: [], generatedThrough: null });
    } else next.tasks.push(newTask(title, location));
  }, recurring ? 'Recurring schedule created' : undefined);
  if (!saved) {
    const current = app.querySelector(`[data-entry="${location}"]`);
    if (current && !current.value) current.value = title;
  }
});

app.addEventListener('contextmenu', event => {
  const row = event.target.closest('[data-task]');
  if (row) { event.preventDefault(); taskDialog(row.dataset.task); }
});

app.addEventListener('dragstart', event => {
  if (event.target.matches('input, textarea')) return event.preventDefault();
  const task = event.target.closest('[data-task]');
  const group = event.target.closest('[data-group]');
  const list = event.target.closest('[data-list-drag]');
  dragging = task ? { type: 'task', id: task.dataset.task } : group ? { type: 'group', id: group.dataset.group } : list ? { type: 'list', id: list.dataset.listDrag } : null;
  if (!dragging) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragging.id);
  (task || group || list).classList.add('dragging');
  document.body.classList.add('is-dragging');
});

function clearDropMarkers() {
  app.querySelectorAll('.drag-over, .drop-before, .drop-after, .drop-left, .drop-right').forEach(element => element.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-left', 'drop-right'));
}

function endDrag() {
  dragging = null;
  clearDropMarkers();
  app.querySelectorAll('.dragging').forEach(element => element.classList.remove('dragging'));
  document.body.classList.remove('is-dragging');
}

function dropTarget(event) {
  const inbox = event.target.closest('[data-inbox-drop]');
  if (inbox) return dragging.type === 'task' ? { type: 'inbox', element: inbox, location: 'inbox' } : null;
  const group = event.target.closest('[data-group]');
  if (group) {
    const rect = group.getBoundingClientRect();
    return { type: 'group', element: group, id: group.dataset.group, after: event.clientX > rect.left + rect.width / 2 };
  }
  if (dragging.type === 'task') {
    const zone = event.target.closest('.task-zone');
    if (!zone) return null;
    const row = event.target.closest('[data-task]');
    const rect = row?.getBoundingClientRect();
    return { type: 'task', element: zone, location: zone.dataset.location, row, id: row?.dataset.task, after: rect ? event.clientY > rect.top + rect.height / 2 : false };
  }
  if (dragging.type === 'list') {
    const column = event.target.closest('[data-list]');
    if (column) {
      const rect = column.getBoundingClientRect();
      return { type: 'list', element: column, id: column.dataset.list, after: event.clientX > rect.left + rect.width / 2 };
    }
    const shelf = event.target.closest('.shelf');
    if (shelf) return { type: 'list-end', element: shelf };
  }
  return null;
}

function taskGroupDestination(taskId, groupId) {
  const group = state.groups.find(item => item.id === groupId);
  const lists = state.lists.filter(list => list.groupId === groupId);
  openDialog(`Move to ${group.name}`, `<p class="hint">Choose a list for this task. Its scheduled day stays the same.</p><div class="destination-lists">${lists.map(list => `<button class="destination-list" data-destination="${list.id}"><span>${escape(list.name)}</span><small>${state.tasks.filter(task => task.listId === list.id && !task.completed && !task.skipped).length} open tasks</small></button>`).join('')}</div><button class="secondary" id="create-destination">＋ New list</button>`, true);
  dialog.querySelectorAll('[data-destination]').forEach(button => {
    button.onclick = async () => {
      if (await commit(next => moveTask(next, taskId, `list:${button.dataset.destination}`), 'Task moved')) {
        activeGroup = groupId;
        render();
        dialog.close();
      }
    };
  });
  dialog.querySelector('#create-destination').onclick = () => simpleForm('New list', 'List name', '', async name => {
    const listId = uid();
    const saved = await commit(next => { next.lists.push({ id: listId, groupId, name }); moveTask(next, taskId, `list:${listId}`); }, 'Task moved to new list');
    if (saved) { activeGroup = groupId; render(); }
    return saved;
  });
}

function handleDragOver(event) {
  if (!dragging) return;
  clearDropMarkers();
  const scroller = event.target.closest('.shelf, .groups-bar');
  if (scroller) {
    const bounds = scroller.getBoundingClientRect();
    if (event.clientX < bounds.left + 45) scroller.scrollBy(-24, 0);
    if (event.clientX > bounds.right - 45) scroller.scrollBy(24, 0);
  }
  const target = dropTarget(event);
  if (!target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  if (target.id === dragging.id) return;
  if (target.type === 'task') {
    target.element.classList.add('drag-over');
    target.row?.classList.add(target.after ? 'drop-after' : 'drop-before');
  } else if (target.type === 'list' || (target.type === 'group' && dragging.type === 'group')) {
    target.element.classList.add(target.after ? 'drop-right' : 'drop-left');
  } else target.element.classList.add('drag-over');
}
// Accept quick drops as soon as the pointer enters a new target.
app.addEventListener('dragenter', handleDragOver);
app.addEventListener('dragover', handleDragOver);

app.addEventListener('drop', async event => {
  if (!dragging) return;
  event.preventDefault();
  const { type, id } = dragging;
  const target = dropTarget(event);
  endDrag();
  if (!target || target.id === id) return;
  if (type === 'task') {
    if (target.type === 'group') taskGroupDestination(id, target.id);
    else await commit(next => moveTask(next, id, target.location, target.id, target.after));
  } else if (type === 'group') {
    await commit(next => reorderItem(next.groups, id, target.id, target.after));
  } else if (target.type === 'group') {
    if (await commit(next => moveList(next, id, target.id), 'List moved')) { activeGroup = target.id; render(); }
  } else {
    await commit(next => moveList(next, id, activeGroup, target.id, target.after));
  }
});
app.addEventListener('dragend', endDrag);

document.querySelector('#import-file').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('Choose a backup smaller than 25 MB.');
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'daybook') throw new Error('Choose a Daybook JSON backup.');
    validateState(backup.state);
    confirmDelete('Restore this backup?', `Replace this planner with ${backup.state.tasks.filter(task => !task.skipped).length} tasks, ${backup.state.lists.length} lists, and ${backup.state.rules.length} recurring schedules from ${file.name}? A backup of your current data will be kept.`, () => commit(next => Object.assign(next, backup.state), 'Backup restored', { importing: true }));
  } catch (error) { toast(error.message); }
};

document.addEventListener('keydown', event => {
  if (!state) return;
  if (event.code === 'Space' && event.ctrlKey && event.altKey) { event.preventDefault(); captureDialog(); return; }
  if (event.key === 'Escape' && preferencesOpen && !dialog.open) { event.preventDefault(); closePreferences(); return; }
  const editing = event.target.matches('input, textarea, select, [contenteditable]');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchDialog(); return; }
  if (editing || dialog.open || preferences.contains(event.target)) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); history(event.shiftKey ? 'redo' : 'undo'); return; }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key.toLowerCase() === 'q') { event.preventDefault(); captureDialog(); return; }
  if (event.key.toLowerCase() === 't') navigate(addDays(todayKey(), state.settings.startYesterday ? -1 : 0));
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); app.querySelector('.new-task input')?.focus(); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') navigate(addDays(viewStart, event.key === 'ArrowLeft' ? -1 : 1));
  if (['1', '3', '5', '7'].includes(event.key)) commit(next => { next.settings.days = Number(event.key); });
});

dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
window.addEventListener('focus', () => { if (state && !dialog.open && !document.activeElement.matches('input,textarea,select')) refresh(); });
dialog.addEventListener('close', () => { if (state) refresh(); });
window.addEventListener('beforeunload', event => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state && !dialog.open) refresh(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
  if (state) syncPreferences(preferences, state.settings);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('.confetti-layer').forEach(layer => layer.remove());
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state?.settings.theme === 'system') render(); });
setInterval(() => { if (state && !document.hidden && !dialog.open && !document.activeElement.matches('input,textarea,select')) refresh(); }, 5000);

try {
  await initializeStorage();
  const result = await request('/api/state');
  state = result.state;
  revision = result.revision;
  viewStart = addDays(todayKey(), state.settings.startYesterday ? -1 : 0);
  observedToday = todayKey();
  render();
  if (new URL(location.href).searchParams.get('capture') === '1') { window.history.replaceState({}, '', location.pathname); captureDialog(); }
} catch (error) {
  app.innerHTML = `<div class="loading"><div><h2>Daybook couldn’t open</h2><p>${escape(error.message)}</p><p class="hint">${isCloud ? 'Check your connection and make sure you signed in with your approved email address.' : 'Start Daybook.command launches the local server. Reload this page once it’s running.'}</p><button class="primary" id="retry">Try again</button>${isCloud ? '<button class="secondary" data-action="sign-out">Sign out</button>' : ''}</div></div>`;
  document.querySelector('#retry').onclick = () => location.reload();
}
