import config from './config.js';
import { CloudStore } from './cloud-store.js';
import { signInRedirect, callbackError, clearAuthCallback, signInError } from './auth.js';

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
  const redirectError = callbackError(location.href);
  const { createClient } = await import('./vendor/supabase.js');
  client = createClient(config.supabaseUrl, config.publishableKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: `daybook.auth.${new URL(config.supabaseUrl).hostname}` } });
  // The browser SDK exchanges the PKCE code during initialization, including on Pages.
  const { error: initializationError } = await client.auth.initialize();
  history.replaceState(history.state, '', clearAuthCallback(location.href));
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  let session = data.session;
  if (!session) session = await showSignIn(redirectError || initializationError);
  user = session.user;
  store = new CloudStore(client);
  if (sessionStorage.getItem('daybook.captureAfterSignIn') === '1') {
    sessionStorage.removeItem('daybook.captureAfterSignIn');
    const url = new URL(location.href); url.searchParams.set('capture', '1');
    history.replaceState(history.state, '', url);
  }
  // Never keep the previous user's tasks visible after signing out or switching accounts.
  client.auth.onAuthStateChange((event, next) => {
    if (event === 'SIGNED_OUT' || (next?.user && next.user.id !== user.id)) location.reload();
  });
}

function showSignIn(initialError) {
  const app = document.querySelector('#app');
  app.innerHTML = `<main class="auth-page"><section class="auth-card"><span class="auth-brand">DAYBOOK</span><h1>A little space for your day.</h1><p>Your tasks, lists, and a little room to think.<br>Sign in with your approved Google account.</p><button class="google-sign-in" id="cloud-sign-in" type="button"><svg aria-hidden="true" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.85 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg><span>Continue with Google</span></button><p class="auth-message" role="status" aria-live="polite"></p><p class="hint">A private planner. Access is limited to the approved account.</p></section></main>`;
  const button = app.querySelector('#cloud-sign-in'), status = app.querySelector('.auth-message');
  if (initialError) status.textContent = signInError(initialError);
  return new Promise(resolve => {
    button.onclick = async () => {
      button.disabled = true; status.textContent = 'Opening Google…';
      try {
        if (new URL(location.href).searchParams.get('capture') === '1') sessionStorage.setItem('daybook.captureAfterSignIn', '1');
        const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: signInRedirect(location.href), queryParams: { prompt: 'select_account' } } });
        if (error) throw error;
      } catch (error) { status.textContent = signInError(error); button.disabled = false; }
    };
    const resetButton = () => { button.disabled = false; status.textContent = ''; };
    window.addEventListener('pageshow', resetButton);
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (session) {
        window.removeEventListener('pageshow', resetButton);
        queueMicrotask(() => subscription.unsubscribe());
        resolve(session);
      }
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
