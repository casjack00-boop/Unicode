/* Installation is user-initiated; never interrupt browsing with a prompt. */
(() => {
  'use strict';
  let installEvent = null;
  const panels = [...document.querySelectorAll('[data-install-panel]')];
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const installed = () => displayMode.matches || navigator.standalone === true;
  function render() {
    for (const panel of panels) {
      const button = panel.querySelector('[data-install-button]');
      const status = panel.querySelector('[data-install-status]');
      const help = panel.querySelector('[data-install-help]');
      const standalone = installed();
      button.hidden = standalone || !installEvent;
      if (help) help.hidden = standalone;
      status.textContent = standalone ? 'UniMarket is running as an installed app.' : !window.isSecureContext ? 'Installation requires HTTPS (localhost is supported for development).' : installEvent ? 'Install UniMarket for quick access from your home screen or desktop.' : 'Use the installation option in your browser, if supported.';
    }
  }
  document.querySelectorAll('[data-site-address]').forEach(el => { el.textContent = location.origin; });
  // Only defer the native prompt on pages which provide an install button.
  window.addEventListener('beforeinstallprompt', event => {
    if (!panels.length) return;
    event.preventDefault();
    installEvent = event;
    render();
  });
  for (const panel of panels) {
    const button = panel.querySelector('[data-install-button]');
    button.addEventListener('click', async () => {
      const prompt = installEvent;
      if (!prompt) return;
      installEvent = null;
      button.disabled = true;
      try { await prompt.prompt(); await prompt.userChoice; }
      catch (_) { /* Browser may decline or revoke a prompt. */ }
      finally { button.disabled = false; render(); }
    });
  }
  window.addEventListener('appinstalled', () => { installEvent = null; render(); for (const panel of panels) panel.querySelector('[data-install-status]').textContent = 'UniMarket installed. Open it from your home screen or app menu.'; });
  if (displayMode.addEventListener) displayMode.addEventListener('change', render);
  render();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline fallback registration failed:', error));
  }
})();
