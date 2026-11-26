const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const { parsePreferences, parseRequest, validId } = require('../academic-rules');
const router = express.Router();
router.use(requireUser, (req,res,next) => { res.setHeader('Cache-Control','private, no-store'); next(); });
const fail = (res,e) => { console.error('Academic discovery:',e); res.status(500).json({error:'Unable to complete this request.'}); };
const fields = `l.id,l.title,l.price_cents,l.condition,l.category,l.status,l.department,l.course_number,
  (SELECT url FROM listing_photos WHERE listing_id=l.id ORDER BY position LIMIT 1) AS photo_url`;
// Use the authenticated account only; do not expose personal academic preferences to others.
router.get('/preferences', async (req,res) => {
  try { const {rows}=await pool.query('SELECT major,department FROM academic_preferences WHERE user_id=$1',[req.user.id]);
    res.json(rows[0] || {major:null,department:null}); } catch(e){fail(res,e);}
});
router.put('/preferences', async (req,res) => {
  const prefs=parsePreferences(req.body);
  if (!prefs) return res.status(400).json({error:'Enter a valid major and department code.'});
  try { await pool.query(`INSERT INTO academic_preferences(user_id,major,department) VALUES($1,$2,$3)
    ON CONFLICT(user_id) DO UPDATE SET major=excluded.major,department=excluded.department`,[req.user.id,prefs.major,prefs.department]);
    res.json({ok:true}); } catch(e){fail(res,e);}
});
router.get('/recommendations', async (req,res) => {
  try { const {rows}=await pool.query(`SELECT ${fields} FROM listings l JOIN academic_preferences a ON a.user_id=$1
    WHERE l.status='active' AND l.category='textbooks' AND upper(l.department)=a.department AND l.seller_id<>$1
    AND NOT EXISTS (SELECT 1 FROM users su WHERE su.id=l.seller_id AND su.suspended_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=l.seller_id) OR (b.blocked_id=$1 AND b.blocker_id=l.seller_id))
    ORDER BY l.created_at DESC,l.id DESC LIMIT 12`,[req.user.id]); res.json({listings:rows}); } catch(e){fail(res,e);}
});
router.get('/trending', async (req,res) => {
  try { const {rows}=await pool.query(`SELECT ${fields}, s.saves FROM listings l JOIN
    (SELECT sl.listing_id,count(*)::int AS saves FROM saved_listings sl JOIN listings t ON t.id=sl.listing_id
      WHERE sl.saved_at>=now()-interval '7 days' AND sl.user_id<>t.seller_id GROUP BY sl.listing_id) s ON s.listing_id=l.id
    WHERE l.status='active' AND NOT EXISTS (SELECT 1 FROM users su WHERE su.id=l.seller_id AND su.suspended_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=l.seller_id) OR (b.blocked_id=$1 AND b.blocker_id=l.seller_id))
    ORDER BY s.saves DESC,l.created_at DESC,l.id DESC LIMIT 12`,[req.user.id]); res.json({listings:rows}); } catch(e){fail(res,e);}
});
router.get('/requests', async (req,res) => {
  try { const {rows}=await pool.query(`SELECT r.id,r.title,r.isbn,r.department,r.course,r.notes,r.max_price_cents,r.created_at,r.status,
    u.display_name, u.id AS requester_id, (r.user_id=$1) AS own FROM textbook_requests r JOIN users u ON u.id=r.user_id
    WHERE u.verified AND u.suspended_at IS NULL AND (r.status='active' OR r.user_id=$1)
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=r.user_id) OR (b.blocked_id=$1 AND b.blocker_id=r.user_id))
    ORDER BY (r.status='active') DESC,(r.user_id=$1) DESC,r.created_at DESC,r.id DESC LIMIT 100`,[req.user.id]); res.json({requests:rows}); } catch(e){fail(res,e);}
});
router.post('/requests', async (req,res) => {
  const r=parseRequest(req.body);
  if(!r) return res.status(400).json({error:'Enter a title and valid optional ISBN, course and budget.'});
  let c;
  try { c=await pool.connect(); await c.query('BEGIN'); await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    const {rows}=await c.query("SELECT count(*)::int AS n FROM textbook_requests WHERE user_id=$1 AND status='active'",[req.user.id]);
    if(rows[0].n>=10){await c.query('ROLLBACK'); return res.status(409).json({error:'Close an existing request before creating another (limit 10).'});}
    const result=await c.query(`INSERT INTO textbook_requests(user_id,title,isbn,department,course,notes,max_price_cents)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[req.user.id,r.title,r.isbn,r.department,r.course,r.notes,r.max]);
    await c.query('COMMIT'); res.status(201).json(result.rows[0]);
  } catch(e){if(c)await c.query('ROLLBACK').catch(()=>{}); fail(res,e);} finally{c?.release();}
});
router.patch('/requests/:id/close', async (req,res) => {
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid request.'});
  try { const {rowCount}=await pool.query("UPDATE textbook_requests SET status='closed' WHERE id=$1 AND user_id=$2 AND status='active'",[req.params.id,req.user.id]);
    if(!rowCount)return res.status(404).json({error:'Active request not found.'}); res.json({ok:true}); } catch(e){fail(res,e);}
});
router.get('/requests/:id/matches', async (req,res) => {
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid request.'});
  try { const {rows}=await pool.query(`SELECT ${fields} FROM textbook_requests r JOIN listings l ON uni_textbook_match(r,l)
    WHERE r.id=$2 AND r.status='active' AND EXISTS (SELECT 1 FROM users u WHERE u.id=r.user_id AND u.verified AND u.suspended_at IS NULL) AND NOT EXISTS (SELECT 1 FROM users su WHERE su.id=l.seller_id AND su.suspended_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE
      (b.blocker_id=$1 AND b.blocked_id IN (r.user_id,l.seller_id)) OR (b.blocked_id=$1 AND b.blocker_id IN (r.user_id,l.seller_id)))
    ORDER BY l.price_cents,l.id DESC LIMIT 20`,[req.user.id,req.params.id]); res.json({listings:rows}); } catch(e){fail(res,e);}
});
module.exports=router;
