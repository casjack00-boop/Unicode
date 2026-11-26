// Profile view: /profile.html for your account, /profile.html?id=2 for a seller.
const el = (id) => document.getElementById(id);
const viewedId = new URLSearchParams(location.search).get('id');
let ownProfile = viewedId === null;
let profileGeneration = 0;
let currentUser;

async function api(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = response.status;
    throw err;
  }
  return data;
}

function showUser(user) {
  currentUser = user;
  el('name').textContent = user.display_name;
  showAccountId();
  el('avatar').textContent = user.display_name.trim().split(/\s+/).slice(0, 2).map(s => s.charAt(0).toUpperCase()).join('');
  el('housing').textContent = ({ on_campus: 'On campus', off_campus: 'Off campus' })[user.housing] || 'Housing not specified';
  el('member-since').textContent = 'Member since ' + new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  el('profile-biography').textContent = user.biography || '';
  el('profile-biography').hidden = !user.biography;
  if (ownProfile) el('email').textContent = user.email;
}

function renderListings(listings) {
  const container = el('active-listings');
  container.replaceChildren();
  if (!listings.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No active listings yet.';
    container.append(empty);
    return;
  }
  for (const listing of listings) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = '/item.html?id=' + encodeURIComponent(listing.id);
    const photo = document.createElement('div');
    photo.className = 'card-photo';
    const img = document.createElement('img');
    img.src = listing.photo_url || '/placeholder.svg';
    img.alt = '';
    img.addEventListener('error', () => { img.src = '/placeholder.svg'; }, { once: true });
    photo.append(img);
    const body = document.createElement('div');
    body.className = 'card-body';
    const price = document.createElement('span');
    price.className = 'card-price';
    price.textContent = listing.price_cents === 0 ? 'Free' : '$' + (listing.price_cents / 100).toFixed(2);
    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = listing.title;
    body.append(price, title);
    card.append(photo, body);
    container.append(card);
  }
}

function showRating(role, data) {
  const score = el(role === 'seller' ? 'rating' : 'buyer-rating');
  const stars = el(role + '-stars');
  const count = el(role + '-rating-count');
  const average = Number(data?.average);
  const total = Number(data?.count);
  const rated = data && total > 0 && Number.isFinite(average) && average >= 0 && average <= 5;
  score.textContent = rated ? `${average.toFixed(1)} / 5` : '—';
  const filled = rated ? Math.round(average) : 0;
  stars.textContent = '★'.repeat(filled) + '☆'.repeat(5 - filled);
  count.textContent = !data ? 'Unavailable' : `${rated ? total : 0} ${total === 1 ? 'review' : 'reviews'}`;
  count.disabled = !data;
  count.setAttribute('aria-label', `View ${role} reviews: ${count.textContent}`);
}

async function loadRatings(id) {
  try {
    const data = await api('/api/sellers/' + encodeURIComponent(id) + '/rating');
    showRating('seller', data);
  } catch (err) {
    showRating('seller', null);
  }
}

// Review history is loaded only when the student opens a rating count.
const reviewDialog = el('review-dialog');
let reviewSession = null;

function renderReview(review) {
  const box = document.createElement('article');
  box.className = 'review';
  const author = document.createElement('strong');
  author.textContent = review.rater_name;
  const rating = document.createElement('p');
  rating.className = 'profile-stars';
  rating.textContent = '★'.repeat(review.stars) + '☆'.repeat(5 - review.stars);
  rating.setAttribute('aria-label', `${review.stars} out of 5 stars`);
  const date = document.createElement('p');
  date.className = 'profile-muted';
  const stamp = review.review_date && new Date(review.review_date);
  date.textContent = stamp && Number.isFinite(stamp.getTime()) ?
    'Review date: ' + stamp.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' }) : 'Review date unavailable';
  const listing = document.createElement('p');
  listing.className = 'review-listing';
  listing.textContent = 'Listing: ' + (review.listing_title || 'Unavailable (older review)');
  const comment = document.createElement('p');
  comment.textContent = review.comment || 'No written comment.';
  box.append(author, rating, date, listing, comment);
  return box;
}

