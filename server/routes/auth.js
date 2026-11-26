const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const requireUser = require('../requireUser');
const {mailMode,sendCode}=require('../mail');

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

// Keep development console codes available; production requires configured email delivery.
router.post('/request-code', async (req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  const displayName=String(req.body?.displayName||'').trim();
  if(email.length>254||!/^[^@\s]+@[^@\s]+$/.test(email)||!ALLOWED_DOMAINS.includes(email.split('@')[1]))
    return res.status(400).json({error:'Please use your UT Tyler email.'});
  if(displayName.length>100)return res.status(400).json({error:'Name must be at most 100 characters.'});
  let mode;try{mode=mailMode();}catch(e){return res.status(503).json({error:'Email delivery is not configured. Contact the project administrator.'});}
  let c;try{
    c=await pool.connect();await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(71304,hashtext($1))',[email]);
    let user=(await c.query('SELECT id,suspended_at FROM users WHERE email=$1 FOR UPDATE',[email])).rows[0];
    if(!user){if(!displayName){await c.query('ROLLBACK');return res.status(400).json({error:'Please enter your name to sign up.',needsName:true});}
      user=(await c.query('INSERT INTO users(email,display_name) VALUES($1,$2) RETURNING id,suspended_at',[email,displayName])).rows[0];}
    if(user.suspended_at){await c.query('ROLLBACK');return res.status(403).json({error:'Account unavailable. Contact the project administrator.'});}
    const limits=(await c.query(`SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour')::int AS hourly,
      count(*) FILTER(WHERE created_at>now()-interval '60 seconds')::int AS recent FROM verification_codes WHERE user_id=$1`,[user.id])).rows[0];
    if(limits.hourly>=5||limits.recent){await c.query('ROLLBACK');return res.status(429).json({error:'Please wait before requesting another code (maximum five per hour).'});}
    await c.query('UPDATE verification_codes SET used=true WHERE user_id=$1 AND NOT used',[user.id]);
    const code=crypto.randomInt(0,1000000).toString().padStart(6,'0');
    const issued=(await c.query("INSERT INTO verification_codes(user_id,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes') RETURNING id",[user.id,hashCode(code)])).rows[0];
    // Commit a request before delivery so provider failures still count against throttling.
    await c.query('COMMIT');
    try{const emailed=await sendCode(email,code);if(emailed)await c.query('UPDATE verification_codes SET delivered_by_email=true WHERE id=$1 AND NOT used',[issued.id]);}catch(e){await c.query('UPDATE verification_codes SET used=true WHERE id=$1',[issued.id]);return res.status(503).json({error:'Unable to deliver a verification code. Please try again later.'});}
    res.json({ok:true,message:mode==='email'?'Code sent! Check your email.':'Development code generated. Check the local server console.'});
  }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});console.error('Auth request:',e.code||e.name);res.status(500).json({error:'Something went wrong. Please try again.'});}finally{c?.release();}
});

router.post('/verify-code',async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase(),code=String(req.body?.code||'').trim();
  const invalid=()=>res.status(400).json({error:'That code is invalid or expired. Request a new one.'});
  if(email.length>254||!/^\d{6}$/.test(code))return invalid();
  let mode;try{mode=mailMode();}catch(e){return res.status(503).json({error:'Email delivery is not configured.'});}
  let c;try{c=await pool.connect();await c.query('BEGIN');
    const user=(await c.query('SELECT id,suspended_at FROM users WHERE email=$1 FOR UPDATE',[email])).rows[0];
    if(!user||user.suspended_at){await c.query('ROLLBACK');return invalid();}
    const r=(await c.query(`SELECT id,code_hash,attempts,delivered_by_email FROM verification_codes
      WHERE user_id=$1 AND NOT used AND expires_at>now() ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,[user.id])).rows[0];
    if(!r||r.attempts>=MAX_ATTEMPTS||(mode==='email'&&!r.delivered_by_email)){await c.query('ROLLBACK');return invalid();}
    if(hashCode(code)!==r.code_hash){await c.query('UPDATE verification_codes SET attempts=attempts+1 WHERE id=$1',[r.id]);await c.query('COMMIT');return invalid();}
    await c.query('UPDATE verification_codes SET used=true WHERE id=$1',[r.id]);
    await c.query('UPDATE users SET verified=true,email_verified_at=CASE WHEN $2 THEN now() ELSE email_verified_at END WHERE id=$1',[user.id,r.delivered_by_email]);
    const token=crypto.randomBytes(32).toString('hex');
    await c.query("INSERT INTO sessions(token_hash,user_id,expires_at,email_authenticated) VALUES($1,$2,now()+interval '30 days',$3)",[hashCode(token),user.id,r.delivered_by_email]);
    await c.query('COMMIT');
    res.cookie('session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:SESSION_DAYS*24*60*60*1000});
    res.json({ok:true,message:'You are verified and logged in!'});
  }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});console.error('Auth verify:',e.code||e.name);res.status(500).json({error:'Something went wrong. Please try again.'});}finally{c?.release();}
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