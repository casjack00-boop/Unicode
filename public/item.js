// ---------- 1. Grab the page elements we need to fill in ----------
const statusEl   = document.getElementById('status');
const itemEl     = document.getElementById('item');
const messageBtn = document.getElementById('message-btn');
const comingSoon = document.getElementById('coming-soon');

// ---------- 2. Helpers ----------

// Show a message (like "Listing not found.") and keep the item hidden
function showError(message) {
  statusEl.textContent = message;
  statusEl.classList.add('error');
  statusEl.hidden = false;
  itemEl.hidden = true;

  // Give them a way back
  const back = document.createElement('a');
  back.href = '/browse.html';
  back.textContent = 'Back to Browse';
  back.className = 'status-back';
  statusEl.appendChild(document.createElement('br'));
  statusEl.appendChild(back);
}

// 6000 cents -> "$60", 2550 -> "$25.50", 0 -> "Free"
function formatPrice(cents) {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  return '$' + (Number.isInteger(dollars) ? dollars : dollars.toFixed(2));
}

// "Maya Johnson" -> "MJ"
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join('');
}

// created_at -> "Posted today" / "Posted 2 days ago"
function postedAgo(dateText) {
  const days = Math.floor((Date.now() - new Date(dateText)) / 86400000);
  if (!Number.isFinite(days)) return '';
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  return `Posted ${days} days ago`;
}

// Show photo number "which" (0, 1, 2) with a "1 / 3" counter you can tap
function showPhotos(photos, title) {
  const box = document.getElementById('photo');
  const counter = document.getElementById('photo-count');
  let which = 0;

  const img = document.createElement('img');
  img.className = 'photo-img';
  img.alt = title;
  box.querySelector('.photo-placeholder').replaceWith(img);

  function draw() {
    img.src = photos[which].url;
    counter.textContent = `${which + 1} / ${photos.length}`;
    counter.setAttribute('aria-label', `Photo ${which + 1} of ${photos.length}. Show next photo`);
  }

  if (photos.length > 1) {
    counter.hidden = false;
    counter.title = 'Next photo';
    const next = () => { which = (which + 1) % photos.length; draw(); };
    counter.addEventListener('click', next);
    img.addEventListener('click', next);
  }
  draw();
}

