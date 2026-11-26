// UniMarket: roommate finder page

const postsBox = document.getElementById('posts');
const countEl = document.getElementById('count');
const form = document.getElementById('postForm');
const formMessage = document.getElementById('formMessage');
const postBtn = document.getElementById('postBtn');

let myId = null;          // logged-in student's id (null if logged out)
let location_ = '';       // filter: '', 'on_campus', or 'off_campus'
let hasPlace = false;     // "I have a place" chip in the form

const LOCATION_LABELS = { on_campus: 'On campus', off_campus: 'Off campus', either: 'On or off campus' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// "2026-01-10" -> "Jan 10"
function shortDate(iso) {
  if (!iso) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = String(iso).slice(0, 10);
  return months[Number(d.slice(5, 7)) - 1] + ' ' + Number(d.slice(8, 10));
}

// ---------- Who is logged in? ----------
async function checkLogin() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) myId = (await res.json()).user.id;
  } catch (e) { /* logged out */ }
}

// ---------- Load and show posts ----------
async function loadPosts() {
  const params = new URLSearchParams();
  if (location_) params.set('location', location_);
  const max = document.getElementById('maxBudget').value;
  if (max) params.set('maxBudget', max);

  try {
    const res = await fetch('/api/roommates?' + params.toString());
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load posts.');
    showPosts(data.posts);
  } catch (err) {
    countEl.textContent = err.message;
    postsBox.replaceChildren();
  }
}

function showPosts(posts) {
  postsBox.replaceChildren();
  countEl.textContent = posts.length + (posts.length === 1 ? ' post' : ' posts');

  if (!posts.length) {
    postsBox.append(el('p', 'empty', 'No roommate posts yet. Tap + Post to add yours.'));
    return;
  }

  posts.forEach((p) => {
    const card = el('article', 'card post');

    const top = el('div', 'post-top');
    top.append(el('h3', null, p.title), el('span', 'budget', '$' + Math.round(p.budget_cents / 100) + '/mo'));

    const tags = el('div', 'tags');
    tags.append(el('span', 'tag place', p.has_place ? 'Has a place' : 'Looking for a place'));
    tags.append(el('span', 'tag', LOCATION_LABELS[p.location] || p.location));
    if (p.move_in) tags.append(el('span', 'tag', 'Move in ' + shortDate(p.move_in)));
    if (p.lease_months) tags.append(el('span', 'tag', p.lease_months + '-month lease'));

    card.append(top, tags);
    if (p.about) card.append(el('p', 'about', p.about));

    const bottom = el('div', 'post-bottom');
    const poster = el('span', 'poster');
    poster.append('Posted by ', el('b', null, p.poster_name));
    bottom.append(poster);

    if (myId && p.user_id === myId) {
      const remove = el('button', 'small-btn remove', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => removePost(p.id, remove));
      bottom.append(remove);
    } else {
      const msg = el('button', 'small-btn', 'Message them');
      msg.type = 'button';
      const soon = el('p', 'soon', 'Messaging is coming soon.');
      soon.hidden = true;
      msg.addEventListener('click', () => { soon.hidden = false; });
      bottom.append(msg);
      card.append(bottom, soon);
      postsBox.append(card);
      return;
    }

    card.append(bottom);
    postsBox.append(card);
  });
}

// ---------- Remove your own post ----------
async function removePost(id, button) {
  if (button.dataset.sure !== 'yes') {
    button.dataset.sure = 'yes';
    button.textContent = 'Sure?';
    setTimeout(() => { button.dataset.sure = ''; button.textContent = 'Remove'; }, 3000);
    return;
  }
  button.disabled = true;
  try {
    const res = await fetch('/api/roommates/' + encodeURIComponent(id) + '/remove', {
      method: 'PATCH',
      credentials: 'same-origin'
    });
    if (!res.ok) throw new Error();
    loadPosts();
  } catch (e) {
    button.disabled = false;
    button.textContent = 'Try again';
  }
}

// ---------- Filters ----------
document.querySelectorAll('#locationChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    location_ = chip.dataset.location;
    document.querySelectorAll('#locationChips .chip').forEach((c) => {
      c.classList.toggle('active', c === chip);
      c.setAttribute('aria-pressed', String(c === chip));
    });
    loadPosts();
  });
});

let budgetTimer;
document.getElementById('maxBudget').addEventListener('input', () => {
  clearTimeout(budgetTimer);
  budgetTimer = setTimeout(loadPosts, 400);   // wait until they stop typing
});

// ---------- Post form ----------
document.getElementById('openForm').addEventListener('click', () => {
  form.hidden = false;
  document.getElementById('openForm').setAttribute('aria-expanded', 'true');
  document.getElementById('loginNote').hidden = Boolean(myId);
  postBtn.disabled = !myId;
  document.getElementById('title').focus();
});

document.getElementById('cancelForm').addEventListener('click', () => {
  form.hidden = true;
  document.getElementById('openForm').setAttribute('aria-expanded', 'false');
  formMessage.textContent = '';
  document.getElementById('openForm').focus();
});

document.querySelectorAll('#placeChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    hasPlace = chip.dataset.value === 'true';
    document.querySelectorAll('#placeChips .chip').forEach((c) => {
      const on = c === chip;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const title = document.getElementById('title');
  const budget = document.getElementById('budget');
  const where = document.getElementById('location');
  [title, budget, where].forEach((f) => f.classList.remove('invalid'));

  let problem = '';
  if (!title.value.trim()) { problem = problem || 'Add a title.'; title.classList.add('invalid'); }
  if (budget.value === '' || Number(budget.value) < 0) { problem = problem || 'Add your monthly budget.'; budget.classList.add('invalid'); }
  if (!where.value) { problem = problem || 'Pick on campus, off campus, or either.'; where.classList.add('invalid'); }
  if (problem) {
    formMessage.textContent = problem;
    formMessage.className = 'message error';
    return;
  }

  postBtn.disabled = true;
  try {
    const res = await fetch('/api/roommates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        title: title.value.trim(),
        budget: Number(budget.value),
        location: where.value,
        hasPlace,
        moveIn: document.getElementById('moveIn').value || null,
        leaseMonths: document.getElementById('leaseMonths').value || null,
        about: document.getElementById('about').value.trim()
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to post.');

    form.reset();
    form.hidden = true;
    document.getElementById('openForm').setAttribute('aria-expanded', 'false');
    document.getElementById('openForm').focus();
    formMessage.textContent = '';
    loadPosts();
  } catch (err) {
    formMessage.textContent = err.message;
    formMessage.className = 'message error';
  }
  postBtn.disabled = false;
});

// ---------- Go! ----------
checkLogin().then(loadPosts);