// UniMarket: seller ratings
//   GET  /api/sellers/:id/rating   -> average, count, recent comments, and your own rating
//   POST /api/sellers/:id/rating   -> rate a seller 1-5 stars (must be logged in)

const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');

const router = express.Router();

function sellerIdFrom(req) {
  const id = Number(req.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Find out who is logged in WITHOUT requiring it.
// Reuses requireUser (the same login check as every other route):
// if it says "not logged in", we just keep going with no user.
function optionalUser(req, res, next) {
  const quietRes = {
    status() { return this; },
    json() { next(); }          // not logged in -> continue without req.user
  };
  requireUser(req, quietRes, next);
}

// Read a seller's rating summary
router.get('/:id/rating', optionalUser, async (req, res) => {
  const sellerId = sellerIdFrom(req);
  if (!sellerId) return res.status(400).json({ error: 'Invalid seller ID' });

  try {
    const summary = await pool.query(
      `SELECT COUNT(*)::int AS count, ROUND(AVG(stars), 1)::float AS average
         FROM seller_ratings WHERE seller_id = $1`,
      [sellerId]
    );
    const recent = await pool.query(
      `SELECT r.stars, r.comment, r.created_at, u.display_name AS rater_name
         FROM seller_ratings r JOIN users u ON u.id = r.rater_id
        WHERE r.seller_id = $1 AND r.comment IS NOT NULL
        ORDER BY r.created_at DESC LIMIT 5`,
      [sellerId]
    );

    const me = req.user ? req.user.id : null;
    let mine = null;
    if (me) {
      const own = await pool.query(
        'SELECT stars, comment FROM seller_ratings WHERE seller_id = $1 AND rater_id = $2',
        [sellerId, me]
      );
      mine = own.rows[0] || null;
    }

    res.json({
      count: summary.rows[0].count,
      average: summary.rows[0].average,   // null when there are no ratings yet
      recent: recent.rows,
      loggedIn: Boolean(me),
      isSelf: me === sellerId,
      mine
    });
  } catch (error) {
    console.error('Read rating error:', error);
    res.status(500).json({ error: 'Unable to load ratings.' });
  }
});

// Rate a seller (rating again replaces your old rating)
router.post('/:id/rating', requireUser, async (req, res) => {
  const sellerId = sellerIdFrom(req);
  const stars = Number(req.body.stars);
  const comment = String(req.body.comment || '').trim().slice(0, 300) || null;

  if (!sellerId) return res.status(400).json({ error: 'Invalid seller ID' });
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'Pick 1 to 5 stars.' });
  }
  if (sellerId === req.user.id) {
    return res.status(400).json({ error: "You can't rate yourself." });
  }

  try {
    const seller = await pool.query('SELECT id FROM users WHERE id = $1', [sellerId]);
    if (!seller.rows.length) return res.status(404).json({ error: 'Seller not found.' });

    await pool.query(
      `INSERT INTO seller_ratings (seller_id, rater_id, stars, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (seller_id, rater_id)
       DO UPDATE SET stars = EXCLUDED.stars, comment = EXCLUDED.comment, created_at = NOW()`,
      [sellerId, req.user.id, stars, comment]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Save rating error:', error);
    res.status(500).json({ error: 'Unable to save your rating.' });
  }
});

module.exports = router;