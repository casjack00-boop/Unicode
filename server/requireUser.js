const crypto = require('crypto');
const pool = require('./db');

// Gatekeeper: only lets logged-in, verified students through
async function requireUser(req, res, next) {
  const token = req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: 'Please log in.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.housing
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.verified = TRUE`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Please log in.' });
    }

    // Attach the student to the request so the next step knows who it is
    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

module.exports = requireUser;