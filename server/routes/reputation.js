const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const router = express.Router();
router.use(requireUser, (req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
const idOf = v => /^\d+$/.test(String(v)) && Number(v)>0 && Number(v)<=2147483647 ? Number(v) : null;
const textOf = (v,max) => typeof v==='string' && v.trim().length<=max ? v.trim() : null;
function fail(res,e){console.error('Reputation:',e.code||e.name);return res.status(500).json({error:'Unable to complete this request.'});}
// Seller-to-buyer reviews are separate from the existing buyer-to-seller rating system.
router.get('/buyer/:id',async(req,res)=>{
  const id=idOf(req.params.id);if(!id)return res.status(400).json({error:'Invalid student ID.'});
  try{
    const {rows}=await pool.query(`SELECT COUNT(r.deal_id)::int AS count, ROUND(AVG(r.stars),1)::float AS average,
      COUNT(d.id)::int AS completed_purchases FROM marketplace_deals d LEFT JOIN buyer_reviews r ON r.deal_id=d.id
      WHERE d.buyer_id=$1 AND d.status='completed'`,[id]);
    const sold=await pool.query(`SELECT count(*)::int AS completed_sales FROM marketplace_deals WHERE seller_id=$1 AND status='completed'`,[id]);
    const recent=await pool.query(`SELECT r.stars,r.comment,r.updated_at,u.display_name AS rater_name FROM buyer_reviews r
      JOIN marketplace_deals d ON d.id=r.deal_id JOIN users u ON u.id=d.seller_id
      WHERE d.buyer_id=$1 AND d.status='completed' ORDER BY r.updated_at DESC LIMIT 5`,[id]);
    res.json({...rows[0],...sold.rows[0],recent:recent.rows});
  }catch(e){fail(res,e);}
});
router.get('/deals/:id',async(req,res)=>{
  const id=idOf(req.params.id);if(!id)return res.status(400).json({error:'Invalid transaction ID.'});
  try{
    const {rows}=await pool.query(`SELECT d.id,d.status,d.seller_id,d.buyer_id,
      CASE WHEN d.seller_id=$2 THEN br.stars ELSE sr.stars END AS stars,
      CASE WHEN d.seller_id=$2 THEN br.comment ELSE sr.comment END AS comment,
      p.id AS dispute_id,p.status AS dispute_status FROM marketplace_deals d
      LEFT JOIN buyer_reviews br ON br.deal_id=d.id AND d.seller_id=$2
      LEFT JOIN seller_ratings sr ON sr.seller_id=d.seller_id AND sr.rater_id=d.buyer_id AND d.buyer_id=$2
      LEFT JOIN transaction_disputes p ON p.deal_id=d.id AND p.reporter_id=$2
      WHERE d.id=$1 AND $2 IN(d.buyer_id,d.seller_id)`,[id,req.user.id]);
    if(!rows.length)return res.status(404).json({error:'Transaction not found.'});res.json(rows[0]);
  }catch(e){fail(res,e);}
});
router.post('/deals/:id/review',async(req,res)=>{
  const id=idOf(req.params.id),stars=req.body?.stars,comment=textOf(req.body?.comment??'',300);
  if(!id||!Number.isInteger(stars)||stars<1||stars>5||comment===null)return res.status(400).json({error:'Choose 1–5 stars and enter up to 300 characters.'});
  try{
    const {rows}=await pool.query(`SELECT buyer_id,seller_id FROM marketplace_deals WHERE id=$1 AND status='completed' AND $2 IN(buyer_id,seller_id)`,[id,req.user.id]);
    if(!rows.length)return res.status(403).json({error:'Only participants in a completed exchange can review it.'});
    const d=rows[0];
    if(d.seller_id===req.user.id){
      await pool.query(`INSERT INTO buyer_reviews(deal_id,stars,comment) VALUES($1,$2,$3)
        ON CONFLICT(deal_id) DO UPDATE SET stars=EXCLUDED.stars,comment=EXCLUDED.comment,updated_at=NOW()`,[id,stars,comment]);
    }else{
      await pool.query(`INSERT INTO seller_ratings(seller_id,rater_id,stars,comment,deal_id) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(seller_id,rater_id) DO UPDATE SET stars=EXCLUDED.stars,comment=EXCLUDED.comment,deal_id=EXCLUDED.deal_id,created_at=NOW()`,[d.seller_id,req.user.id,stars,comment||null,id]);
    }
    res.json({ok:true});
  }catch(e){fail(res,e);}
});
router.post('/deals/:id/dispute',async(req,res)=>{
  const id=idOf(req.params.id),details=textOf(req.body?.details,1000);
  if(!id||!details)return res.status(400).json({error:'Enter a description of 1–1000 characters.'});
  try{
    const result=await pool.query(`INSERT INTO transaction_disputes(deal_id,reporter_id,details)
      SELECT id,$2,$3 FROM marketplace_deals WHERE id=$1 AND $2 IN(buyer_id,seller_id) AND status IN('reserved','completed','cancelled')
      ON CONFLICT(deal_id,reporter_id) DO NOTHING RETURNING id`,[id,req.user.id,details]);
    if(!result.rowCount)return res.status(409).json({error:'This exchange is not eligible or you already submitted a dispute.'});
    res.status(201).json({id:result.rows[0].id});
  }catch(e){fail(res,e);}
});
router.get('/admin-access',async(req,res)=>{
  try{const {rows}=await pool.query('SELECT EXISTS(SELECT 1 FROM moderation_admins WHERE user_id=$1) AS allowed',[req.user.id]);res.json(rows[0]);}catch(e){fail(res,e);}
});
async function requireAdmin(req,res,next){
  try{const {rows}=await pool.query('SELECT 1 FROM moderation_admins WHERE user_id=$1',[req.user.id]);if(!rows.length)return res.status(403).json({error:'Moderator access required.'});next();}catch(e){fail(res,e);}
}
router.get('/moderation',requireAdmin,async(req,res)=>{
  const state=req.query.status||'open';if(!['open','reviewed','dismissed'].includes(state))return res.status(400).json({error:'Invalid status.'});
  try{
    const reports=await pool.query(`SELECT id,target_type,reporter_id,reported_user_id,listing_id,message_id,reason,details,evidence,status,created_at
      FROM safety_reports WHERE status=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[state]);
    const disputes=await pool.query(`SELECT p.*,d.buyer_id,d.seller_id,d.status AS deal_status,d.item_snapshot->>'title' AS title
      FROM transaction_disputes p JOIN marketplace_deals d ON d.id=p.deal_id WHERE p.status=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 100`,[state]);
    res.json({reports:reports.rows,disputes:disputes.rows});
  }catch(e){fail(res,e);}
});
router.patch('/moderation/:type/:id',requireAdmin,async(req,res)=>{
  const table={report:'safety_reports',dispute:'transaction_disputes'}[req.params.type],id=idOf(req.params.id),state=req.body?.status;
  if(!['report','dispute'].includes(req.params.type)||!id||!['reviewed','dismissed'].includes(state))return res.status(400).json({error:'Invalid moderation action.'});
  try{
    // The authorisation is repeated within the atomic update; the audit record is inseparable from it.
    const result=await pool.query(`WITH changed AS (UPDATE ${table} SET status=$2 WHERE id=$1 AND status='open'
      AND EXISTS(SELECT 1 FROM moderation_admins WHERE user_id=$3) RETURNING id)
      INSERT INTO moderation_actions(admin_id,target_type,target_id,old_status,new_status)
      SELECT $3,$4,id,'open',$2 FROM changed RETURNING id`,[id,state,req.user.id,req.params.type]);
    if(!result.rowCount)return res.status(409).json({error:'Case not open or no longer authorised.'});res.json({ok:true});
  }catch(e){fail(res,e);}
});
module.exports=router;
