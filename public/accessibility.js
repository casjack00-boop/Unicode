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

    const panel = document.createElement('details');
    panel.className = 'a11y-settings';
    panel.innerHTML = `
      <summary>Accessibility &amp; appearance</summary>
      <div class="a11y-options">
        <label for="a11y-theme">Appearance</label>
        <select id="a11y-theme"><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select>
        <label for="a11y-size">Text size</label>
        <select id="a11y-size"><option value="default">Default</option><option value="large">Large (125%)</option><option value="extra">Extra large (150%)</option></select>
        <label class="a11y-check"><input id="a11y-contrast" type="checkbox"> High contrast</label>
        <label class="a11y-check"><input id="a11y-motion" type="checkbox"> Reduce motion</label>
        <button type="button" id="a11y-reset">Reset preferences</button>
        <p id="a11y-status" role="status"></p>
      </div>`;
    const host = document.querySelector('.app');
    if (host && host !== main) host.prepend(panel);
    else if (host === main) main.before(panel);
    else document.body.insertBefore(panel, skip.nextSibling);
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
    window.addEventListener('pageshow', () => { settings = read(); sync(); });
    sync();
  });
})();
