// Independent enhancement to the existing Sell an item page.
(() => {
  const bookFields = document.getElementById('bookFields');
  const category = document.getElementById('category');
  const title = document.getElementById('title');
  const author = document.getElementById('author');
  if (!bookFields || !category || !title || !author) return;

  const panel = document.createElement('section');
  panel.className = 'isbn-panel';
  panel.innerHTML = `
    <label class="label" for="isbnInput">Find your book by ISBN</label>
    <p class="hint">Optional: type or paste the ISBN from the back of your book.</p>
    <div class="isbn-row">
      <input id="isbnInput" type="text" maxlength="40" placeholder="9780060539825" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="isbnStatus">
      <button id="isbnLookup" type="button">Look up</button>
    </div>
    <p id="isbnStatus" class="isbn-status" role="status" aria-live="polite"></p>
    <div id="isbnResult" class="isbn-result" hidden></div>
  `;
  bookFields.prepend(panel);
  const input = panel.querySelector('#isbnInput');
  const button = panel.querySelector('#isbnLookup');
  const status = panel.querySelector('#isbnStatus');
  const result = panel.querySelector('#isbnResult');
  let generation = 0;

  function clearResult() {
    generation++;
    result.hidden = true;
    result.replaceChildren();
    status.textContent = '';
    status.className = 'isbn-status';
  }
  input.addEventListener('input', clearResult);
  category.addEventListener('change', clearResult);

  async function lookup() {
    if (button.disabled || category.value !== 'textbooks') return;
    const isbn = input.value.trim();
    clearResult();
    const request = generation;
    if (!isbn) { status.textContent = 'Enter an ISBN first.'; input.focus(); return; }
    button.disabled = true;
    status.textContent = 'Finding book…';
    try {
      const response = await fetch('/api/books/isbn/' + encodeURIComponent(isbn), { credentials: 'same-origin' });
      const book = await response.json();
      if (!response.ok) throw new Error(book.error || 'Unable to look up the book.');
      if (request !== generation || category.value !== 'textbooks') return;
      input.value = book.isbn;
      // Show metadata for review; don't invent edition or overwrite unrelated fields.
      const heading = document.createElement('strong');
      heading.textContent = book.title;
      const details = document.createElement('p');
      details.textContent = [book.author, book.publisher, book.publicationDate].filter(Boolean).join(' · ');
      const use = document.createElement('button');
      use.type = 'button';
      use.textContent = 'Use book details';
      use.addEventListener('click', () => {
        title.value = book.title.slice(0, title.maxLength > 0 ? title.maxLength : 80);
        if (book.author) author.value = book.author.slice(0, author.maxLength > 0 ? author.maxLength : 80);
        status.textContent = 'Book details filled in. Review them before posting.';
        use.disabled = true;
      });
      const source = document.createElement('small');
      source.textContent = 'Source: Open Library';
      result.append(heading, details, source, use);
      result.hidden = false;
      status.textContent = 'Book found.';
      status.classList.add('is-ok');
    } catch (error) {
      if (request !== generation) return;
      status.textContent = error.message || 'Lookup failed. Enter details manually.';
      status.classList.add('is-error');
    } finally {
      button.disabled = false;
    }
  }
  button.addEventListener('click', lookup);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); lookup(); }
  });
})();
