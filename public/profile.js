// Profile view: /profile.html for your account, /profile.html?id=2 for a seller.
const el = (id) => document.getElementById(id);
const viewedId = new URLSearchParams(location.search).get('id');
const ownProfile = viewedId === null;
let currentUser;

async function api(url, options) {
  const response = await fetch(url, options);
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
  el('avatar').textContent = user.display_name.trim().split(/\s+/).slice(0, 2).map(s => s.charAt(0).toUpperCase()).join('');
  el('housing').textContent = ({ on_campus: 'On campus', off_campus: 'Off campus' })[user.housing] || 'Housing not specified';
  el('member-since').textContent = 'Member since ' + new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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

async function loadRatings(id) {
  try {
    const data = await api('/api/sellers/' + encodeURIComponent(id) + '/rating');
    el('rating').textContent = data.count ? `★ ${data.average.toFixed(1)} / 5 (${data.count} ratings)` : 'No ratings yet';
    const reviews = el('reviews');
    reviews.replaceChildren();
    if (!data.recent.length) reviews.textContent = 'No written reviews yet.';
    for (const review of data.recent) {
      const box = document.createElement('div');
      box.className = 'review';
      const author = document.createElement('strong');
      author.textContent = review.rater_name + ' · ' + '★'.repeat(review.stars) + '☆'.repeat(5 - review.stars);
      const comment = document.createElement('p');
      comment.textContent = review.comment;
      box.append(author, comment);
      reviews.append(box);
    }
  } catch (err) {
    el('rating').textContent = 'Ratings unavailable';
    el('reviews').textContent = 'Unable to load reviews.';
  }
}

function setEditStatus(message, error = false) {
  el('edit-status').textContent = message;
  el('edit-status').classList.toggle('profile-error', error);
}

el('edit-button').addEventListener('click', () => {
  el('display-name').value = currentUser.display_name;
  el('housing-select').value = currentUser.housing || '';
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
      body: JSON.stringify({ display_name: el('display-name').value, housing: el('housing-select').value || null })
    });
    showUser(data.user);
    el('edit-form').hidden = true;
    setEditStatus('Profile updated.');
  } catch (err) { setEditStatus(err.message, true); }
  finally { el('save-button').disabled = false; }
});
el('logout').addEventListener('click', async () => {
  el('logout').disabled = true;
  try { await api('/api/auth/logout', { method: 'POST' }); location.href = '/login.html'; }
  catch (err) { setEditStatus(err.message, true); el('logout').disabled = false; }
});

async function loadProfile() {
  el('page-label').textContent = ownProfile ? 'My profile' : 'Student profile';
  try {
    const data = await api('/api/profiles/' + (ownProfile ? 'me' : encodeURIComponent(viewedId)));
    showUser(data.user);
    renderListings(data.listings);
    el('account').hidden = !ownProfile;
    el('edit-button').hidden = !ownProfile;
    el('status').hidden = true;
    el('profile').hidden = false;
    await loadRatings(data.user.id);
  } catch (err) {
    el('status').textContent = err.message;
    el('status').classList.add('profile-error');
    el('login-link').hidden = err.status !== 401;
  }
}
loadProfile();
