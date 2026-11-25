// UniMarket: roommate finder
//   GET   /api/roommates             -> active posts (filters: location, maxBudget)
//   POST  /api/roommates             -> post a roommate listing (must be logged in)
//   PATCH /api/roommates/:id/remove  -> take down your own post

const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');

const router = express.Router();

const LOCATIONS = ['on_campus', 'off_campus', 'either'];

function cleanText(value, max) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

// Browse roommate posts
router.get('/', async (req, res) => {
  const conditions = ["r.status = 'active'"];
  const values = [];

  // On campus / off campus filter ("either" posts match both)
  if (req.query.location === 'on_campus' || req.query.location === 'off_campus') {
    values.push(req.query.location);
    conditions.push(`(r.location = $${values.length} OR r.location = 'either')`);
  }

  // Max budget in dollars
  const maxBudget = Number(req.query.maxBudget);
  if (req.query.maxBudget && Number.isFinite(maxBudget) && maxBudget >= 0) {
    values.push(Math.round(maxBudget * 100));
    conditions.push(`r.budget_cents <= $${values.length}`);
  }

  try {
    const result = await pool.query(
      `SELECT r.id, r.user_id, r.title, r.budget_cents, r.move_in, r.lease_months,
              r.location, r.has_place, r.about, r.created_at,
              u.display_name AS poster_name
         FROM roommate_posts r
         JOIN users u ON u.id = r.user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.created_at DESC
        LIMIT 100`,
      values
    );
    res.json({ posts: result.rows });
  } catch (error) {
    console.error('Roommates list error:', error);
    res.status(500).json({ error: 'Unable to load roommate posts.' });
  }
});

// Post a roommate listing
router.post('/', requireUser, async (req, res) => {
  const title = cleanText(req.body.title, 80);
  const about = cleanText(req.body.about, 1000);
  const budget = Number(req.body.budget);
  const location = req.body.location;
  const hasPlace = req.body.hasPlace === true;
  const leaseMonths = req.body.leaseMonths ? Number(req.body.leaseMonths) : null;
  const moveIn = req.body.moveIn ? String(req.body.moveIn) : null;

  if (!title) {
    return res.status(400).json({ error: 'Add a title (80 characters max).' });
  }
  if (!Number.isFinite(budget) || budget < 0 || budget > 5000) {
    return res.status(400).json({ error: 'Monthly budget must be between $0 and $5,000.' });
  }
  if (!LOCATIONS.includes(location)) {
    return res.status(400).json({ error: 'Pick on campus, off campus, or either.' });
  }
  if (leaseMonths !== null && (!Number.isInteger(leaseMonths) || leaseMonths < 1 || leaseMonths > 24)) {
    return res.status(400).json({ error: 'Lease length must be 1 to 24 months.' });
  }
  if (moveIn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(moveIn)) {
    return res.status(400).json({ error: 'Pick a move-in date.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO roommate_posts
         (user_id, title, budget_cents, move_in, lease_months, location, has_place, about)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [req.user.id, title, Math.round(budget * 100), moveIn, leaseMonths, location, hasPlace, about]
    );
    res.status(201).json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Roommate post error:', error);
    res.status(500).json({ error: 'Unable to save your post.' });
  }
});

// Take down your own post
router.patch('/:id/remove', requireUser, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }
  try {
    const result = await pool.query(
      `UPDATE roommate_posts SET status = 'removed'
        WHERE id = $1 AND user_id = $2 AND status = 'active'
        RETURNING id`,
      [id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Post not found.' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Roommate remove error:', error);
    res.status(500).json({ error: 'Unable to remove your post.' });
  }
});

module.exports = router;