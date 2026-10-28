const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

// Only these email ending can sign up
const ALLOWED_DOMAINS = ['patriots.uttyler.edu', 'uttyler.edu'];

//Scramble a code so the real one is never stored
function hashCode(code) {
	return crypto.createHash('sha256').update(code).digest('hex');
}

//Step 1 of SIGN-UP: student sends their email, we make a code
router.post('/request-code', async (req,res) => {
	const email = String(req.body.email || '').trim().toLowerCase();
	const displayName = String(req.body.displayName || '').trim;

//Check it's a UT Tyler email
	const domain = email.split('@')[1];
	if (!ALLOWED_DOMAINS.includes(domain)) {
		return res.status(400).json({ error: 'Please use your UT Tyler email.'});
}

	try {
	// Is this student already signed up?
	let result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
	let userId;

	if (result.rows.length > 0) {
	userId = result.rows[0].id;
}	else {
	//New student: they need a name
	if (!displayName) {
		return res.status(400).json({ error: 'Please enter your name to sign up.' });
	}
	result = await pool.query(
	'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
	[email, displayName]
);
	userId = result.rows[0].id;
}

	//Cancel any older codes so only the newest one works
	await pool.query(
		'UPDATE verification_codes SET used = TRUE WHERE user_id = $1 AND used = FALSE',
		[userId]
	);

	//Make a random 6-digit code 
	const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');

	//Save only the scrambled version, good for 10 minutes
	await pool.query(
	"INSERT INTO verification_codes (user_id, code_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
	[userId, hashCode(code)]
	);
	
	//For now, print the code here instead of emailing it 
	console.log(`[DEV] Verification code for ${email}: ${code}`);

	res.json({ ok: true, message: 'Code sent! Check your email.'});
	} catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Something went wrong. Please try again.' });
	}
});

module.exports = router;



		
