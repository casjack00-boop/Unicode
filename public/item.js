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
}

// 6000 cents -> "$60.00"
function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
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
    setText('price', formatPrice(listing.price_cents));
    setText('title', listing.title);
    setText('condition', formatLabel(listing.condition));
    setText('category', formatLabel(listing.category));
    setText('description', listing.description);
    setText('seller-name', listing.seller_name);
    setText('seller-housing', formatLabel(listing.seller_housing));
    setText('meeting-spot', listing.meeting_spot);
    document.title = listing.title + ' | UniMarket';

    // Swap "Loading..." for the real content
    statusEl.hidden = true;
    itemEl.hidden = false;
  } catch (err) {
    // Network problem or the server is down
    console.error(err);
    showError('Listing not found.');
  }
}

// ---------- 4. Message seller button (placeholder for now) ----------
messageBtn.addEventListener('click', () => {
  comingSoon.hidden = false;
});

// ---------- 5. Go! ----------
loadListing();
