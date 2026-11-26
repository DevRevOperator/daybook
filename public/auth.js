// OAuth returns to the repository root, which must match Supabase's redirect allowlist.
export function signInRedirect(href) {
  return new URL('./', href).href;
}

export function callbackError(href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const read = key => url.searchParams.get(key) || hash.get(key);
  if (!read('error') && !read('error_code') && !read('error_description')) return null;
  return { code: read('error_code') || read('error'), message: read('error_description') || '' };
}

export function clearAuthCallback(href) {
  const url = new URL(href);
  for (const key of ['code', 'error', 'error_code', 'error_description', 'sb_flow_id']) url.searchParams.delete(key);
  if (/^#(?:.*&)?(?:error|error_code|error_description|access_token)=/.test(url.hash)) url.hash = '';
  return url.href;
}

export function signInError(error) {
  const code = error?.code || error?.details?.code || error?.details?.error;
  if (['signup_disabled', 'user_banned', 'email_not_confirmed'].includes(code)) {
    return 'This Google account isn’t approved for Daybook. Try again with your approved account.';
  }
  if (code === 'access_denied') return 'Google sign-in wasn’t completed. You can try again below.';
  if (['bad_code_verifier', 'flow_state_not_found', 'flow_state_expired'].includes(code)) {
    return 'This sign-in attempt expired. Start again below and finish in this browser.';
  }
  // Avoid rendering raw provider messages or URL parameters in the sign-in page.
  return 'We couldn’t finish signing in. Check your connection and try again with your approved Google account.';
}
