const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const glyphs = {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hidden: '<path d="m3 3 18 18M10 5h2c6.5 0 10 7 10 7a19 19 0 0 1-3 4M6 6a21 21 0 0 0-4 6s3.5 7 10 7a12 12 0 0 0 5-1M9 9a4 4 0 0 0 6 6"/>',
  plain: '<circle cx="12" cy="12" r="8"/><path d="m6 6 12 12"/>',
  circle: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  square: '<rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none"/>',
  indent: '<path d="M4 12h11m-4-4 4 4-4 4m8-10v12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>',
  system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  confetti: '<path d="m4 20 4-12 8 8-12 4Zm4-12 8 8M14 3v3m6 3-3 2m-7-6 2 2m7 9h2M15 7l2-3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  collapse: '<path d="m12 6-6 6 6 6m6-12-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${glyphs[name]}</svg>`;

export function mascotSVG(style) {
  const cat = style === 'cat';
  return `<svg viewBox="0 0 120 120" aria-hidden="true" class="mascot-art">
    <path d="M30 97q30-22 60 0v18H30Z" fill="${cat ? '#7e7ab9' : '#548c7a'}"/>
    ${cat ? '<path d="M28 48 21 9 51 29M69 29 99 9 92 48" fill="#efb56b" stroke="#654b43" stroke-width="3" stroke-linejoin="round"/><path d="m29 23 4 23 12-14m30 0 12 14 4-23" fill="#f2c3ba"/>' : '<path d="M28 28Q6 22 7 56q0 26 23 18m62-46q22-6 21 28 0 26-23 18" fill="#a87652" stroke="#654b43" stroke-width="3"/>'}
    <rect x="24" y="25" width="72" height="72" rx="31" fill="${cat ? '#efb56b' : '#e7c697'}" stroke="#654b43" stroke-width="3"/>
    ${cat ? '<path d="m48 27 5 12m7-13v12m12-11-5 12" stroke="#cc8b45" stroke-width="4" stroke-linecap="round"/>' : '<ellipse cx="77" cy="49" rx="15" ry="17" fill="#a87652"/>'}
    <path d="M38 55q5-7 10 0m24 0q5-7 10 0" fill="none" stroke="#45372f" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="60" cy="72" rx="20" ry="14" fill="#fff0d9"/>
    <path d="m55 66 5 5 5-5Z" fill="#654b43" stroke="#654b43" stroke-linejoin="round"/>
    <path d="M60 71v5m-9-1q4 7 9 1 5 6 9-1" fill="none" stroke="#654b43" stroke-width="2.5" stroke-linecap="round"/>
    ${cat ? '<path d="m15 65 23 3m-22 7 22-2m44-5 23-3m-23 8 22 2" stroke="#654b43" stroke-width="2" stroke-linecap="round"/>' : '<path d="M57 80v5q3 7 6 0v-5" fill="#db8e8a"/>'}
    <ellipse cx="27" cy="103" rx="12" ry="10" fill="${cat ? '#efb56b' : '#e7c697'}"/>
    <ellipse cx="93" cy="103" rx="12" ry="10" fill="${cat ? '#efb56b' : '#e7c697'}"/>
  </svg>`;
}

const choices = (key, label, options) => `<div class="preference-row"><span>${label}</span><div class="segments" role="group" aria-label="${label}">${options.map(([value, name, content]) => `<button type="button" data-preference="${key}" data-value="${escape(JSON.stringify(value))}" aria-label="${name}" title="${name}" aria-pressed="false">${content || name}</button>`).join('')}</div></div>`;

export function preferencesMarkup() {
  return `<header class="preferences-head"><h2>Preferences</h2><button class="preference-icon" data-action="close-preferences" aria-label="Close preferences" title="Close preferences (Esc)">${icon('close')}</button></header>
    <div class="preferences-scroll">
      <div class="accent-palette" role="group" aria-label="Accent colour">
        ${[['#852ce6', 'Purple'], ['#ed0c00', 'Red'], ['#e10061', 'Pink'], ['#ffcc00', 'Yellow'], ['#00cf58', 'Green'], ['#00d2a3', 'Mint'], ['#20252e', 'Graphite'], ['#2357dc', 'Blue'], ['#65c7ff', 'Sky']].map(([color, name]) => `<button class="accent-swatch" style="--swatch:${color}" data-preference="accent" data-value="${escape(JSON.stringify(color))}" aria-label="${name} accent" title="${name}" aria-pressed="false"><span aria-hidden="true">✓</span></button>`).join('')}
        <label class="custom-accent" title="Custom accent colour">${icon('plus')}<input type="color" data-setting="accent" aria-label="Custom accent colour"></label>
      </div>
      ${choices('days', 'Columns', [1, 3, 5, 7].map(n => [n, `${n} ${n === 1 ? 'column' : 'columns'}`, n]))}
      ${choices('size', 'Text size', [['small', 'Small text', 'S'], ['medium', 'Medium text', 'M'], ['large', 'Large text', 'L']])}
      ${choices('spacing', 'Spacing', [['compact', 'Compact spacing', 'S'], ['comfortable', 'Comfortable spacing', 'M'], ['relaxed', 'Relaxed spacing', 'L']])}
      ${choices('showCompleted', 'Completed tasks', [[true, 'Show completed tasks', icon('eye')], [false, 'Hide completed tasks', icon('hidden')]])}
      ${choices('bulletStyle', 'Bullet style', [['plain', 'No bullets', icon('plain')], ['circle', 'Circle bullets', icon('circle')], ['square', 'Square bullets', icon('square')], ['indent', 'Indented tasks', icon('indent')]])}
      ${choices('startYesterday', 'Start on', [[false, 'Today'], [true, 'Yesterday']])}
      ${choices('lines', 'Lines', [[true, 'Show lines', icon('eye')], [false, 'Hide lines', icon('hidden')]])}
      ${choices('theme', 'Display', [['light', 'Light', `${icon('sun')}<span>Light</span>`], ['dark', 'Dark', `${icon('moon')}<span>Dark</span>`], ['system', 'System display', icon('system')]])}
      <section class="celebration-settings" aria-label="Completion celebrations">
        <label class="preference-row" for="celebrations"><span>Celebrations</span><input class="switch" id="celebrations" type="checkbox" data-setting="celebrations" role="switch"></label>
        <fieldset class="celebration-choices"><legend class="sr-only">Celebration style</legend>
          ${[['confetti', 'Confetti'], ['cat', 'Cat'], ['dog', 'Dog']].map(([value, name]) => `<label><input type="radio" name="celebration-style" data-setting="celebrationStyle" value="${value}"><span>${value === 'confetti' ? icon('confetti') : mascotSVG(value)}${name}</span></label>`).join('')}
        </fieldset>
        <button class="preview-celebration" data-action="preview-celebration">Preview celebration</button>
        <p class="motion-note" hidden>Animations are off while Reduce Motion is enabled on your Mac.</p>
      </section>
      <section class="local-preferences" aria-label="Daybook preferences">
        <h3>Your day</h3>
        <label class="preference-row" for="auto-rollover"><span>Auto-rollover</span><input class="switch" id="auto-rollover" type="checkbox" data-setting="autoRollover" role="switch"></label>
        <p>Carry unfinished tasks into today. Runs when the day changes or you reopen Daybook.</p>
        <button class="preferences-link" data-action="data">Backups & import</button>
        <button class="preferences-link" data-action="help">Shortcuts & help</button>
      </section>
    </div>
    <footer class="preferences-foot"><button class="preference-icon" data-action="close-preferences" aria-label="Collapse preferences">${icon('collapse')}</button><span class="preferences-status" role="status" aria-live="polite">Saved on this Mac</span></footer>`;
}

export function syncPreferences(panel, settings) {
  if (panel.hidden) return;
  const s = { bulletStyle: 'plain', celebrationStyle: 'confetti', celebrations: true, ...settings };
  panel.querySelectorAll('[data-preference]').forEach(button => {
    const selected = JSON.parse(button.dataset.value) === s[button.dataset.preference];
    button.setAttribute('aria-pressed', String(selected));
  });
  panel.querySelectorAll('[data-setting]').forEach(input => {
    const value = s[input.dataset.setting];
    if (input.type === 'checkbox') input.checked = value;
    else if (input.type === 'radio') input.checked = input.value === value;
    else if (document.activeElement !== input) input.value = value;
  });
  const custom = panel.querySelector('.custom-accent');
  custom.style.background = s.accent;
  custom.style.color = 'var(--accent-ink)';
  custom.classList.toggle('selected', !panel.querySelector('.accent-swatch[aria-pressed="true"]'));
  panel.querySelector('.celebration-choices').disabled = !s.celebrations;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.querySelector('[data-action="preview-celebration"]').disabled = !s.celebrations || reducedMotion;
  panel.querySelector('.motion-note').hidden = !reducedMotion;
}
