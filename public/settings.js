// Account actions are only available to an authenticated student.
(() => {
  'use strict';
  const section = document.getElementById('account-session');
  const logout = document.getElementById('logout');
  const status = document.getElementById('logout-status');
  let loggingOut = false;
  async function checkSession() {
    section.hidden = true;
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (response.ok && (await response.json()).user && !loggingOut) section.hidden = false;
    } catch (_) { /* Appearance settings remain available without a session. */ }
  }
  logout.addEventListener('click', async () => {
    if (loggingOut) return;
    loggingOut = true;
    logout.disabled = true;
    status.textContent = 'Logging out…';
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to log out. Please try again.');
      section.hidden = true;
      location.replace('/login.html');
    } catch (_) {
      status.textContent = 'Unable to log out. Please try again.';
    } finally {
      loggingOut = false;
      logout.disabled = false;
    }
  });
  checkSession();
  window.addEventListener('pageshow', event => {
    if (event.persisted) { status.textContent = ''; checkSession(); }
  });
})();
