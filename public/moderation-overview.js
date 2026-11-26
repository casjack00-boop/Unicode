(() => {
  const $ = id => document.getElementById(id);
  const status = $('mod-status'), content = $('mod-content');
  const date = value => new Date(value).toLocaleString('en-GB', { timeZone: 'America/Chicago' }) + ' CT';
  let generation = 0;
  const queues = [
    ['tickets', 'tickets_count', 'ticket_latest', 'open', t => `Ticket #${t.id} · ${t.subject} · ${t.status}`],
    ['reports', 'reports_count', 'report_latest', 'open', r => `Report #${r.id} · ${r.reason} · ${r.status}`],
    ['disputes', 'disputes_count', 'dispute_latest', 'open', d => `Dispute #${d.id} · ${d.title || 'Listing unavailable'} · ${d.status}`],
    ['accounts', 'suspended_count', 'account_latest', 'suspended', a => `Student #${a.user_id} · ${a.action === 'suspend' ? 'Suspended' : 'Reinstated'}`]
  ];
  function clear() {
    content.hidden = true;
    for (const [key,,,label] of queues) { $(key+'-count').textContent = '— '+label; $(key+'-latest').textContent = ''; }
  }
  async function load() {
    const current = ++generation;
    clear(); status.textContent = 'Loading moderation overview…';
    try {
      const response = await fetch('/api/reputation/moderation/summary', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load overview.');
      if (current !== generation) return;
      for (const [key,count,latest,label,describe] of queues) {
        $(key+'-count').textContent = `${data[count]} ${label}`;
        $(key+'-latest').textContent = data[latest] ? `Latest: ${describe(data[latest])} · ${date(data[latest].created_at)}` : 'No cases recorded yet.';
      }
      content.hidden = false; status.textContent = 'Select a section to view and manage its cases.';
    } catch (error) { if (current === generation) { clear(); status.textContent = error.message; } }
  }
  $('mod-refresh').addEventListener('click', load);
  window.addEventListener('pagehide', () => { generation++; clear(); });
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  load();
})();
