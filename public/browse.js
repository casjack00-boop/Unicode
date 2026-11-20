
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

function createElement(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function addDetail(container, text, full = false) {
  container.appendChild(
    createElement('span', full ? 'detail full' : 'detail', text)
  );
}

function renderListings(listings) {
  results.replaceChildren();

  if (!listings.length) {
    results.appendChild(
      createElement('p', 'empty-state', 'No matching listings found.')
    );
    return;
  }

  listings.forEach(item => {
    const card = createElement('a', 'listing-card');
    card.href = `/item.html?id=${encodeURIComponent(item.id)}`;

    const img = createElement('img', 'listing-image');
    img.alt = item.title;
    img.src = item.photo_url || '/placeholder.svg';
    img.onerror = () => {
      img.onerror = null;
      img.src = '/placeholder.svg';
    };

    const info = createElement('div', 'listing-info');
    info.appendChild(createElement('h3', 'listing-title', item.title));

    const details = createElement('div', 'listing-details');
    addDetail(details, `Price: $${(item.price_cents / 100).toFixed(2)}`);

    if (item.category === 'textbooks') {
      addDetail(details, item.edition ? `Edition: ${item.edition}` : 'Textbook');
      const courseText = [item.department, item.course_number]
        .filter(Boolean).join(' ');
      addDetail(details, `Course: ${courseText || 'Not specified'}`, true);
    } else {
      addDetail(details, item.category);
      addDetail(details, `Condition: ${labels[item.condition] || item.condition}`, true);
    }

    info.appendChild(details);
    card.appendChild(img);
    card.appendChild(info);
    card.appendChild(createElement('span', 'card-arrow', '›'));
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

    count.textContent = `${data.length} results`;
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

document.querySelectorAll('.category-button').forEach(button => {
  button.addEventListener('click', () => {
    category = button.dataset.category;

    document.querySelectorAll('.category-button').forEach(b => {
      b.classList.toggle('active', b === button);
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
