import { addDays, newState, maintain, validateState, upgradeState, dateInTimeZone } from './model.js';

export class CloudStore {
  constructor(client, { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, now = () => new Date() } = {}) {
    this.client = client;
    this.timeZone = timeZone;
    this.now = now;
  }

  async rpc(name, args = {}) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) {
      const failure = new Error(error.code === '42501' ? 'This account does not have access to this planner.' : error.message || 'Unable to reach your cloud planner. Try again.');
      failure.status = error.code === '42501' ? 403 : 503;
      throw failure;
    }
    return data;
  }

  prepare(state, through) {
    const next = structuredClone(state);
    upgradeState(next);
    next.settings.timeZone ||= this.timeZone;
    const today = dateInTimeZone(this.now(), next.settings.timeZone);
    const horizon = through && through > addDays(today, 35) ? through : addDays(today, 35);
    maintain(next, today, horizon);
    validateState(next);
    return next;
  }

  async load(through) {
    // Maintenance is revision checked too: two devices cannot duplicate rollover.
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await this.rpc('daybook_load');
      const initial = current.state || newState(dateInTimeZone(this.now(), this.timeZone));
      const next = this.prepare(initial, through);
      if (current.state && JSON.stringify(next) === JSON.stringify(current.state)) return current;
      const saved = await this.rpc('daybook_save', { expected_revision: current.revision, next_state: next, reason: 'maintenance' });
      if (!saved.conflict) return saved;
    }
    throw new Error('Your planner is changing on another device. Try again in a moment.');
  }

  async handle(path, options = {}) {
    const url = new URL(path, 'https://daybook.invalid');
    const method = options.method || 'GET';
    const through = url.searchParams.get('through');
    try {
      if (url.pathname === '/api/state' && method === 'GET') return { status: 200, body: await this.load(through) };
      if (url.pathname === '/api/state' && method === 'PUT') {
        const input = JSON.parse(options.body);
        const next = this.prepare(input.state, through);
        const result = await this.rpc('daybook_save', { expected_revision: input.revision, next_state: next, reason: input.importing ? 'before-import' : 'edit' });
        return { status: result.conflict ? 409 : 200, body: result.conflict ? { ...result, error: 'Your planner changed on another device. Please try this change again.' } : result };
      }
      if (url.pathname === '/api/capture' && method === 'POST') {
        const input = JSON.parse(options.body);
        await this.load(through);
        const result = await this.rpc('daybook_capture', { capture_id: input.id, capture_title: input.title, capture_notes: input.notes || '' });
        return { status: result.created ? 201 : 200, body: result };
      }
      if (url.pathname === '/api/export') return { status: 200, body: { format: 'daybook', exportedAt: this.now().toISOString(), ...await this.load(through) } };
      if (url.pathname === '/api/backups') return { status: 200, body: await this.rpc('daybook_list_backups') };
      if (url.pathname.startsWith('/api/backups/')) return { status: 200, body: { format: 'daybook', ...await this.rpc('daybook_get_backup', { backup_id: Number(url.pathname.split('/').pop()) }) } };
      if (url.pathname === '/api/companion') return { status: 200, body: { active: false, cloud: true } };
      return { status: 404, body: { error: 'Unknown planner action.' } };
    } catch (error) {
      return { status: error.status || 400, body: { error: error.message } };
    }
  }
}
