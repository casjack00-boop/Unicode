const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const { normalizeISBN } = require('../isbn');
const router = express.Router();
const categories = new Set(['textbooks', 'furniture', 'dorm', 'electronics', 'clothing', 'other']);
const validId = value => /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= 2147483647;
const fields = `l.id, l.title, l.price_cents, l.category, l.condition, l.status,
  (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY position LIMIT 1) AS photo_url`;
const fail = (res, error) => {
  console.error('Discovery:', error);
  res.status(500).json({ error: 'Unable to complete this request. Please try again.' });
};

// Recommendations exclude the current item. Prefer matching ISBN and title, then category.
router.get('/similar/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid listing ID.' });
  try {
    const { rows } = await pool.query(`SELECT ${fields} FROM listings l
      JOIN listings source ON source.id = $1 AND source.status = 'active'
      WHERE l.id <> source.id AND l.status = 'active' AND l.category = source.category
      ORDER BY CASE WHEN source.isbn IS NOT NULL AND l.isbn = source.isbn THEN 1 ELSE 0 END DESC,
        similarity(lower(l.title), lower(source.title)) DESC,
        CASE WHEN source.department IS NOT NULL AND l.department = source.department
          AND l.course_number = source.course_number THEN 1 ELSE 0 END DESC,
        abs(l.price_cents::bigint - source.price_cents::bigint), l.id DESC LIMIT 6`, [req.params.id]);
    res.json({ listings: rows });
  } catch (error) { fail(res, error); }
});

// Price guidance uses active asking prices, NOT verified sale prices or external valuations.
router.get('/pricing', requireUser, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const category = String(req.query.category || '');
  const title = String(req.query.title || '').trim().slice(0, 80);
  const rawISBN = String(req.query.isbn || '').trim().slice(0, 40);
  const isbn = category === 'textbooks' && rawISBN ? normalizeISBN(rawISBN) : null;
  if (!categories.has(category) || (!isbn && title.length < 3) || (category === 'textbooks' && rawISBN && !isbn)) {
    return res.status(400).json({ error: 'Choose a category and enter a title or valid ISBN.' });
  }
  try {
    const { rows } = await pool.query(`SELECT count(*)::int AS count, min(price_cents)::int AS min,
      max(price_cents)::int AS max, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents)::numeric)::int AS median
      FROM listings WHERE status = 'active' AND category = $1 AND seller_id <> $4
      AND (($2::text IS NOT NULL AND isbn = $2) OR ($2::text IS NULL AND
        (similarity(lower(title), lower($3)) >= 0.45 OR word_similarity(lower($3), lower(title)) >= 0.65)))`,
      [category, isbn, title, req.user.id]);
    res.json({ ...rows[0], basis: isbn ? 'Matching ISBN' : 'Similar titles in this category' });
  } catch (error) { fail(res, error); }
});

// All personal data is scoped to the authenticated student's ID, never a client-provided user ID.
router.use(requireUser, (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
router.get('/saved', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${fields} FROM saved_listings s JOIN listings l ON l.id = s.listing_id
      WHERE s.user_id = $1 AND l.status <> 'removed' ORDER BY s.saved_at DESC, l.id DESC`, [req.user.id]);
    res.json({ listings: rows });
  } catch (error) { fail(res, error); }
});
router.get('/saved/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid listing ID.' });
  try {
    const { rowCount } = await pool.query('SELECT 1 FROM saved_listings WHERE user_id = $1 AND listing_id = $2', [req.user.id, req.params.id]);
    res.json({ saved: rowCount > 0 });
  } catch (error) { fail(res, error); }
});
router.put('/saved/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid listing ID.' });
  try {
    const { rowCount } = await pool.query(`INSERT INTO saved_listings (user_id, listing_id)
      SELECT $1, id FROM listings WHERE id = $2 AND status = 'active'
      ON CONFLICT (user_id, listing_id) DO UPDATE SET saved_at = saved_listings.saved_at RETURNING listing_id`, [req.user.id, req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'This listing is no longer available.' });
    res.json({ saved: true });
  } catch (error) { fail(res, error); }
});
router.delete('/saved/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid listing ID.' });
  try {
    await pool.query('DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2', [req.user.id, req.params.id]);
    res.json({ saved: false });
  } catch (error) { fail(res, error); }
});
router.get('/recent', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT ${fields} FROM recently_viewed_listings r JOIN listings l ON l.id = r.listing_id
      WHERE r.user_id = $1 AND l.status <> 'removed' ORDER BY r.viewed_at DESC, l.id DESC LIMIT 20`, [req.user.id]);
    res.json({ listings: rows });
  } catch (error) { fail(res, error); }
});
router.put('/recent/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid listing ID.' });
  try {
    await pool.query(`INSERT INTO recently_viewed_listings (user_id, listing_id)
      SELECT $1, id FROM listings WHERE id = $2 AND status = 'active'
      ON CONFLICT (user_id, listing_id) DO UPDATE SET viewed_at = now()`, [req.user.id, req.params.id]);
    await pool.query(`DELETE FROM recently_viewed_listings WHERE user_id = $1 AND listing_id IN
      (SELECT listing_id FROM recently_viewed_listings WHERE user_id = $1 ORDER BY viewed_at DESC, listing_id DESC OFFSET 20)`, [req.user.id]);
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});
router.delete('/recent', async (req, res) => {
  try {
    await pool.query('DELETE FROM recently_viewed_listings WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});
module.exports = router;
