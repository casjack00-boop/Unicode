const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const requireUser = require('../requireUser');

const router = express.Router();

// Only these email endings can sign up
const ALLOWED_DOMAINS = ['patriots.uttyler.edu', 'uttyler.edu'];

// Rules for codes and logins
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = 30;

// Scramble text (codes and login tickets) so the real value is never stored
function hashCode(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// STEP 1 OF SIGN-UP: student sends their email, we make a code
router.post('/request-code', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const displayName = String(req.body.displayName || '').trim();

  const domain = email.split('@')[1];
  if (!ALLOWED_DOMAINS.includes(domain)) {
    return res.status(400).json({ error: 'Please use your UT Tyler email.' });
  }

  try {
    let result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    let userId;

    if (result.rows.length > 0) {
      userId = result.rows[0].id;
    } else {
      if (!displayName) {
        return res.status(400).json({ error: 'Please enter your name to sign up.', needsName: true });
      }
      result = await pool.query(
        'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
        [email, displayName]
      );
      userId = result.rows[0].id;
    }

    await pool.query(
      'UPDATE verification_codes SET used = TRUE WHERE user_id = $1 AND used = FALSE',
      [userId]
    );

    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');

    await pool.query(
      "INSERT INTO verification_codes (user_id, code_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
      [userId, hashCode(code)]
    );

    console.log(`[DEV] Verification code for ${email}: ${code}`);

    res.json({ ok: true, message: 'Code sent! Check your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// STEP 2 OF SIGN-UP: student sends the code, we check it and log them in
router.post('/verify-code', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();

  const invalid = () =>
    res.status(400).json({ error: 'That code is invalid or expired. Request a new one.' });

  try {
    const result = await pool.query(
      `SELECT vc.id, vc.code_hash, vc.attempts, vc.expires_at, vc.user_id
       FROM verification_codes vc
       JOIN users u ON u.id = vc.user_id
       WHERE u.email = $1 AND vc.used = FALSE
       ORDER BY vc.created_at DESC
       LIMIT 1`,
      [email]
    );
    const record = result.rows[0];

    if (!record) return invalid();
    if (new Date(record.expires_at) < new Date()) return invalid();
    if (record.attempts >= MAX_ATTEMPTS) return invalid();

    if (hashCode(code) !== record.code_hash) {
      await pool.query(
        'UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1',
        [record.id]
      );
      return invalid();
    }

    await pool.query('UPDATE verification_codes SET used = TRUE WHERE id = $1', [record.id]);
    await pool.query('UPDATE users SET verified = TRUE WHERE id = $1', [record.user_id]);

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
      [hashCode(token), record.user_id]
    );

    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });

    res.json({ ok: true, message: 'You are verified and logged in!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// WHO AM I: returns the logged-in student
router.get('/me', requireUser, (req, res) => {
  res.json({ user: req.user });
});

// LOG OUT: deletes the session and clears the cookie
router.post('/logout', async (req, res) => {
  const token = req.cookies.session;
  if (token) {
    try {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashCode(token)]);
    } catch (err) {
      console.error(err);
    }
  }
  res.clearCookie('session');
  res.json({ ok: true, message: 'Logged out.' });
});

module.exports = router;