const el = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let conversationId = params.get('id');
const listingId = params.get('listing');
let conversations = [];
let refreshPromise = null;
let stopped = false;
let sending = false;
let timer;
let historySignature = null;

async function api(path, options = {}) {
  const response = await fetch('/api/messages' + path, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Messaging is unavailable.');
    error.status = response.status;
    throw error;
  }
  return data;
}
function json(method, body) { return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function status(text, error = false) {
  el('message-status').textContent = text;
  el('message-status').classList.toggle('is-error', error);
  el('message-status').hidden = !text;
}
function handleError(error) {
  status(error.message || 'Unable to connect. Try refreshing.', true);
  if (error.status === 401 || error.status === 404) {
    stopped = true;
    clearInterval(timer);
    el('inbox').hidden = true;
    el('chat').hidden = true;
    el('search-box').hidden = true;
    el('login-link').hidden = error.status !== 401;
  }
}
function element(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function formatPrice(cents) { return cents === 0 ? 'Free' : '$' + (cents / 100).toFixed(2); }
function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(s => s.charAt(0).toUpperCase()).join(''); }
function timestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString() === new Date().toLocaleDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function renderInbox() {
  const query = el('conversation-search').value.trim().toLowerCase();
  const list = el('conversation-list');
  const rows = conversations.filter(c => [c.other_name, c.listing_title, c.last_message].some(s => String(s || '').toLowerCase().includes(query)));
  list.replaceChildren();
  if (!rows.length) {
    list.append(element('p', 'empty', query ? 'No matching conversations.' : 'No conversations yet. Open a listing and tap Message seller to start.'));
    return;
  }
  for (const c of rows) {
    const link = element('a', 'conversation' + (c.unread_count ? ' unread-thread' : ''));
    link.href = '/messages.html?id=' + encodeURIComponent(c.id);
    const copy = element('div', 'conversation-copy');
    copy.append(element('strong', '', c.other_name), element('span', 'conversation-item', c.listing_title + ' · ' + formatPrice(c.price_cents)), element('span', 'preview', c.last_message || 'No messages yet'));
    const meta = element('div', 'conversation-meta');
    meta.append(element('span', '', timestamp(c.last_at)));
    if (c.unread_count) meta.append(element('span', 'unread', c.unread_count + ' unread'));
    link.append(element('div', 'chat-avatar', initials(c.other_name)), copy, meta);
    list.append(link);
  }
}
async function refreshInbox() {
  const data = await api('/conversations');
  const changed = JSON.stringify(data.conversations) !== JSON.stringify(conversations);
  conversations = data.conversations;
  if (changed || el('inbox').hidden) renderInbox();
  el('inbox').hidden = false;
  el('search-box').hidden = false;
  status('');
}
function renderHistory(data) {
  const history = el('message-history');
  // Read status changes do not require replacing the displayed bubbles.
  const signature = data.messages.map(m => m.id).join(',');
  if (signature === historySignature) return;
  const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 90;
  const first = historySignature === null;
  historySignature = signature;
  const oldScroll = history.scrollTop;
  history.replaceChildren();
  if (!data.messages.length) history.append(element('p', 'empty', 'Start the conversation with a friendly message.'));
  for (const m of data.messages) {
    const row = element('div', 'bubble-row' + (m.sender_id === data.user_id ? ' mine' : ''));
    row.append(element('div', 'bubble', m.body), element('span', 'bubble-time', timestamp(m.created_at)));
    history.append(row);
  }
  if (first || atBottom) history.scrollTop = history.scrollHeight;
  else history.scrollTop = oldScroll;
}
async function refreshChat() {
  const data = await api('/conversations/' + encodeURIComponent(conversationId));
  const c = data.conversation;
  el('page-title').textContent = c.other_name;
  el('other-profile').textContent = c.other_verified ? '✓ Verified student · View profile' : 'View profile';
  el('other-profile').href = '/profile.html?id=' + encodeURIComponent(c.other_id);
  el('other-profile').hidden = false;
  el('listing-title').textContent = c.listing_title;
  el('listing-info').textContent = formatPrice(c.price_cents) + (c.listing_status !== 'active' ? ' · ' + c.listing_status : '');
  el('listing-link').href = '/item.html?id=' + encodeURIComponent(c.listing_id);
  el('listing-link').hidden = c.listing_status !== 'active';
  el('chat').hidden = false;
  status('');
  renderHistory(data);
  if (!document.hidden && data.messages.some(m => m.sender_id !== data.user_id && !m.read_at)) {
    await api('/conversations/' + encodeURIComponent(conversationId) + '/read', json('PATCH', { through_id: data.messages[data.messages.length - 1].id }));
  }
}
function refresh() {
  if (stopped || sending || document.hidden) return;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try { if (conversationId) await refreshChat(); else await refreshInbox(); }
    catch (err) { handleError(err); }
    finally { refreshPromise = null; }
  })();
  return refreshPromise;
}
el('conversation-search').addEventListener('input', renderInbox);
el('message-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || stopped || !conversationId) return;
  const input = el('message-input');
  const body = input.value.trim();
  if (!body) return;
  sending = true;
  el('send-button').disabled = true;
  input.disabled = true;
  try {
    if (refreshPromise) await refreshPromise;
    if (stopped) return;
    await api('/conversations/' + encodeURIComponent(conversationId), json('POST', { body }));
    input.value = '';
    status('');
    await refreshChat();
    el('message-history').scrollTop = el('message-history').scrollHeight;
  } catch (err) { handleError(err); }
  finally { sending = false; el('send-button').disabled = false; input.disabled = false; input.focus(); }
});
async function start() {
  try {
    if (listingId && !conversationId) {
      const data = await api('/conversations', json('POST', { listing_id: listingId }));
      conversationId = String(data.id);
      history.replaceState(null, '', '/messages.html?id=' + encodeURIComponent(conversationId));
    }
    if (conversationId) {
      document.querySelector('.messaging-app').classList.add('chat-mode');
      document.querySelector('.bottom-nav').hidden = true;
      el('back-inbox').hidden = false;
    }
    // Create the timer before the first refresh so terminal errors can stop it.
    timer = setInterval(refresh, 4000);
    await refresh();
    document.addEventListener('visibilitychange', refresh);
  } catch (err) { handleError(err); }
}
start();
