/* Shared, device-local appearance preferences. No account data is stored. */
(() => {
  'use strict';
  const key = 'unimarket.appearance.v1';
  const defaults = { theme: 'system', size: 'default', contrast: false, motion: false };
  const root = document.documentElement;
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  let settings = { ...defaults };
  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      if (!saved || typeof saved !== 'object') return { ...defaults };
      return {
        theme: ['system', 'light', 'dark'].includes(saved.theme) ? saved.theme : defaults.theme,
        size: ['default', 'large', 'extra'].includes(saved.size) ? saved.size : defaults.size,
        contrast: saved.contrast === true, motion: saved.motion === true
      };
    } catch (_) { return { ...defaults }; }
  }
  function apply() {
    root.dataset.theme = settings.theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : settings.theme;
    root.dataset.textSize = settings.size;
    root.dataset.contrast = settings.contrast ? 'high' : 'normal';
    root.dataset.reduceMotion = String(settings.motion);
  }
  settings = read();
  apply(); // before rendering the body
  systemDark.addEventListener('change', apply);
  function refreshPreferences() { settings = read(); apply(); }
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) refreshPreferences();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) refreshPreferences();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('main');
    if (!main) return;
    main.id ||= 'main-content';
    main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.className = 'a11y-skip';
    skip.href = '#' + main.id;
    skip.textContent = 'Skip to main content';
    skip.addEventListener('click', event => {
      event.preventDefault();
      main.focus();
      main.scrollIntoView({ block: 'start' });
    });
    document.body.prepend(skip);

    const panel = document.querySelector('[data-appearance-settings]');
    if (!panel) return;
    const from = new URLSearchParams(location.search).get('from');
    const destinations = new Map([
      ['profile', ['/profile.html', 'Back to profile']],
      ['browse', ['/browse.html', 'Back to browse']],
      ['login', ['/login.html', 'Back to login']],
      ['home', ['/', 'Back to home']]
    ]);
    const destination = destinations.get(from);
    if (destination) {
      const back = document.getElementById('settings-back');
      back.href = destination[0];
      back.setAttribute('aria-label', destination[1]);
      back.title = destination[1];
    }
    const theme = panel.querySelector('#a11y-theme');
    const size = panel.querySelector('#a11y-size');
    const contrast = panel.querySelector('#a11y-contrast');
    const motion = panel.querySelector('#a11y-motion');
    const status = panel.querySelector('#a11y-status');
    function sync() {
      theme.value = settings.theme; size.value = settings.size;
      contrast.checked = settings.contrast; motion.checked = settings.motion;
      apply();
    }
    function save() {
      sync();
      try { localStorage.setItem(key, JSON.stringify(settings)); status.textContent = 'Preferences saved on this device.'; }
      catch (_) { status.textContent = 'Preferences applied for this page; storage is unavailable.'; }
    }
    panel.addEventListener('change', () => {
      settings = { theme: theme.value, size: size.value, contrast: contrast.checked, motion: motion.checked };
      save();
    });
    panel.querySelector('#a11y-reset').addEventListener('click', () => { settings = { ...defaults }; save(); });
    window.addEventListener('storage', event => { if (event.key === key || event.key === null) { settings = read(); sync(); } });
    window.addEventListener('pageshow', event => { if (event.persisted) { settings = read(); sync(); } });
    sync();
  });
})();
