(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const endpoint = '/api/discovery';
  async function request(path, method = 'GET', body) {
    const options = { method, credentials: 'same-origin', cache: 'no-store' };
    if (body !== undefined) { options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(body); }
    const response = await fetch(endpoint + path, options);
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
  function saveControl(listing, buttons, status) {
    const id = encodeURIComponent(listing.id);
    let saved = false, busy = false;
    function setSaved(value) {
      saved = Boolean(value);
      for (const button of buttons) {
        const label = (saved ? 'Remove from saved items: ' : 'Save item: ') + listing.title;
        button.setAttribute('aria-pressed', String(saved));
        button.setAttribute('aria-label', label);
        button.title = label;
      }
    }
    function disable(value) { buttons.forEach(button => { button.disabled = value; }); }
    async function refresh() {
      if (busy) return;
      busy = true; disable(true);
      try { setSaved((await request('/saved/' + id)).saved); }
      catch (error) { setSaved(false); if (error.status !== 401) status.textContent = error.message; }
      finally { busy = false; disable(false); }
    }
    for (const button of buttons) button.addEventListener('click', async () => {
      if (busy) return;
      busy = true; disable(true);
      try {
        const data = await request('/saved/' + id, saved ? 'DELETE' : 'PUT');
        setSaved(data.saved);
        status.textContent = saved ? 'Saved: ' + listing.title : 'Removed from saved items: ' + listing.title;
      } catch (error) {
        if (error.status === 401) showLogin(status);
        else status.textContent = error.message;
      } finally { busy = false; disable(false); }
    });
    return { setSaved, disable, refresh, get busy() { return busy; } };
  }
  async function initItem(listing) {
    const control = saveControl(listing, [byId('save-btn'), byId('bookmark-btn')], byId('discovery-item-status'));
    await control.refresh();
    request('/recent/' + encodeURIComponent(listing.id), 'PUT').catch(() => {});
    window.addEventListener('pageshow', event => { if (event.persisted) control.refresh(); });
  }
  let browseControls = [];
  async function refreshBrowse(controls = browseControls) {
    for (const {control} of controls) if (!control.busy) control.disable(true);
    try {
      const { listings } = await request('/saved');
      const savedIds = new Set(listings.map(item => String(item.id)));
      if (controls !== browseControls) return;
      for (const {listing, control} of controls) if (!control.busy) control.setSaved(savedIds.has(String(listing.id)));
    } catch (error) {
      if (controls !== browseControls) return;
      for (const {control} of controls) if (!control.busy) control.setSaved(false);
      if (error.status !== 401) byId('browse-save-status').textContent = error.message;
    } finally {
      if (controls === browseControls) for (const {control} of controls) if (!control.busy) control.disable(false);
    }
  }
  function initBrowse(entries) {
    browseControls = entries.map(({listing, button}) => ({listing, control: saveControl(listing, [button], byId('browse-save-status'))}));
    if (browseControls.length) refreshBrowse();
  }
  window.addEventListener('pageshow', event => { if (event.persisted && browseControls.length) refreshBrowse(); });
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
  let personalRequest = 0;
  async function showPersonalRecommendations(visible) {
    const panel = byId('personal-recommendations');
    if (!panel) return;
    const current = ++personalRequest;
    panel.hidden = true;
    byId('personal-list').replaceChildren();
    if (!visible) return;
    try {
      const data = await request('/recommendations');
      if (current !== personalRequest) return;
      byId('personal-status').textContent = data.enabled
        ? (data.listings.length ? 'Based on items you recently viewed.' : 'View a few items to discover relevant suggestions.')
        : 'Personalised suggestions are off. Enable them in Settings if you wish.';
      if (data.enabled) renderCards(byId('personal-list'), data.listings);
      panel.hidden = false;
    } catch (_) { /* Personalisation is optional; never interrupt normal browsing. */ }
  }
  async function initPersonalisation() {
    const panel = byId('personalisation');
    if (!panel) return;
    const form = byId('personalisation-form');
    const status = byId('personalisation-status');
    const toggle = form.elements.enabled;
    const button = form.querySelector('button');
    let saving = false;
    async function refresh() {
      if (saving) return;
      panel.hidden = true;
      form.hidden = true;
      try {
        const data = await request('/recommendation-preferences');
        toggle.checked = data.enabled;
        status.textContent = '';
        panel.hidden = false;
        form.hidden = false;
      } catch (error) {
        if (error.status !== 401) { panel.hidden = false; status.textContent = error.message; }
      }
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving) return;
      saving = true; button.disabled = true; toggle.disabled = true;
      try {
        const data = await request('/recommendation-preferences', 'PUT', { enabled: toggle.checked });
        toggle.checked = data.enabled;
        status.textContent = data.enabled ? 'Personalised recommendations enabled.' : 'Personalised recommendations disabled.';
      } catch (error) { status.textContent = error.message; }
      finally { saving = false; button.disabled = false; toggle.disabled = false; }
    });
    refresh();
    window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
  }
  window.UniMarketDiscovery = { initBrowse, showPersonalRecommendations, initItem(listing) { initItem(listing); showSimilar(listing); initShare(listing); } };
  if (byId('library-status')) initLibrary();
  initPricing();
  initPersonalisation();
})();
