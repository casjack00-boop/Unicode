// UniMarket student profiles. Reuses the existing users and listings tables.
const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const router = express.Router();

router.use(requireUser, (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

async function getProfile(id, includeEmail) {
  const { rows } = await pool.query(
    `SELECT id, display_name, housing, biography, verified, created_at${includeEmail ? ', email' : ''}
       FROM users WHERE id = $1 AND verified = TRUE`, [id]
  );
  if (!rows.length) return null;
  const listings = await pool.query(
    `SELECT l.id, l.title, l.price_cents,
       (SELECT p.url FROM listing_photos p WHERE p.listing_id = l.id
        ORDER BY p.position LIMIT 1) AS photo_url
     FROM listings l WHERE l.seller_id = $1 AND l.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=l.seller_id AND u.suspended_at IS NOT NULL)
     ORDER BY l.created_at DESC, l.id DESC`, [id]
  );
  return { user: rows[0], listings: listings.rows };
}

router.get('/me', async (req, res) => {
  try {
    const profile = await getProfile(req.user.id, true);
    if (!profile) return res.status(404).json({ error: 'Student not found.' });
    res.json(profile);
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Unable to load profile.' });
  }
});

router.patch('/me', async (req, res) => {
  const { display_name, housing, biography } = req.body || {};
  if (biography !== undefined && (typeof biography !== 'string' || biography.includes('\u0000') || Array.from(biography.trim()).length > 500)) {
    return res.status(400).json({ error: 'Biography must be at most 500 characters.' });
  }
  if (typeof display_name !== 'string' || !display_name.trim() || display_name.trim().length > 80) {
    return res.status(400).json({ error: 'Enter a name between 1 and 80 characters.' });
  }
  if (![null, 'on_campus', 'off_campus'].includes(housing)) {
    return res.status(400).json({ error: 'Invalid housing status.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users SET display_name = $1, housing = $2, biography = COALESCE($3, biography)
       WHERE id = $4 AND verified = TRUE
       RETURNING id, email, display_name, housing, biography, verified, created_at`,
      [display_name.trim(), housing, biography === undefined ? null : biography.trim(), req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found.' });
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Unable to update profile.' });
  }
});

// Full review history, separate from the lightweight rating summaries.
router.get('/:id/reviews/:role', async (req, res) => {
  const id = Number(req.params.id);
  const role = req.params.role;
  const rawOffset = req.query.offset ?? '0';
  const offset = Number(rawOffset);
  if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647 ||
      !['seller', 'buyer'].includes(role) || typeof rawOffset !== 'string' ||
      !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647) {
    return res.status(400).json({ error: 'Invalid review history request.' });
  }
  try {
    const student = await pool.query('SELECT id FROM users WHERE id = $1 AND verified = TRUE', [id]);
    if (!student.rows.length) return res.status(404).json({ error: 'Student not found.' });
    const sql = role === 'seller' ? `
      SELECT r.stars, r.comment, r.created_at AS review_date, u.display_name AS rater_name,
             d.item_snapshot->>'title' AS listing_title
      FROM seller_ratings r JOIN users u ON u.id = r.rater_id
      LEFT JOIN marketplace_deals d ON d.id = r.deal_id AND d.status = 'completed'
        AND d.seller_id = r.seller_id AND d.buyer_id = r.rater_id
      WHERE r.seller_id = $1 AND EXISTS (SELECT 1 FROM marketplace_deals eligible
        WHERE eligible.seller_id = r.seller_id AND eligible.buyer_id = r.rater_id AND eligible.status = 'completed')
      ORDER BY r.created_at DESC, r.id DESC LIMIT 21 OFFSET $2` : `
      SELECT r.stars, r.comment, r.updated_at AS review_date, u.display_name AS rater_name,
             d.item_snapshot->>'title' AS listing_title
      FROM buyer_reviews r JOIN marketplace_deals d ON d.id = r.deal_id
      JOIN users u ON u.id = d.seller_id
      WHERE d.buyer_id = $1 AND d.status = 'completed'
      ORDER BY r.updated_at DESC, r.deal_id DESC LIMIT 21 OFFSET $2`;
    const { rows } = await pool.query(sql, [id, offset]);
    res.json({ reviews: rows.slice(0, 20), next_offset: rows.length > 20 ? offset + 20 : null });
  } catch (err) {
    console.error('Review history error:', err);
    res.status(500).json({ error: 'Unable to load review history.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    return res.status(400).json({ error: 'Invalid student ID.' });
  }
  try {
    const isOwner = id === Number(req.user.id);
    const profile = await getProfile(id, isOwner);
    if (!profile) return res.status(404).json({ error: 'Student not found.' });
    res.json({ ...profile, is_owner: isOwner });
  } catch (err) {
    console.error('Public profile error:', err);
    res.status(500).json({ error: 'Unable to load student profile.' });
  }
});

module.exports = router;