// "like_new" -> "Like New", "textbooks" -> "Textbooks"
function formatLabel(text) {
  return String(text ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Put text into the element with the given id.
// textContent (not innerHTML) keeps user-typed text from being run as code.
function setText(id, value) {
  document.getElementById(id).textContent = value ?? '';
}

// ---------- 3. Load the listing ----------
async function loadListing() {
  // Read the id out of the address: item.html?id=1  ->  "1"
  const id = new URLSearchParams(location.search).get('id');

  if (!id) {
    showError('Listing not found.');
    return;
  }

  try {
    // Ask the server for this listing
    const response = await fetch('/api/listings/' + encodeURIComponent(id));

    // A missing item comes back as an error status (like 404)
    if (!response.ok) {
      showError('Listing not found.');
      return;
    }

    const data = await response.json();   // { listing: {...} }
    const listing = data.listing;

    if (!listing) {
      showError('Listing not found.');
      return;
    }

    // Fill in the page
    const reportLink = document.getElementById('report-listing');
    reportLink.href = '/safety.html?listing=' + encodeURIComponent(listing.id);
    reportLink.hidden = false;
    setText('price', formatPrice(listing.price_cents));
    setText('title', listing.title);
    setText('condition', formatLabel(listing.condition));
    setText('category', formatLabel(listing.category));
    setText('description', listing.description);
    const isbnDetails = document.getElementById('isbn-details');
    if (isbnDetails) {
      isbnDetails.hidden = !(listing.category === 'textbooks' && listing.isbn);
      isbnDetails.textContent = isbnDetails.hidden ? '' : 'ISBN: ' + listing.isbn;
    }
    const dimensionsPanel = document.getElementById('item-dimensions');
    if (listing.category === 'furniture' && listing.dimension_unit && listing.width_measure != null && listing.height_measure != null && listing.depth_measure != null) {
      const values = [listing.width_measure, listing.height_measure, listing.depth_measure].map(Number);
      dimensionsPanel.textContent = `Dimension: ${values.join(' × ')} ${listing.dimension_unit} (W × H × D)`;
      dimensionsPanel.hidden = false;
    }
    setText('posted', postedAgo(listing.created_at));
    setText('seller-name', listing.seller_name);

    document.getElementById('seller-name').href =
      '/profile.html?id=' + encodeURIComponent(listing.seller_id);

    setText('seller-initials', initials(listing.seller_name));

    setText('seller-initials', initials(listing.seller_name));
    setText('seller-housing', listing.seller_housing ? ' · ' + formatLabel(listing.seller_housing).replace('Campus', 'campus') : '');
    setText('meeting-spot', listing.meeting_spot || 'Ask the seller');

    // Show the listing's photos (if it has any)
    if (listing.photos && listing.photos.length > 0) {
      showPhotos(listing.photos, listing.title);
    }

    // Seller rating (stars + rate form)
    loadRating(listing.seller_id);
    document.title = listing.title + ' | UniMarket';

    // Swap "Loading..." for the real content
    statusEl.hidden = true;
    itemEl.hidden = false;
    window.UniMarketDiscovery?.initItem(listing);
    const offerLink = document.getElementById('offer-link');
    const reserved = listing.status === 'reserved';
    document.getElementById('purchase-state').textContent = reserved ? 'Reserved — not currently available for new offers.' : 'Agree a price and arrange an in-person exchange. No payment is collected here.';
    offerLink.href = reserved ? '/transactions.html' : '/transactions.html?listing=' + encodeURIComponent(listing.id);
    offerLink.textContent = reserved ? 'View my transactions' : 'Make an offer / reserve';
  } catch (err) {
    // Network problem or the server is down
    console.error(err);
    showError('Listing not found.');
  }
}

// ---------- 4. Message seller ----------
messageBtn.addEventListener('click', () => {
  const id = new URLSearchParams(location.search).get('id');

  if (id) {
    window.location.href =
      '/messages.html?listing=' + encodeURIComponent(id);
  }
});

// ---------- 5. Seller ratings ----------
let ratingSellerId = null;
let pickedStars = 0;

function starText(avg) {
  const full = Math.round(avg || 0);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function showPicked(n) {
  pickedStars = n;
  document.querySelectorAll('#star-pick button').forEach((b) => {
    const on = Number(b.dataset.stars) <= n;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(Number(b.dataset.stars) === n));
  });
}

async function loadRating(sellerId) {
  ratingSellerId = sellerId;
  try {
    const res = await fetch('/api/sellers/' + encodeURIComponent(sellerId) + '/rating', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('stars-show').textContent = starText(data.average);
    document.getElementById('rating-summary').textContent = data.count
      ? data.average + ' · ' + data.count + (data.count === 1 ? ' rating' : ' ratings')
      : 'No ratings yet';

    // Comments
    const list = document.getElementById('rating-comments');
    list.replaceChildren();
    data.recent.forEach((r) => {
      const li = document.createElement('li');
      const who = document.createElement('b');
      who.textContent = r.rater_name + ' ' + '★'.repeat(r.stars) + ': ';
      li.append(who, document.createTextNode(r.comment));
      list.append(li);
    });

    // Only buyers with a completed exchange with this seller can rate.
    const form = document.getElementById('rate-form');
    form.hidden = !data.canRate;
    if (data.mine) {
      showPicked(data.mine.stars);
      document.getElementById('rate-comment').value = data.mine.comment || '';
    }
  } catch (e) {
    document.getElementById('rating-summary').textContent = 'Ratings unavailable';
  }
}

document.querySelectorAll('#star-pick button').forEach((b) => {
  b.addEventListener('click', () => showPicked(Number(b.dataset.stars)));
});

document.getElementById('rate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('rate-message');
  if (!pickedStars) { msg.textContent = 'Tap 1 to 5 stars first.'; return; }
  try {
    const res = await fetch('/api/sellers/' + encodeURIComponent(ratingSellerId) + '/rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ stars: pickedStars, comment: document.getElementById('rate-comment').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save your rating.');
    msg.textContent = 'Thanks! Your rating is saved.';
    loadRating(ratingSellerId);
  } catch (err) {
    msg.textContent = err.message;
  }
});

// ---------- 6. Go! ----------
loadListing();