async function loadReviewPage(session) {
  if (session.loading || session.offset === null) return;
  session.loading = true;
  const status = el('review-status');
  const more = el('review-more');
  status.textContent = 'Loading reviews...';
  more.disabled = true;
  try {
    const data = await api('/api/profiles/' + encodeURIComponent(session.id) + '/reviews/' + session.role + '?offset=' + session.offset);
    if (reviewSession !== session) return;
    const history = el('review-history');
    for (const review of data.reviews) history.append(renderReview(review));
    session.offset = data.next_offset;
    status.textContent = history.childElementCount ? `${history.childElementCount} ${history.childElementCount === 1 ? 'review' : 'reviews'} shown` : 'No reviews yet.';
    more.textContent = 'Load more reviews';
    more.hidden = session.offset === null;
  } catch (err) {
    if (reviewSession !== session) return;
    status.textContent = 'Unable to load reviews. Please try again.';
    more.textContent = 'Retry';
    more.hidden = false;
  } finally {
    session.loading = false;
    if (reviewSession === session) more.disabled = false;
  }
}

for (const role of ['seller', 'buyer']) {
  el(role + '-rating-count').addEventListener('click', () => {
    if (!currentUser || reviewDialog.open) return;
    reviewSession = { id: currentUser.id, role, offset: 0, loading: false };
    el('review-title').textContent = role === 'seller' ? 'Seller reviews' : 'Buyer reviews';
    el('review-history').replaceChildren();
    el('review-more').hidden = true;
    reviewDialog.showModal();
    loadReviewPage(reviewSession);
  });
}
el('review-close').addEventListener('click', () => reviewDialog.close());
reviewDialog.addEventListener('close', () => { if (!reviewDialog.open) reviewSession = null; });
el('review-more').addEventListener('click', () => { if (reviewSession) loadReviewPage(reviewSession); });

// Profile-local account moderation uses the existing protected support API.
const moderationDialog = el('profile-moderation-dialog');
let moderationSession = null;
let moderationAllowed = false;
function showAccountId() {
  const visible = Boolean(currentUser && (ownProfile || moderationAllowed));
  const id = el('own-student-id');
  id.textContent = visible ? `#${currentUser.id}` : '';
  id.hidden = !visible;
}
function clearModeration() {
  moderationAllowed = false;
  showAccountId();
  el('profile-moderation').hidden = true;
  moderationSession = null;
  if (moderationDialog.open) moderationDialog.close();
  clearModerationFields();
}
function clearModerationFields() {
  el('profile-moderation-form').hidden = true;
  el('profile-moderation-reason').value = '';
  el('profile-moderation-account').textContent = '';
  el('profile-moderation-status').textContent = '';
}
async function loadModerationAccess(generation) {
  if (ownProfile) return;
  try {
    const role = await api('/api/reputation/admin-access');
    if (generation !== profileGeneration || ownProfile) return;
    moderationAllowed = role.allowed === true;
    el('profile-moderation').hidden = !moderationAllowed;
    showAccountId();
  } catch (_) {
    if (generation !== profileGeneration || ownProfile) return;
    clearModeration();
  }
}
function moderationPath(id) {
  return '/api/support/moderation/accounts/' + encodeURIComponent(id);
}
function handleModerationError(error, session) {
  if (moderationSession !== session) return;
  el('profile-moderation-status').textContent = error.message;
  if (error.status === 401 || error.status === 403 || error.status === 409) {
    el('profile-moderation-form').hidden = true;
    session.action = null;
    if (error.status !== 409) {
      moderationAllowed = false;
      showAccountId();
      el('profile-moderation').hidden = true;
    }
  }
}
async function loadModerationAccount(session, success = '') {
  const form = el('profile-moderation-form'), status = el('profile-moderation-status');
  const submit = el('profile-moderation-submit');
  form.hidden = true;
  session.action = null;
  status.textContent = success ? success + ' Refreshing account…' : 'Loading account…';
  try {
    const account = await api(moderationPath(session.id));
    if (moderationSession !== session) return;
    if (String(account.id) !== String(session.id)) throw new Error('Account does not match this profile.');
    el('profile-moderation-account').textContent = `${account.display_name} · ${account.suspended_at ? 'Suspended' : 'Active'}`;
    if (account.moderator) { status.textContent = 'Moderator accounts are protected.'; return; }
    session.action = account.suspended_at ? 'reinstate' : 'suspend';
    submit.dataset.action = session.action;
    submit.textContent = session.action === 'suspend' ? 'Suspend account' : 'Reinstate account';
    submit.disabled = false;
    form.hidden = false;
    status.textContent = success || 'A reason is required. Suspension ends active sessions.';
  } catch (error) { handleModerationError(error, session); }
}
el('profile-moderation').addEventListener('click', () => {
  if (!moderationAllowed || ownProfile || !currentUser || moderationDialog.open) return;
  const session = { id: currentUser.id, action: null, busy: false };
  moderationSession = session;
  clearModerationFields();
  moderationDialog.showModal();
  loadModerationAccount(session);
});
el('profile-moderation-close').addEventListener('click', () => moderationDialog.close());
moderationDialog.addEventListener('close', () => {
  if (moderationDialog.open) return;
  moderationSession = null;
  clearModerationFields();
});
el('profile-moderation-form').addEventListener('submit', async event => {
  event.preventDefault();
  const session = moderationSession;
  if (!session || !moderationAllowed || ownProfile || session.busy || !session.action) return;
  const reason = el('profile-moderation-reason').value.trim();
  const status = el('profile-moderation-status'), submit = el('profile-moderation-submit');
  if (!reason || reason.length > 500) { status.textContent = 'Enter a reason (1–500 characters).'; return; }
  const action = session.action;
  if (!window.confirm(`${submit.textContent} for ${currentUser.display_name}?`)) return;
  session.busy = true;
  submit.disabled = true;
  const generation = profileGeneration;
  try {
    await api(moderationPath(session.id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason })
    });
    if (moderationSession === session) {
      el('profile-moderation-reason').value = '';
      await loadModerationAccount(session, action === 'suspend' ? 'Account suspended.' : 'Account reinstated.');
    }
    // Update the listing panel after the account state changes.
    try {
      const profile = await api('/api/profiles/' + encodeURIComponent(session.id));
      if (generation === profileGeneration && currentUser && String(currentUser.id) === String(session.id)) renderListings(profile.listings);
    } catch (_) { /* Action succeeded; refresh the profile manually if necessary. */ }
  } catch (error) {
    handleModerationError(error, session);
    if (moderationSession === session) submit.disabled = false;
  } finally { session.busy = false; }
});

