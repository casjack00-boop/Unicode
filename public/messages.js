const el = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let conversationId = params.get('id');
const listingId = params.get('listing');
let conversations = [];
let refreshPromise = null;
let stopped = false;
let sending = false;
let contactBlocked = false;
let timer;
let historySignature = null;
let replyTarget = null;
let actionTarget = null;
let actionTrigger = null;
let reportTarget = null;
let reportSending = false;
let toastTimer;
const actionMenu = el('message-actions');
const reportDialog = el('report-dialog');

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
function showToast(text, success = true) {
  const toast = el('copy-toast');
  clearTimeout(toastTimer);
  toast.querySelector('span').textContent = text;
  toast.classList.toggle('toast-error', !success);
  toast.classList.add('visible');
  toastTimer = setTimeout(() => { toast.classList.remove('visible'); toast.querySelector('span').textContent = ''; }, 2000);
}
function closeActions(restoreFocus = false) {
  const trigger = actionTrigger;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  actionMenu.hidden = true;
  actionTarget = null;
  actionTrigger = null;
  if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
}
function openActions(trigger, message, mine, senderName) {
  if (actionTrigger === trigger) { closeActions(true); return; }
  closeActions();
  actionTarget = { message, mine, senderName };
  actionTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  actionMenu.querySelector('[data-action="report"]').hidden = mine;
  actionMenu.querySelector('[data-action="reply"]').disabled = contactBlocked;
  actionMenu.hidden = false;
  const rect = trigger.getBoundingClientRect();
  const width = actionMenu.offsetWidth, height = actionMenu.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - width - 8, mine ? rect.left : rect.right - width));
  const top = rect.bottom + height + 8 <= innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - height - 4);
  actionMenu.style.left = left + 'px';
  actionMenu.style.top = top + 'px';
  actionMenu.querySelector('button').focus({ preventScroll: true });
}
function clearReply() {
  replyTarget = null;
  el('reply-preview').hidden = true;
  el('reply-author').textContent = '';
  el('reply-excerpt').textContent = '';
}
function selectReply(target) {
  if (contactBlocked) return;
  replyTarget = target.message.id;
  el('reply-author').textContent = 'Replying to ' + target.senderName;
  el('reply-excerpt').textContent = target.message.body;
  el('reply-preview').hidden = false;
  el('message-input').focus();
}
async function copyMessage(body) {
  try {
    await navigator.clipboard.writeText(body);
    showToast('Copied to clipboard');
  } catch (_) { showToast('Could not copy. Select the message text to copy it.', false); }
}
actionMenu.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled || !actionTarget) return;
  const target = actionTarget;
  closeActions(true);
  if (button.dataset.action === 'copy') copyMessage(target.message.body);
  else if (button.dataset.action === 'reply') selectReply(target);
  else if (button.dataset.action === 'report' && !target.mine) {
    reportTarget = target.message.id;
    el('message-report-form').reset();
    el('report-excerpt').textContent = target.message.body;
    el('message-report-status').textContent = '';
    reportDialog.showModal();
    el('cancel-report').focus();
  }
});
document.addEventListener('click', event => {
  if (!actionMenu.hidden && !actionMenu.contains(event.target) && !actionTrigger?.contains(event.target)) closeActions();
});
document.addEventListener('keydown', event => {
  if (!actionMenu.hidden && event.key === 'Escape') { event.preventDefault(); closeActions(true); }
});
actionMenu.addEventListener('focusout', event => {
  if (event.relatedTarget && !actionMenu.contains(event.relatedTarget)) closeActions();
});
el('message-history').addEventListener('scroll', () => closeActions(), { passive: true });
window.addEventListener('resize', () => closeActions());
el('cancel-reply').addEventListener('click', () => { clearReply(); el('message-input').focus(); });
el('cancel-report').addEventListener('click', () => { if (!reportSending) reportDialog.close(); });
reportDialog.addEventListener('cancel', event => { if (reportSending) event.preventDefault(); });
reportDialog.addEventListener('close', () => { reportTarget = null; el('report-excerpt').textContent = ''; });
el('message-report-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (reportSending || reportTarget === null) return;
  reportSending = true;
  el('confirm-report').disabled = el('cancel-report').disabled = true;
  el('message-report-status').textContent = '';
  try {
    const response = await fetch('/api/safety/reports', json('POST', { type: 'message', id: reportTarget, reason: el('message-report-reason').value, details: el('message-report-details').value }));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not submit report.');
    reportDialog.close();
    showToast('Report submitted. Reference #' + result.id);
  } catch (error) { el('message-report-status').textContent = error.message || 'Could not submit report.'; }
  finally { reportSending = false; el('confirm-report').disabled = el('cancel-report').disabled = false; }
});
function renderHistory(data) {
  const history = el('message-history');
  // Read status changes do not require replacing the displayed bubbles.
  const signature = data.messages.map(m => m.id).join(',');
  if (signature === historySignature || !actionMenu.hidden || reportDialog.open) return;
  const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 90;
  const first = historySignature === null;
  historySignature = signature;
  const oldScroll = history.scrollTop;
  history.replaceChildren();
  if (!data.messages.length) history.append(element('p', 'empty', 'Start the conversation with a friendly message.'));
  for (const m of data.messages) {
    const mine = m.sender_id === data.user_id;
    const senderName = mine ? 'yourself' : data.conversation.other_name;
    const row = element('div', 'bubble-row' + (mine ? ' mine' : ''));
    const speaker = element('span', 'sr-only', mine ? 'You: ' : 'Other student: ');
    const line = element('div', 'bubble-line');
    const bubble = element('div', 'bubble');
    if (m.reply_to_id && m.reply_body != null) {
      const quote = element('blockquote', 'bubble-quote');
      quote.append(element('strong', '', m.reply_sender_id === data.user_id ? 'You' : data.conversation.other_name), element('span', '', m.reply_body));
      bubble.append(quote);
    }
    bubble.append(element('span', 'bubble-body', m.body));
    const trigger = element('button', 'message-more');
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'More actions for ' + (mine ? 'your' : 'received') + ' message: ' + m.body.slice(0, 60));
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'message-actions');
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
    trigger.addEventListener('click', () => openActions(trigger, m, mine, senderName));
    line.append(bubble, trigger);
    row.append(speaker, line, element('span', 'bubble-time', timestamp(m.created_at)));
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
  contactBlocked = Boolean(c.contact_blocked);
  if (contactBlocked) { clearReply(); closeActions(); }
  el('chat-safety').href = '/safety.html?user=' + encodeURIComponent(c.other_id);
  el('chat-safety').hidden = false;
  el('chat-blocked').hidden = !contactBlocked;
  el('message-form').hidden = contactBlocked;
  if (!sending) { el('send-button').disabled = contactBlocked; el('message-input').disabled = contactBlocked; }
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
  if (sending || stopped || contactBlocked || !conversationId) return;
  const input = el('message-input');
  const body = input.value.trim();
  if (!body) return;
  sending = true;
  el('send-button').disabled = true;
  input.disabled = true;
  try {
    if (refreshPromise) await refreshPromise;
    if (stopped) return;
    await api('/conversations/' + encodeURIComponent(conversationId), json('POST', { body, reply_to_id: replyTarget }));
    input.value = '';
    clearReply();
    status('');
    await refreshChat();
    el('message-history').scrollTop = el('message-history').scrollHeight;
  } catch (err) { handleError(err); }
  finally { sending = false; el('send-button').disabled = contactBlocked; input.disabled = contactBlocked; if (!contactBlocked) input.focus(); }
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
