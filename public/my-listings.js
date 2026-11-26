// UniMarket: My Listings (by Alaiya; restyled with photos and sold/relist)

const listingsContainer = document.getElementById('listings');
const message = document.getElementById('message');
const summary = document.getElementById('seller-summary');
const filter = document.getElementById('listing-status-filter');
function updateSummary(items) {
  const values = document.getElementById('seller-summary-values');
  values.replaceChildren();
  const active = items.filter(item => item.status === 'active');
  for (const [name, value] of [['For sale', active.length], ['Reserved', items.filter(item => item.status === 'reserved').length], ['Sold', items.filter(item => item.status === 'sold').length],
    ['Active asking value', formatPrice(active.reduce((sum, item) => sum + Number(item.price_cents), 0))]]) {
    values.append(el('dt', null, name), el('dd', null, String(value)));
  }
  summary.hidden = false;
}
function applyFilter() {
  let count = 0;
  for (const row of listingsContainer.querySelectorAll('[data-listing-status]')) {
    row.hidden = filter.value !== 'all' && row.dataset.listingStatus !== filter.value;
    if (!row.hidden) count++;
  }
  listingsContainer.querySelector('.filter-empty')?.remove();
  if (!count && listingsContainer.querySelector('[data-listing-status]')) {
    listingsContainer.append(el('p', 'empty filter-empty', 'No listings match this filter.'));
  }
}
filter.addEventListener('change', applyFilter);
async function changePrice(id, price, button, input) {
  button.disabled = true;
  input.disabled = true;
  try {
    const response = await fetch('/api/listings/' + encodeURIComponent(id) + '/price', {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to update price.');
    message.textContent = 'Price updated.'; message.className = 'message ok';
    await loadMyListings();
  } catch (error) {
    message.textContent = error.message; message.className = 'message error';
    button.disabled = false; input.disabled = false;
  }
}

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
      summary.hidden = true;
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

    updateSummary(data.listings || []);
    if (!data.listings || data.listings.length === 0) {
      const p = el('p', 'empty', "You haven't posted anything yet. ");
      const a = el('a', null, 'Sell your first item'); a.href = '/post.html';
      p.append(a);
      listingsContainer.append(p);
      return;
    }

    data.listings.forEach((item) => {
      const sold = item.status === 'sold';
      const reserved = item.status === 'reserved';
      const row = el('div', 'row' + (sold ? ' sold' : ''));
      row.dataset.listingStatus = item.status;

      const photo = el('div', 'row-photo');
      if (item.photo_url) {
        const img = document.createElement('img');
        img.src = item.photo_url;
        img.alt = '';
        photo.append(img);
      }

      const text = el('div', 'row-text');
      const title = el(sold ? 'span' : 'a', 'row-title', item.title);
      if (!sold) title.href = '/item.html?id=' + encodeURIComponent(item.id);
      text.append(title, el('span', 'row-price', formatPrice(item.price_cents)));
      text.append(el('span', 'badge' + (sold ? ' sold' : ''), sold ? 'Sold' : reserved ? 'Reserved' : 'For sale'));

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
      const copy = el('a', 'seller-button', 'Duplicate');
      copy.href = '/post.html?copy=' + encodeURIComponent(item.id);
      if (reserved) {
        const manage = el('a', 'seller-button', 'Manage reservation');
        manage.href = '/transactions.html'; actions.append(manage);
      } else {
        if (!sold || !item.transaction_completed) actions.append(soldBtn);
        actions.append(copy, removeBtn);
      }
      row.append(photo, text, actions);
      if (!sold && !reserved) {
        const edit = el('button', 'small-btn', 'Edit price'); edit.type = 'button';
        const priceForm = el('form', 'seller-edit'); priceForm.hidden = true;
        priceForm.id = 'price-form-' + item.id;
        edit.setAttribute('aria-controls', priceForm.id); edit.setAttribute('aria-expanded', 'false');
        const label = el('label', null, 'New asking price ($)');
        const input = el('input'); input.id = 'price-edit-' + item.id; label.htmlFor = input.id;
        input.type = 'number'; input.min = '0'; input.max = '10000'; input.step = '0.01'; input.required = true; input.value = (item.price_cents / 100).toFixed(2);
        const buttons = el('div', 'seller-edit-actions');
        const save = el('button', 'seller-button', 'Save price'); save.type = 'submit';
        const cancel = el('button', 'seller-button', 'Cancel'); cancel.type = 'button';
        function toggle(open) { priceForm.hidden = !open; edit.setAttribute('aria-expanded', String(open)); (open ? input : edit).focus(); }
        edit.addEventListener('click', () => toggle(priceForm.hidden));
        cancel.addEventListener('click', () => toggle(false));
        priceForm.addEventListener('submit', event => { event.preventDefault(); if (priceForm.reportValidity()) changePrice(item.id, Number(input.value), save, input); });
        buttons.append(save, cancel); priceForm.append(label, input, buttons);
        actions.prepend(edit); row.append(priceForm);
      }
      listingsContainer.appendChild(row);
    });
    applyFilter();

  } catch (error) {
    summary.hidden = true;
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
