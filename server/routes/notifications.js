const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const { parseSearch, parsePreferences, validId } = require('../notification-rules');
const router = express.Router();
router.use(requireUser, (req,res,next) => { res.setHeader('Cache-Control','private, no-store'); next(); });
const fail = (res,e) => { console.error('Notifications:',e); res.status(500).json({error:'Unable to update notifications. Try again.'}); };
router.get('/count', async (req,res) => {
  try { const {rows} = await pool.query('SELECT count(*)::int AS unread FROM notifications WHERE user_id=$1 AND read_at IS NULL',[req.user.id]); res.json(rows[0]); } catch(e) { fail(res,e); }
});
router.get('/', async (req,res) => {
  const before = req.query.before ?? null;
  if (before !== null && !validId(before)) return res.status(400).json({error:'Invalid cursor.'});
  try { const {rows} = await pool.query(`SELECT id,kind,body,target_id,created_at,read_at FROM notifications
    WHERE user_id=$1 AND ($2::bigint IS NULL OR id<$2) ORDER BY id DESC LIMIT 51`,[req.user.id,before]);
    res.json({notifications:rows.slice(0,50), next:rows.length>50 ? rows[49].id : null}); } catch(e) { fail(res,e); }
});
router.patch('/read-all', async (req,res) => {
  try { await pool.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',[req.user.id]); res.json({ok:true}); } catch(e) { fail(res,e); }
});
router.patch('/:id/read', async (req,res) => {
  if (!validId(req.params.id)) return res.status(400).json({error:'Invalid ID.'});
  try { const {rowCount} = await pool.query('UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
    if (!rowCount) return res.status(404).json({error:'Notification not found.'}); res.json({ok:true}); } catch(e) { fail(res,e); }
});
router.get('/preferences', async (req,res) => {
  try { const {rows} = await pool.query('SELECT messages,transactions,price_drops,saved_searches FROM notification_preferences WHERE user_id=$1',[req.user.id]);
    res.json(rows[0] || {messages:true,transactions:true,price_drops:true,saved_searches:true}); } catch(e) { fail(res,e); }
});
router.put('/preferences', async (req,res) => {
  const values = parsePreferences(req.body);
  if (!values) return res.status(400).json({error:'Each preference must be true or false.'});
  try { await pool.query(`INSERT INTO notification_preferences(user_id,messages,transactions,price_drops,saved_searches) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(user_id) DO UPDATE SET messages=excluded.messages,transactions=excluded.transactions,price_drops=excluded.price_drops,saved_searches=excluded.saved_searches`,[req.user.id,...values]); res.json({ok:true}); } catch(e) { fail(res,e); }
});
router.get('/searches', async (req,res) => {
  try { const {rows} = await pool.query('SELECT id,term,category,max_price_cents FROM saved_searches WHERE user_id=$1 ORDER BY id DESC',[req.user.id]); res.json({searches:rows}); } catch(e) { fail(res,e); }
});
router.post('/searches', async (req,res) => {
  const search = parseSearch(req.body);
  if (!search) return res.status(400).json({error:'Enter a keyword or ISBN, category and optional valid maximum price.'});
  let c;
  try { c = await pool.connect(); await c.query('BEGIN'); await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    const {rows} = await c.query('SELECT count(*)::int AS n FROM saved_searches WHERE user_id=$1',[req.user.id]);
    if (rows[0].n>=20) { await c.query('ROLLBACK'); return res.status(409).json({error:'You may save up to 20 searches.'}); }
    const result = await c.query(`INSERT INTO saved_searches(user_id,term,isbn,category,max_price_cents) VALUES($1,$2,$3,$4,$5) RETURNING id`,[req.user.id,search.term,search.isbn,search.category,search.max]);
    await c.query('COMMIT'); res.status(201).json(result.rows[0]);
  } catch(e) { if(c) await c.query('ROLLBACK').catch(()=>{}); fail(res,e); } finally { if(c) c.release(); }
});
router.delete('/searches/:id', async (req,res) => {
  if (!validId(req.params.id) || Number(req.params.id)>2147483647) return res.status(400).json({error:'Invalid ID.'});
  try { const {rowCount} = await pool.query('DELETE FROM saved_searches WHERE user_id=$1 AND id=$2',[req.user.id,req.params.id]);
    if(!rowCount) return res.status(404).json({error:'Saved search not found.'}); res.json({ok:true}); } catch(e) { fail(res,e); }
});
module.exports = router;
