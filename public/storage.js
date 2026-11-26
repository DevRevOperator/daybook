import config from './config.js';
import { CloudStore } from './cloud-store.js';

export const isCloud = config.mode === 'cloud';
let client;
let store;
let user;
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const currentUser = () => user;
export const captureDraftKey = () => isCloud ? `daybook.captureDraft.${user?.id || 'signed-out'}` : 'daybook.captureDraft';

export async function initializeStorage() {
  if (!isCloud) return;
  if (!config.supabaseUrl || !config.publishableKey) throw new Error('Cloud setup is incomplete. Configure the Supabase project before deploying.');
  const { createClient } = await import('./vendor/supabase.js');
  client = createClient(config.supabaseUrl, config.publishableKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: `daybook.auth.${new URL(config.supabaseUrl).hostname}` } });
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  let session = data.session;
  if (!session) session = await showSignIn();
  user = session.user;
  store = new CloudStore(client);
  // Never keep the previous user's tasks visible after signing out or switching accounts.
  client.auth.onAuthStateChange((event, next) => {
    if (event === 'SIGNED_OUT' || (next?.user && next.user.id !== user.id)) location.reload();
  });
}

function showSignIn() {
  const app = document.querySelector('#app');
  app.innerHTML = `<main class="auth-page"><section class="auth-card"><span class="auth-brand">DAYBOOK</span><h1>A little space for your day.</h1><p>This is a private planner. Sign in with your approved email.</p><form id="cloud-sign-in"><label class="field"><span>Email address</span><input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label><button class="primary" type="submit">Email me a sign-in link</button></form><p class="auth-message" role="status" aria-live="polite"></p><p class="hint">Open the link in this browser to finish signing in. New accounts cannot register here.</p></section></main>`;
  return new Promise(resolve => {
    const form = app.querySelector('form');
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('button'), status = app.querySelector('.auth-message');
      button.disabled = true;status.textContent = 'Sending your sign-in link…';
      const redirect = new URL('./', location.href);redirect.search = '';redirect.hash = '';
      try {
        const { error } = await client.auth.signInWithOtp({ email: form.elements.email.value.trim(), options: { shouldCreateUser: false, emailRedirectTo: redirect.href } });
        if (error) throw error;
        status.textContent = 'Check your email. Your sign-in link is on its way.';
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (session) { subscription.unsubscribe();resolve(session); }
    });
  });
}

export async function plannerFetch(path, options) {
  if (!isCloud) return fetch(path, options);
  if (!store) throw new Error('Sign in to open your planner.');
  const { status, body } = await store.handle(path, options);
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
  location.reload();
}

export function accountLabel() { return escape(user?.email || 'Your account'); }
