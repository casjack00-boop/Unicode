// UniMarket student profiles. Reuses the existing users and listings tables.
const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const router = express.Router();

router.use(requireUser);

async function getProfile(id, includeEmail) {
  const { rows } = await pool.query(
    `SELECT id, display_name, housing, verified, created_at${includeEmail ? ', email' : ''}
       FROM users WHERE id = $1 AND verified = TRUE`, [id]
  );
  if (!rows.length) return null;
  const listings = await pool.query(
    `SELECT l.id, l.title, l.price_cents,
       (SELECT p.url FROM listing_photos p WHERE p.listing_id = l.id
        ORDER BY p.position LIMIT 1) AS photo_url
     FROM listings l WHERE l.seller_id = $1 AND l.status = 'active'
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
  const { display_name, housing } = req.body || {};
  if (typeof display_name !== 'string' || !display_name.trim() || display_name.trim().length > 80) {
    return res.status(400).json({ error: 'Enter a name between 1 and 80 characters.' });
  }
  if (![null, 'on_campus', 'off_campus'].includes(housing)) {
    return res.status(400).json({ error: 'Invalid housing status.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users SET display_name = $1, housing = $2
       WHERE id = $3 AND verified = TRUE
       RETURNING id, email, display_name, housing, verified, created_at`,
      [display_name.trim(), housing, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found.' });
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Unable to update profile.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    return res.status(400).json({ error: 'Invalid student ID.' });
  }
  try {
    const profile = await getProfile(id, false);
    if (!profile) return res.status(404).json({ error: 'Student not found.' });
    res.json(profile);
  } catch (err) {
    console.error('Public profile error:', err);
    res.status(500).json({ error: 'Unable to load student profile.' });
  }
});

module.exports = router;