function setEditStatus(message, error = false) {
  el('edit-status').textContent = message;
  el('edit-status').classList.toggle('profile-error', error);
}

el('edit-button').addEventListener('click', () => {
  el('display-name').value = currentUser.display_name;
  el('housing-select').value = currentUser.housing || '';
  el('biography').value = currentUser.biography || '';
  el('edit-form').hidden = false;
  setEditStatus('');
  el('display-name').focus();
});
el('cancel-button').addEventListener('click', () => { el('edit-form').hidden = true; setEditStatus(''); });
el('edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  el('save-button').disabled = true;
  try {
    const data = await api('/api/profiles/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: el('display-name').value, housing: el('housing-select').value || null, biography: el('biography').value })
    });
    showUser(data.user);
    el('edit-form').hidden = true;
    setEditStatus('Profile updated.');
  } catch (err) { setEditStatus(err.message, true); }
  finally { el('save-button').disabled = false; }
});

async function loadBuyerReputation(id) {
  try {
    const data=await api('/api/reputation/buyer/'+encodeURIComponent(id));
    showRating('buyer', data);
    el('completed-sales').textContent = data.completed_sales;
    el('completed-purchases').textContent = data.completed_purchases;
  } catch(e){showRating('buyer', null);el('completed-sales').textContent='—';el('completed-purchases').textContent='—';}
}

async function loadProfile() {
  const generation = ++profileGeneration;
  clearModeration();
  el('own-student-id').hidden = true;
  el('own-student-id').textContent = '';
  el('profile-settings').hidden = true;
  el('profile').hidden = true;
  el('status').hidden = false;
  el('status').textContent = 'Loading profile...';
  el('status').classList.remove('profile-error');
  el('login-link').hidden = true;
  try {
    const data = await api('/api/profiles/' + (viewedId === null ? 'me' : encodeURIComponent(viewedId)));
    if (generation !== profileGeneration) return;
    ownProfile = viewedId === null || data.is_owner === true;
    showUser(data.user);
    renderListings(data.listings);
    el('account').hidden = !ownProfile;
    el('profile-settings').hidden = !ownProfile;
    el('edit-button').hidden = !ownProfile;
    el('profile-safety').href = '/safety.html?user=' + encodeURIComponent(data.user.id);
    el('profile-safety').hidden = ownProfile;
    el('status').hidden = true;
    el('profile').hidden = false;
    await Promise.all([loadRatings(data.user.id),loadBuyerReputation(data.user.id),loadModerationAccess(generation)]);
  } catch (err) {
    if (generation !== profileGeneration) return;
    el('status').textContent = err.message;
    el('status').classList.add('profile-error');
    el('login-link').hidden = err.status !== 401;
  }
}
loadProfile();
window.addEventListener('pagehide', () => {
  profileGeneration++;
  clearModeration();
  el('own-student-id').textContent = '';
  el('own-student-id').hidden = true;
  el('profile').hidden = true;
});
window.addEventListener('pageshow', event => { if (event.persisted) loadProfile(); });
