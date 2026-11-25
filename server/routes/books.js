const express = require('express');
const requireUser = require('../requireUser');
const router = express.Router();

const { normalizeISBN } = require('../isbn');

// Small per-process cache and request throttle for the public catalogue.
const cache = new Map();
let lastRequest = 0;
const TTL = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;

router.get('/isbn/:isbn', requireUser, async (req, res) => {
  const isbn = normalizeISBN(req.params.isbn);
  if (!isbn) return res.status(400).json({ error: 'Enter a valid ISBN-10 or ISBN-13.' });
  const cached = cache.get(isbn);
  if (cached && cached.expires > Date.now()) return res.json(cached.book);
  if (Date.now() - lastRequest < 1100) {
    res.set('Retry-After', '1');
    return res.status(429).json({ error: 'Please wait a moment and try again.' });
  }
  lastRequest = Date.now();
  try {
    const key = 'ISBN:' + isbn;
    const url = new URL('https://openlibrary.org/api/books');
    url.search = new URLSearchParams({ bibkeys: key, jscmd: 'data', format: 'json' }).toString();
    const contact = process.env.OPEN_LIBRARY_CONTACT;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': contact ? `UniMarket (${contact})` : 'UniMarket' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return res.status(503).json({ error: 'Book catalogue is temporarily unavailable. You can enter the details manually.' });
    }
    const data = await response.json();
    const record = data[key];
    if (!record || !record.title) {
      return res.status(404).json({ error: 'No matching book found. You can enter the details manually.' });
    }
    const names = entries => Array.isArray(entries) ? entries.map(x => x.name).filter(Boolean).join(', ') : '';
    const book = {
      isbn,
      title: String(record.title),
      author: names(record.authors),
      publisher: names(record.publishers),
      publicationDate: String(record.publish_date || ''),
      source: 'Open Library'
    };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(isbn, { book, expires: Date.now() + TTL });
    return res.json(book);
  } catch (error) {
    console.error('ISBN lookup error:', error.message);
    return res.status(503).json({ error: 'Book lookup is temporarily unavailable. You can enter the details manually.' });
  }
});

module.exports = router;
