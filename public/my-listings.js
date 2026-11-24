// UniMarket: My Listings (by Alaiya; restyled with photos and sold/relist)

const listingsContainer = document.getElementById('listings');
const message = document.getElementById('message');

function formatPrice(cents) {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  return '$' + (Number.isInteger(dollars) ? dollars : dollars.toFixed(2));
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Load the student's own listings
async function loadMyListings() {
  try {
    const response = await fetch('/api/listings/mine', { credentials: 'same-origin' });
    if (response.status === 401) {
      listingsContainer.replaceChildren();
      const p = el('p', 'empty');
      p.append('Please ');
      const a = el('a', null, 'log in'); a.href = '/login.html';
      p.append(a, ' to see your listings.');
      listingsContainer.append(p);
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load listings.');

    listingsContainer.replaceChildren();

    if (!data.listings || data.listings.length === 0) {
      const p = el('p', 'empty', "You haven't posted anything yet. ");
      const a = el('a', null, 'Sell your first item'); a.href = '/post.html';
      p.append(a);
      listingsContainer.append(p);
      return;
    }

    data.listings.forEach((item) => {
      const sold = item.status === 'sold';
      const row = el('div', 'row' + (sold ? ' sold' : ''));

      const photo = el('div', 'row-photo');
      if (item.photo_url) {
        const img = document.createElement('img');
        img.src = item.photo_url;
        img.alt = '';
        photo.append(img);
      }

      const text = el('div', 'row-text');
      const title = el('a', 'row-title', item.title);
      title.href = '/item.html?id=' + encodeURIComponent(item.id);
      text.append(title, el('span', 'row-price', formatPrice(item.price_cents)));
      text.append(el('span', 'badge' + (sold ? ' sold' : ''), sold ? 'Sold' : 'For sale'));

      const actions = el('div', 'row-actions');
      const soldBtn = el('button', 'small-btn', sold ? 'Relist' : 'Mark sold');
      soldBtn.type = 'button';
      soldBtn.addEventListener('click', () => updateListing(item.id, sold ? 'active' : 'sold', soldBtn));
      const removeBtn = el('button', 'small-btn danger', 'Remove');
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', () => {
        // Ask twice instead of a pop-up: first click arms it, second click removes
        if (removeBtn.dataset.sure !== 'yes') {
          removeBtn.dataset.sure = 'yes';
          removeBtn.textContent = 'Sure?';
          setTimeout(() => { removeBtn.dataset.sure = ''; removeBtn.textContent = 'Remove'; }, 3000);
          return;
        }
        updateListing(item.id, 'removed', removeBtn);
      });
      actions.append(soldBtn, removeBtn);

      row.append(photo, text, actions);
      listingsContainer.appendChild(row);
    });

  } catch (error) {
    message.textContent = error.message;
    message.className = 'message error';
    listingsContainer.replaceChildren();
  }
}

// Change a listing's status: active, sold, or removed
async function updateListing(id, status, button) {
  button.disabled = true;
  message.textContent = '';
  try {
    const response = await fetch('/api/listings/' + encodeURIComponent(id) + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ status })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update listing.');
    await loadMyListings();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'message error';
    button.disabled = false;
  }
}

loadMyListings();
