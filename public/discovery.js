(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const endpoint = '/api/discovery';
  async function request(path, method = 'GET') {
    const response = await fetch(endpoint + path, { method, credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to complete this request.');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  const price = cents => cents === 0 ? 'Free' : '$' + (Number(cents) / 100).toFixed(2);
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function renderCards(container, listings, onRemove) {
    container.replaceChildren();
    for (const item of listings) {
      const card = el('article', undefined, 'discovery-card');
      if (item.photo_url) {
        const img = el('img'); img.alt = ''; img.loading = 'lazy';
        img.src = item.photo_url;
        img.addEventListener('error', () => img.remove());
        card.append(img);
      }
      const available = ['active','reserved'].includes(item.status);
      const title = el(available ? 'a' : 'span', item.title);
      if (available) title.href = '/item.html?id=' + encodeURIComponent(item.id);
      card.append(title, el('strong', price(item.price_cents)),
        el('p', item.status === 'reserved' ? 'Reserved' : available ? String(item.condition || '').replaceAll('_', ' ') : 'Sold / unavailable'));
      if (onRemove) {
        const button = el('button', 'Remove saved item', 'discovery-button');
        button.type = 'button'; button.setAttribute('aria-label', 'Remove ' + item.title + ' from saved items');
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await onRemove(item.id); const next = card.nextElementSibling || card.previousElementSibling; card.remove(); (next?.querySelector('button') || byId('saved-heading'))?.focus(); }
          catch (error) { byId('library-status').textContent = error.message; button.disabled = false; }
        });
        card.append(button);
      }
      container.append(card);
    }
  }
  function showLogin(status) {
    const link = el('a', 'Log in to UniMarket', 'discovery-link'); link.href = '/login.html';
    status.replaceChildren(document.createTextNode('Sign in to use this feature. '), link);
  }
  async function initItem(listing) {
    const id = encodeURIComponent(listing.id);
    const save = byId('save-btn');
    const status = byId('discovery-item-status');
    let saved = false;
    let busy = false;
    function setSaved(value) {
      saved = value;
      save.setAttribute('aria-pressed', String(value));
      save.setAttribute('aria-label', value ? 'Remove from saved items' : 'Save item');
    }
    save.disabled = true;
    try {
      const data = await request('/saved/' + id);
      setSaved(data.saved);
      request('/recent/' + id, 'PUT').catch(() => {});
    } catch (error) {
      if (error.status !== 401) status.textContent = error.message;
    } finally { save.disabled = false; }
    save.addEventListener('click', async () => {
      if (busy) return;
      busy = true; save.disabled = true;
      try {
        const data = await request('/saved/' + id, saved ? 'DELETE' : 'PUT');
        setSaved(data.saved);
        status.textContent = saved ? 'Saved to your list.' : 'Removed from saved items.';
      } catch (error) {
        if (error.status === 401) showLogin(status);
        else status.textContent = error.message;
      } finally { busy = false; save.disabled = false; }
    });
    // Restore authoritative state when returning via the browser history.
    window.addEventListener('pageshow', async event => {
      if (!event.persisted || busy) return;
      save.disabled = true;
      try { setSaved((await request('/saved/' + id)).saved); }
      catch (_) { setSaved(false); }
      finally { save.disabled = false; }
    });
  }
  async function showSimilar(listing) {
    const section = byId('similar-section');
    try {
      const data = await request('/similar/' + encodeURIComponent(listing.id));
      if (!data.listings.length) return;
      renderCards(byId('similar-items'), data.listings);
      section.hidden = false;
    } catch (_) { /* Recommendations must never prevent viewing the listing. */ }
  }
  function initShare(listing) {
    const button = byId('share-listing');
    const status = byId('discovery-item-status');
    button.addEventListener('click', async () => {
      const url = new URL('/item.html?id=' + encodeURIComponent(listing.id), location.origin).href;
      try {
        if (navigator.share) { await navigator.share({ title: listing.title, url }); return; }
        if (navigator.clipboard) { await navigator.clipboard.writeText(url); status.textContent = 'Listing link copied.'; return; }
      } catch (error) { if (error.name === 'AbortError') return; }
      const field = el('input'); field.value = url; field.readOnly = true; field.setAttribute('aria-label', 'Listing link');
      status.replaceChildren(document.createTextNode('Copy this link: '), field); field.focus(); field.select();
    });
  }
  async function initLibrary() {
    const status = byId('library-status');
    const savedList = byId('saved-list'); const recentList = byId('recent-list');
    try {
      const [saved, recent] = await Promise.all([request('/saved'), request('/recent')]);
      status.textContent = '';
      renderCards(savedList, saved.listings, async id => {
        await request('/saved/' + encodeURIComponent(id), 'DELETE');
        status.textContent = 'Removed from saved items.';
        if (savedList.children.length === 1) byId('saved-empty').hidden = false;
      });
      renderCards(recentList, recent.listings);
      byId('saved-empty').hidden = saved.listings.length > 0;
      byId('recent-empty').hidden = recent.listings.length > 0;
      const clear = byId('clear-recent');
      clear.hidden = !recent.listings.length;
      clear.addEventListener('click', async () => {
        clear.disabled = true;
        try { await request('/recent', 'DELETE'); recentList.replaceChildren(); byId('recent-empty').hidden = false; byId('recent-heading').focus(); clear.hidden = true; status.textContent = 'Viewing history cleared.'; }
        catch (error) { status.textContent = error.message; }
        finally { clear.disabled = false; }
      });
    } catch (error) {
      if (error.status === 401) showLogin(status); else status.textContent = error.message;
    }
  }
  function initPricing() {
    const button = byId('price-guide-button'); const status = byId('price-guide-status');
    if (!button) return;
    const fields = () => ({ title: byId('title').value.trim(), category: byId('category').value,
      isbn: byId('category').value === 'textbooks' ? (byId('isbnInput')?.value.trim() || '') : '' });
    byId('postForm').addEventListener('input', () => { status.textContent = ''; });
    byId('category').addEventListener('change', () => { status.textContent = ''; });
    button.addEventListener('click', async () => {
      const snapshot = JSON.stringify(fields()); const query = JSON.parse(snapshot);
      button.disabled = true; status.textContent = 'Checking comparable listings…';
      try {
        const data = await request('/pricing?' + new URLSearchParams(query));
        if (JSON.stringify(fields()) !== snapshot) { status.textContent = ''; return; }
        status.textContent = data.count ? `${data.basis}: ${data.count} comparable active ${data.count === 1 ? 'listing' : 'listings'}. Asking-price range ${price(data.min)} – ${price(data.max)}; median ${price(data.median)}. ${data.count < 3 ? 'Small sample — use with caution. ' : ''}Condition and edition may differ. You choose the final price.` : 'No comparable active listings yet. Enter your own price.';
      } catch (error) { if (JSON.stringify(fields()) === snapshot) status.textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  window.UniMarketDiscovery = { initItem(listing) { initItem(listing); showSimilar(listing); initShare(listing); } };
  if (byId('library-status')) initLibrary();
  initPricing();
})();
