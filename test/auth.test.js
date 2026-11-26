import test from 'node:test';
import assert from 'node:assert/strict';
import { signInRedirect, callbackError, clearAuthCallback, signInError } from '../public/auth.js';

test('OAuth redirect stays at the Pages repository root without untrusted parameters', () => {
  assert.equal(signInRedirect('https://owner.github.io/daybook/?capture=1&next=https://elsewhere.example/#error=test'), 'https://owner.github.io/daybook/');
  assert.equal(signInRedirect('https://owner.github.io/daybook/index.html'), 'https://owner.github.io/daybook/');
});

test('OAuth denial works in query and fragment and offers the right retry', () => {
  for (const separator of ['?', '#']) {
    const error = callbackError(`https://owner.github.io/daybook/${separator}error=access_denied&error_code=signup_disabled&error_description=Private+message`);
    assert.equal(error.code, 'signup_disabled');
    assert.match(signInError(error), /isn’t approved/);
    assert.doesNotMatch(signInError(error), /Private message/);
  }
  assert.equal(callbackError('https://owner.github.io/daybook/?capture=1'), null);
  assert.match(signInError({ code: 'flow_state_expired' }), /expired/);
  assert.match(signInError({ code: 'access_denied' }), /wasn’t completed/);
});

test('callback cleanup removes credentials and errors while retaining quick capture', () => {
  assert.equal(clearAuthCallback('https://owner.github.io/daybook/?capture=1&code=one-time-code&error_code=bad&sb_flow_id=flow#unrelated'), 'https://owner.github.io/daybook/?capture=1#unrelated');
  assert.equal(clearAuthCallback('https://owner.github.io/daybook/#error=access_denied&error_description=private'), 'https://owner.github.io/daybook/');
  assert.equal(clearAuthCallback('https://owner.github.io/daybook/#access_token=secret&refresh_token=secret'), 'https://owner.github.io/daybook/');
});
