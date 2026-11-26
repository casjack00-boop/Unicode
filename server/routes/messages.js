const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const {safetyError} = require('../safety-rules');
const router = express.Router();

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(requireUser);

function validId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

// Only participants can access a conversation. Never return email addresses.
const conversationFields = `c.id, c.listing_id, c.buyer_id, c.seller_id,
  l.title AS listing_title, l.price_cents, l.status AS listing_status,
  u.id AS other_id, u.display_name AS other_name, u.verified AS other_verified`;
const conversationJoins = `FROM conversations c JOIN listings l ON l.id = c.listing_id
  JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END`;
const participant = `(c.buyer_id = $1 OR c.seller_id = $1)`;

function fail(res, err) {
  if (safetyError(err,res)) return;
  console.error('Messaging error:', err);
  res.status(500).json({ error: 'Unable to complete the messaging request.' });
}

// Inbox, newest activity first. Empty conversations are visible only to their buyer.
router.get('/conversations', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${conversationFields}, latest.body AS last_message, latest.created_at AS last_at,
        (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id
          AND m.sender_id <> $1 AND m.read_at IS NULL) AS unread_count
       ${conversationJoins}
       LEFT JOIN LATERAL (SELECT body, created_at FROM messages WHERE conversation_id = c.id
         ORDER BY id DESC LIMIT 1) latest ON TRUE
       WHERE ${participant} AND (latest.created_at IS NOT NULL OR c.buyer_id = $1)
       ORDER BY COALESCE(latest.created_at, c.created_at) DESC, c.id DESC`, [req.user.id]);
    res.json({ conversations: result.rows });
  } catch (err) { fail(res, err); }
});

// Start or reopen one conversation per buyer and listing. The seller is derived from the DB.
router.post('/conversations', async (req, res) => {
  const listingId = validId(req.body?.listing_id);
  if (!listingId) return res.status(400).json({ error: 'Invalid listing ID.' });
  try {
    const listing = (await pool.query(
      `SELECT l.seller_id, l.status, u.verified FROM listings l
       JOIN users u ON u.id = l.seller_id WHERE l.id = $1`, [listingId])).rows[0];
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    if (listing.seller_id === req.user.id) return res.status(400).json({ error: 'You cannot message yourself about your own listing.' });
    const block = await pool.query('SELECT uni_contact_blocked($1,$2) AS blocked',[req.user.id,listing.seller_id]);
    if (block.rows[0].blocked) return res.status(403).json({error:'Contact with this student is unavailable.'});
    const existing = await pool.query(
      `SELECT id FROM conversations WHERE listing_id = $1 AND buyer_id = $2 AND seller_id = $3`,
      [listingId, req.user.id, listing.seller_id]);
    if (existing.rows.length) return res.json({ id: existing.rows[0].id });
    if (listing.status !== 'active' || !listing.verified) return res.status(404).json({ error: 'This listing is no longer available.' });
    const result = await pool.query(
      `INSERT INTO conversations (listing_id, buyer_id, seller_id)
       SELECT l.id, $2, l.seller_id FROM listings l JOIN users u ON u.id = l.seller_id
       WHERE l.id = $1 AND l.status = 'active' AND u.verified AND l.seller_id <> $2
       ON CONFLICT (listing_id, buyer_id, seller_id) DO UPDATE SET listing_id = EXCLUDED.listing_id
       RETURNING id`, [listingId, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'This listing is no longer available.' });
    res.json({ id: result.rows[0].id });
  } catch (err) { fail(res, err); }
});

// Chat history. An unauthorized ID is treated as not found.
router.get('/conversations/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid conversation ID.' });
  try {
    const result = await pool.query(`SELECT ${conversationFields}, uni_contact_blocked(c.buyer_id,c.seller_id) AS contact_blocked ${conversationJoins}
      WHERE ${participant} AND c.id = $2`, [req.user.id, id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Conversation not found.' });
    const history = await pool.query(`SELECT m.id, m.sender_id, m.body, m.created_at, m.read_at, m.reply_to_id,
        parent.body AS reply_body, parent.sender_id AS reply_sender_id
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN messages parent ON parent.id = m.reply_to_id AND parent.conversation_id = m.conversation_id
      WHERE ${participant} AND c.id = $2 ORDER BY m.id`, [req.user.id, id]);
    res.json({ conversation: result.rows[0], messages: history.rows, user_id: req.user.id });
  } catch (err) { fail(res, err); }
});

// Insert only if the authenticated student is a participant; sender ID comes from session.
router.post('/conversations/:id', async (req, res) => {
  const id = validId(req.params.id);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!id) return res.status(400).json({ error: 'Invalid conversation ID.' });
  const replyTo = req.body?.reply_to_id == null ? null : validId(req.body.reply_to_id);
  if (req.body?.reply_to_id != null && !replyTo) return res.status(400).json({ error: 'Invalid reply message.' });
  if (!body || body.length > 2000 || body.includes('\u0000')) return res.status(400).json({ error: 'Enter a message between 1 and 2000 characters.' });
  try {
    const result = await pool.query(`INSERT INTO messages (conversation_id, sender_id, body, reply_to_id)
      SELECT c.id, $1, $3, $4 FROM conversations c WHERE ${participant} AND c.id = $2
      AND ($4::integer IS NULL OR EXISTS (SELECT 1 FROM messages parent WHERE parent.id = $4 AND parent.conversation_id = c.id))
      RETURNING id, sender_id, body, created_at, read_at, reply_to_id`, [req.user.id, id, body, replyTo]);
    if (!result.rows.length) return res.status(404).json({ error: 'Conversation not found.' });
    res.status(201).json({ message: result.rows[0] });
  } catch (err) { fail(res, err); }
});

// Mark only received messages that the browser has actually loaded as read.
router.patch('/conversations/:id/read', async (req, res) => {
  const id = validId(req.params.id);
  const through = validId(req.body?.through_id);
  if (!id || !through) return res.status(400).json({ error: 'Invalid conversation or message ID.' });
  try {
    const result = await pool.query(`SELECT 1 FROM conversations c WHERE ${participant} AND c.id = $2`, [req.user.id, id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Conversation not found.' });
    await pool.query(`UPDATE messages m SET read_at = NOW() FROM conversations c
      WHERE c.id = m.conversation_id AND ${participant} AND c.id = $2
      AND m.sender_id <> $1 AND m.id <= $3 AND m.read_at IS NULL`, [req.user.id, id, through]);
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

module.exports = router;
