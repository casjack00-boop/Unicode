(() => {
  const form = document.getElementById('postForm');
  if (!form) return;
  const byId = id => document.getElementById(id);
  const status = byId('draft-status');
  const discard = byId('discard-draft');
  const fields = ['title', 'price', 'category', 'description', 'meetingSpot', 'department', 'courseNumber', 'edition', 'author', 'isbnInput', 'measure-width', 'measure-height', 'measure-depth', 'measure-unit'];
  const measures = ['measure-width', 'measure-height', 'measure-depth'];
  let key = null, ready = false, finished = false;
  const conditionValue = () => document.querySelector('#conditionChips [aria-pressed="true"]')?.dataset.value || 'good';
  function syncDimensions() {
    byId('dimension-fields').hidden = byId('category').value !== 'furniture';
  }
  function snapshot() {
    return { fields: Object.fromEntries(fields.map(id => [id, byId(id)?.value || ''])), condition: conditionValue() };
  }
  function nonempty(data) {
    return Object.entries(data.fields).some(([id, value]) => id !== 'measure-unit' && value !== '') || data.condition !== 'good';
  }
  function save() {
    if (!ready || finished) return;
    const data = snapshot();
    try {
      if (nonempty(data)) localStorage.setItem(key, JSON.stringify(data));
      else localStorage.removeItem(key);
      status.textContent = nonempty(data) ? 'Draft saved on this browser.' : 'No draft to save yet.';
      discard.disabled = !nonempty(data);
    } catch { status.textContent = 'Draft could not be saved on this browser.'; discard.disabled = !nonempty(data); }
  }
  function apply(data) {
    for (const id of fields) {
      const field = byId(id);
      if (!field) continue;
      const value = data.fields?.[id];
      field.value = typeof value === 'string' ? value : (id === 'measure-unit' ? 'in' : '');
      if (id === 'measure-unit' && !field.value) field.value = 'in';
    }
    // A fixed selector plus comparison avoids interpolating untrusted storage into CSS selectors.
    const chip = [...document.querySelectorAll('#conditionChips .chip')].find(c => c.dataset.value === data.condition);
    (chip || document.querySelector('#conditionChips [data-value="good"]')).click();
    byId('category').dispatchEvent(new Event('change', { bubbles: true }));
    byId('isbnInput')?.dispatchEvent(new Event('input', { bubbles: true }));
    syncDimensions();
  }
  function fromListing(item) {
    const text = x => x == null ? '' : String(x);
    return { condition: item.condition, fields: {
      title: text(item.title), price: String(item.price_cents / 100), category: text(item.category),
      description: text(item.description), meetingSpot: text(item.meeting_spot),
      department: text(item.department), courseNumber: text(item.course_number), edition: text(item.edition),
      author: text(item.author), isbnInput: text(item.isbn), 'measure-width': text(item.width_measure),
      'measure-height': text(item.height_measure), 'measure-depth': text(item.depth_measure), 'measure-unit': item.dimension_unit || 'in'
    }};
  }
  function dimensions() {
    if (byId('category').value !== 'furniture' || measures.every(id => byId(id).value === '')) return null;
    return { width: Number(byId(measures[0]).value), height: Number(byId(measures[1]).value), depth: Number(byId(measures[2]).value), unit: byId('measure-unit').value };
  }
  function validateDimensions() {
    measures.forEach(id => byId(id).classList.remove('invalid'));
    if (!dimensions()) return '';
    let bad = false;
    for (const id of measures) {
      const field = byId(id);
      if (!field.value || !field.validity.valid) { field.classList.add('invalid'); bad = true; }
    }
    return bad ? 'Enter width, height and depth together, from 0.01 to 10,000.' : '';
  }
  function clearAfterPost() {
    finished = true;
    try { if (key) localStorage.removeItem(key); } catch { /* posting already succeeded */ }
  }
  window.UniMarketSeller = { dimensions, validateDimensions, clearAfterPost };
  byId('category').addEventListener('change', syncDimensions);
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  form.addEventListener('click', event => { if (event.target.closest('#conditionChips .chip')) save(); });
  discard.addEventListener('click', () => {
    if (!confirm('Discard your saved draft and selected photos?')) return;
    ready = false;
    form.reset();
    photos = [];
    drawPhotos();
    apply({ fields: {}, condition: 'good' });
    ready = true;
    save();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  async function init() {
    const user = await checkLogin();
    if (!user) { status.textContent = 'Log in to use listing drafts.'; return; }
    key = `unimarket:listings:draft:v1:${user.id}`;
    let existing = null, storageError = false;
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const data = JSON.parse(raw); if (data && typeof data.fields === 'object' && data.fields && nonempty(data)) existing = data; }
    } catch { storageError = true; }
    const params = new URLSearchParams(location.search);
    const purchase = params.get('purchase');
    const copy = purchase || params.get('copy');
    let copied = false, copyError = '';
    if (copy && (!existing || confirm('Replace your saved draft with a copy of this listing?'))) {
      try {
        const endpoint = purchase ? '/api/transactions/' + encodeURIComponent(copy) + '/relist' : '/api/listings/' + encodeURIComponent(copy) + '/copy';
        const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to copy listing.');
        apply(fromListing(data.listing));
        copied = true;
      } catch (error) { copyError = error.message; }
    }
    if (!copied && existing) apply(existing);
    if (copy) { try { history.replaceState(null, '', '/post.html'); } catch { /* nonstandard preview origins */ } }
    ready = true;
    form.inert = false;
    byId('postBtn').disabled = false;
    syncDimensions();
    if (copied) { save(); status.textContent = 'Listing copied into the form. Review details, current condition and price; select new photos before posting.'; }
    else if (existing) { discard.disabled = false; status.textContent = 'Draft restored. Select photos again if needed.'; }
    else status.textContent = storageError ? 'Draft storage is unavailable.' : 'Draft details will be saved as you type.';
    if (copyError) status.textContent = copyError + (existing ? ' Your original draft was restored.' : ' You can still create a new listing.');
  }
  init();
})();
