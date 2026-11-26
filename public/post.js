// UniMarket: Sell an item (started by Alaiya; photos, textbook fields, and design added)

const form = document.getElementById('postForm');
const message = document.getElementById('message');
const postBtn = document.getElementById('postBtn');
const photoInput = document.getElementById('photoInput');
const photoSlots = document.getElementById('photoSlots');
const categorySelect = document.getElementById('category');
const bookFields = document.getElementById('bookFields');

const MAX_PHOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

let photos = [];           // files the student picked
let condition = 'good';    // chosen condition chip

function showMessage(text, kind) {
  message.textContent = text;
  message.className = 'message' + (kind ? ' ' + kind : '');
}

// ---------- Must be logged in ----------
async function checkLogin() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) throw new Error();
  } catch (e) {
    document.getElementById('loginNote').hidden = false;
    postBtn.disabled = true;
  }
}

// ---------- Condition chips ----------
document.querySelectorAll('#conditionChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    condition = chip.dataset.value;
    document.querySelectorAll('#conditionChips .chip').forEach((c) => {
      const on = c === chip;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
  });
});

// ---------- Textbook fields only for Textbooks ----------
function syncBookFields() {
  bookFields.hidden = categorySelect.value !== 'textbooks';
}

categorySelect.addEventListener('change', syncBookFields);

syncBookFields();

window.addEventListener('pageshow', () => {
  setTimeout(syncBookFields, 0);
});

// ---------- Photos ----------
document.getElementById('initialAddPhoto').addEventListener('click', () => photoInput.click());

function drawPhotos() {
  photoSlots.replaceChildren();

  photos.forEach((file, i) => {
    const box = document.createElement('div');
    box.className = 'thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = 'Photo ' + (i + 1);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remove photo ' + (i + 1));
    remove.addEventListener('click', () => {
      photos.splice(i, 1);
      drawPhotos();
    });
    box.append(img, remove);
    photoSlots.append(box);
  });

  if (photos.length < MAX_PHOTOS) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-photo';
    add.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B4500C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>';
    add.append('Add photo');
    add.addEventListener('click', () => photoInput.click());
    photoSlots.append(add);
  }
  for (let i = photos.length + 1; i < MAX_PHOTOS; i++) {
    const empty = document.createElement('div');
    empty.className = 'slot';
    photoSlots.append(empty);
  }
}

photoInput.addEventListener('change', () => {
  const picked = Array.from(photoInput.files);
  photoInput.value = '';  // lets them pick the same file again later
  for (const file of picked) {
    if (photos.length >= MAX_PHOTOS) { showMessage('You can add up to 3 photos.', 'error'); break; }
    if (!OK_TYPES.includes(file.type)) { showMessage(file.name + ' is not a JPG, PNG, or WEBP image.', 'error'); continue; }
    if (file.size > MAX_BYTES) { showMessage(file.name + ' is over 5 MB.', 'error'); continue; }
    photos.push(file);
  }
  drawPhotos();
});

// ---------- Check the form before sending ----------
function checkForm() {
  let problem = '';
  const fields = ['title', 'price', 'category', 'meetingSpot'];
  fields.forEach((id) => document.getElementById(id).classList.remove('invalid'));

  const title = document.getElementById('title');
  const price = document.getElementById('price');
  const priceNum = Number(price.value);

  if (!title.value.trim()) { problem = problem || 'Add a title.'; title.classList.add('invalid'); }
  if (price.value === '' || !Number.isFinite(priceNum) || priceNum < 0 || priceNum > 10000) {
    problem = problem || 'Price must be between $0 and $10,000.'; price.classList.add('invalid');
  }
  if (!categorySelect.value) { problem = problem || 'Pick a category.'; categorySelect.classList.add('invalid'); }
  const spot = document.getElementById('meetingSpot');
  if (!spot.value) { problem = problem || 'Pick a meeting spot.'; spot.classList.add('invalid'); }
  return problem;
}

// ---------- Post ----------
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const problem = checkForm();
  for (const field of form.querySelectorAll('input, select, textarea')) {
    if (field.classList.contains('invalid')) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
  if (problem) { showMessage(problem, 'error'); form.querySelector('.invalid')?.focus(); return; }

  postBtn.disabled = true;
  showMessage('Posting your item...');

  const item = {
    title: document.getElementById('title').value.trim(),
    price: Number(document.getElementById('price').value),
    category: categorySelect.value,
    condition,
    description: document.getElementById('description').value.trim(),
    meetingSpot: document.getElementById('meetingSpot').value
  };
  if (item.category === 'textbooks') {
    item.department = document.getElementById('department').value.trim().toUpperCase();
    item.courseNumber = document.getElementById('courseNumber').value.trim();
    item.edition = document.getElementById('edition').value.trim();
    item.author = document.getElementById('author').value.trim();
    item.isbn = document.getElementById('isbnInput')?.value.trim() || '';
  }

  try {
    // 1. Create the listing
    const response = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(item)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to post item.');

    // 2. Upload the photos to it (Kenny's photo route)
    if (photos.length) {
      showMessage('Uploading photos...');
      const data = new FormData();
      photos.forEach((file) => data.append('photos', file));
      const up = await fetch('/api/listings/' + encodeURIComponent(result.id) + '/photos', {
        method: 'POST',
        credentials: 'same-origin',
        body: data
      });
      if (!up.ok) {
        const upErr = await up.json().catch(() => ({}));
        // The listing is posted; tell them the photos didn't make it
        showMessage('Your item posted, but the photos did not upload: ' + (upErr.error || 'try again from My listings.'), 'error');
        setTimeout(() => { window.location.href = '/item.html?id=' + encodeURIComponent(result.id); }, 2500);
        return;
      }
    }

    showMessage('Item posted!', 'ok');
    window.location.href = '/item.html?id=' + encodeURIComponent(result.id);

  } catch (error) {
    showMessage(error.message, 'error');
    postBtn.disabled = false;
  }
});

drawPhotos();
checkLogin();
