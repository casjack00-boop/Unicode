// Shortcut: find an element by its id
const $ = (id) => document.getElementById(id);

// Remember the email between Screen 1 and Screen 2
let currentEmail = '';

// Show one screen and hide the others
function show(screenId) {
  $('view-email').hidden = screenId !== 'view-email';
  $('view-code').hidden = screenId !== 'view-code';
  $('view-home').hidden = screenId !== 'view-home';
}

// Show a message under the form (red for errors, green for success)
function showMessage(text, type = 'error') {
  $('message').textContent = text;
  $('message').className = type;
}

// Talk to the server: send data, get the answer back
async function api(path, data) {
  const response = await fetch('/api/auth/' + path, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  return { ok: response.ok, result };
}

// SCREEN 1: the "Send my code" button
$('email-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');

  // Turn the button off while we wait, so it can't be clicked twice
  const button = event.target.querySelector('button');
  button.disabled = true;

  // Read what the student typed and send it to the server
  currentEmail = $('email').value.trim();
  const { ok, result } = await api('request-code', {
    email: currentEmail,
    displayName: $('name').value.trim(),
  });

  button.disabled = false;

  if (ok) {
    // It worked: show Screen 2
    $('code-email').textContent = currentEmail;
    $('code').value = '';
    show('view-code');
    showMessage(result.message, 'success');
  } else {
    // It failed: show the server's error in red
    showMessage(result.error);
  }
});

// SCREEN 2: the "Verify and continue" button
$('code-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');

  const button = event.target.querySelector('button');
  button.disabled = true;

  // Send the email and the code the student typed
  const { ok, result } = await api('verify-code', {
    email: currentEmail,
    code: $('code').value.trim(),
  });

  button.disabled = false;

  if (ok) {
    // Logged in! Load their info and show the welcome screen
    await loadUser();
  } else {
    showMessage(result.error);
  }
});

// The "Use a different email" link goes back to Screen 1
$('back-btn').addEventListener('click', () => {
  showMessage('');
  show('view-email');
});

// Ask the server who's logged in, then show the right screen
async function loadUser() {
  const { ok, result } = await api('me');
  if (ok) {
    $('user-name').textContent = result.user.display_name;
    show('view-home');
    showMessage('');
  } else {
    show('view-email');
  }
}

// The "Log out" button
$('logout-btn').addEventListener('click', async () => {
  await api('logout', {});
  show('view-email');
  showMessage('You are logged out.', 'success');
});

// When the page first opens, check if the student is already logged in
loadUser();