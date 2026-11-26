const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const { DealError, cents, transition } = require('../deal-rules');
const router = express.Router();
router.use(requireUser, (req,res,next) => { res.setHeader('Cache-Control','private, no-store'); next(); });
const idOf = value => { const n = Number(value); if (!/^\d+$/.test(String(value)) || !Number.isInteger(n) || n < 1 || n > 2147483647) throw new DealError(400,'Invalid ID.'); return n; };
function fail(res, e) {
  if (e instanceof DealError) return res.status(e.status).json({error:e.message});
  console.error('Transactions:',e); res.status(500).json({error:'Unable to complete the transaction request.'});
}
async function atomic(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
const snapshot = l => Object.fromEntries(['title','description','price_cents','category','condition','meeting_spot','department','course_number','edition','author','isbn','width_measure','height_measure','depth_measure','dimension_unit'].map(k=>[k,l[k] ?? null]));
router.get('/', async (req,res) => {
  try {
    const {rows} = await pool.query(`SELECT d.*, l.status AS listing_status,
      CASE WHEN d.buyer_id = $1 THEN s.display_name ELSE b.display_name END AS other_name
      FROM marketplace_deals d JOIN listings l ON l.id=d.listing_id
      JOIN users s ON s.id=d.seller_id JOIN users b ON b.id=d.buyer_id
      WHERE d.buyer_id=$1 OR d.seller_id=$1
      ORDER BY CASE WHEN d.status IN ('pending','reserved') THEN 0 ELSE 1 END,d.updated_at DESC,d.id DESC`, [req.user.id]);
    res.json({user_id:req.user.id,deals:rows});
  } catch(e) { fail(res,e); }
});
router.post('/', async (req,res) => {
  try {
    const listingId = idOf(req.body?.listing_id), price = cents(req.body?.price_cents), buyer = req.user.id;
    const deal = await atomic(async c => {
      const l = (await c.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE',[listingId])).rows[0];
      if (!l || l.status !== 'active') throw new DealError(409,'This item is not available.');
      if (l.seller_id === buyer) throw new DealError(400,'You cannot make an offer on your own listing.');
      const seller = (await c.query('SELECT verified FROM users WHERE id=$1',[l.seller_id])).rows[0];
      if (!seller?.verified) throw new DealError(409,'Seller is not verified.');
      const old = (await c.query(`SELECT id FROM marketplace_deals WHERE listing_id=$1 AND buyer_id=$2 AND status IN ('pending','reserved')`,[listingId,buyer])).rows[0];
      if (old) throw new DealError(409,'You already have an open offer for this item. Review it in Transactions.');
      return (await c.query(`INSERT INTO marketplace_deals(listing_id,buyer_id,seller_id,price_cents,proposed_by,item_snapshot)
        VALUES($1,$2,$3,$4,$2,$5::jsonb) RETURNING *`,[listingId,buyer,l.seller_id,price,JSON.stringify(snapshot(l))])).rows[0];
    });
    res.status(201).json({deal});
  } catch(e) { fail(res,e); }
});
router.get('/:id/relist', async (req,res) => {
  try {
    const {rows} = await pool.query(`SELECT item_snapshot, price_cents FROM marketplace_deals
      WHERE id=$1 AND buyer_id=$2 AND status='completed'`,[idOf(req.params.id),req.user.id]);
    if (!rows.length) throw new DealError(404,'Completed purchase not found.');
    res.json({listing:{...rows[0].item_snapshot,price_cents:rows[0].price_cents,condition:'good',meeting_spot:null}});
  } catch(e) { fail(res,e); }
});
router.patch('/:id', async (req,res) => {
  try {
    const id = idOf(req.params.id), user = req.user.id;
    const deal = await atomic(async c => {
      // Lock listing first in every mutation, then the deal. Competing acceptances serialize.
      const ref = (await c.query(`SELECT listing_id FROM marketplace_deals WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)`,[id,user])).rows[0];
      if (!ref) throw new DealError(404,'Transaction not found.');
      const l = (await c.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id])).rows[0];
      const old = (await c.query('SELECT * FROM marketplace_deals WHERE id=$1 FOR UPDATE',[id])).rows[0];
      const next = transition(old,l,user,req.body || {});
      if (old.status === 'pending' && next.status === 'reserved') {
        await c.query(`UPDATE listings SET status='reserved' WHERE id=$1`,[l.id]);
        await c.query(`UPDATE marketplace_deals SET status='declined',revision=revision+1,updated_at=NOW()
          WHERE listing_id=$1 AND id<>$2 AND status='pending'`,[l.id,id]);
        next.item_snapshot = snapshot(l);
      } else if (old.status === 'reserved' && next.status === 'cancelled') {
        await c.query(`UPDATE listings SET status='active' WHERE id=$1 AND status='reserved'`,[l.id]);
      } else if (next.status === 'completed') {
        await c.query(`UPDATE listings SET status='sold' WHERE id=$1 AND status='reserved'`,[l.id]);
      }
      return (await c.query(`UPDATE marketplace_deals SET price_cents=$2,proposed_by=$3,status=$4,
        meetup_at=$5,meetup_spot=$6,meetup_by=$7,meetup_confirmed=$8,buyer_confirmed=$9,seller_confirmed=$10,
        item_snapshot=$11::jsonb,revision=revision+1,updated_at=NOW(),
        completed_at=CASE WHEN $4='completed' THEN NOW() ELSE completed_at END WHERE id=$1 RETURNING *`,
        [id,next.price_cents,next.proposed_by,next.status,next.meetup_at,next.meetup_spot,next.meetup_by,
         next.meetup_confirmed,next.buyer_confirmed,next.seller_confirmed,JSON.stringify(next.item_snapshot)])).rows[0];
    });
    res.json({deal});
  } catch(e) { fail(res,e); }
});
module.exports = router;
