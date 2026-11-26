
const searchInput = document.getElementById('searchInput');
const results = document.getElementById('listingResults');
const count = document.getElementById('resultCount');
const errorMessage = document.getElementById('errorMessage');
const filters = document.getElementById('filters');
const textbookFilters = document.getElementById('textbookFilters');

const department = document.getElementById('department');
const course = document.getElementById('course');
const edition = document.getElementById('edition');
const minPrice = document.getElementById('minPrice');
const maxPrice = document.getElementById('maxPrice');
const sortSelect = document.getElementById('sortSelect');

let category = 'all';
let requestNumber = 0;
let searchTimer;

const labels = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair'
};

const housingLabels = {
  on_campus: 'On campus',
  off_campus: 'Off campus'
};

function createElement(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

// 6000 -> "$60", 2550 -> "$25.50", 0 -> "Free"
function formatPrice(cents) {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  return '$' + (Number.isInteger(dollars) ? dollars : dollars.toFixed(2));
}

const photoIcon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5A6478" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="M21 16l-5-5-9 9"></path></svg>';

function renderListings(listings) {
  results.replaceChildren();

  if (!listings.length) {
    results.appendChild(createElement('p', 'empty', 'No matching listings found.'));
    return;
  }

  listings.forEach(item => {
    const card = createElement('a', 'card');
    card.href = `/item.html?id=${encodeURIComponent(item.id)}`;

    // Photo (or the "Photo" placeholder from the design)
    const photo = createElement('div', 'card-photo');
    if (item.photo_url) {
      const img = document.createElement('img');
      img.src = item.photo_url;
      img.alt = item.title;
      img.onerror = () => { photo.innerHTML = photoIcon; };
      photo.appendChild(img);
    } else {
      photo.innerHTML = photoIcon; // fixed icon, no user text
      photo.appendChild(createElement('span', null, 'Photo'));
    }

    // Price, title, and one small details line
    const body = createElement('div', 'card-body');
    body.appendChild(createElement('span', 'card-price', formatPrice(item.price_cents)));
    body.appendChild(createElement('span', 'card-title', item.title));

    const meta = [labels[item.condition] || item.condition];
    if (item.category === 'textbooks') {
      const courseText = [item.department, item.course_number].filter(Boolean).join(' ');
      if (courseText) meta.push(courseText);
    }
    if (housingLabels[item.seller_housing]) meta.push(housingLabels[item.seller_housing]);
    body.appendChild(createElement('span', 'card-meta', meta.join(' · ')));

    card.appendChild(photo);
    card.appendChild(body);
    results.appendChild(card);
  });
}

async function loadListings() {
  const currentRequest = ++requestNumber;
  const params = new URLSearchParams({
    search: searchInput.value.trim(),
    category,
    sort: sortSelect.value
  });

  if (category === 'textbooks') {
    if (department.value) params.set('department', department.value);
    if (course.value) params.set('course', course.value);
    if (edition.value) params.set('edition', edition.value);
  }

  if (minPrice.value) params.set('minPrice', minPrice.value);
  if (maxPrice.value) params.set('maxPrice', maxPrice.value);

  count.textContent = 'Loading...';
  errorMessage.hidden = true;

  try {
    const response = await fetch(`/api/listings?${params}`);
    if (!response.ok) throw new Error('Could not load listings');

    const data = await response.json();
    if (currentRequest !== requestNumber) return;

    count.textContent = `${data.length} ${data.length === 1 ? 'result' : 'results'}`;
    renderListings(data);
  } catch (error) {
    if (currentRequest !== requestNumber) return;
    count.textContent = '0 results';
    results.replaceChildren();
    errorMessage.textContent = 'Unable to load listings. Check the server and database.';
    errorMessage.hidden = false;
  }
}

async function loadFilterOptions() {
  try {
    const response = await fetch('/api/listings/filters');
    if (!response.ok) throw new Error('Could not load filters');

    const data = await response.json();

    const fields = [
      [department, data.departments],
      [course, data.courses],
      [edition, data.editions]
    ];

    fields.forEach(([select, values]) => {
      values.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    });
  } catch (error) {
    console.error('Filter options unavailable:', error);
  }
}

document.querySelectorAll('.chip').forEach(button => {
  button.addEventListener('click', () => {
    category = button.dataset.category;

    document.querySelectorAll('.chip').forEach(b => {
      b.classList.toggle('active', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    });

    textbookFilters.hidden = category !== 'textbooks';
    loadListings();
  });
});

document.getElementById('filterToggle').addEventListener('click', event => {
  filters.hidden = !filters.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!filters.hidden));
});

document.getElementById('clearFilters').addEventListener('click', () => {
  department.value = '';
  course.value = '';
  edition.value = '';
  minPrice.value = '';
  maxPrice.value = '';
  loadListings();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadListings, 250);
});

[department, course, edition, minPrice, maxPrice, sortSelect]
  .forEach(control => control.addEventListener('change', loadListings));

loadFilterOptions();
loadListings();
