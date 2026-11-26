const express=require('express');
const pool=require('../db');
const requireUser=require('../requireUser');
const router=express.Router();
router.use(requireUser,(req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
const idOf=v=>/^\d+$/.test(String(v))&&Number(v)>0&&Number(v)<=2147483647?Number(v):null;
const textOf=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max?v.trim():null;
const fail=(res,e)=>{console.error('Support:',e.code||e.name);res.status(500).json({error:'Unable to complete this request.'});};
async function admin(req,res,next){try{const r=await pool.query('SELECT 1 FROM moderation_admins WHERE user_id=$1',[req.user.id]);if(!r.rowCount)return res.status(403).json({error:'Moderator access required.'});next();}catch(e){fail(res,e);}}
router.get('/tickets',async(req,res)=>{try{const r=await pool.query('SELECT id,subject,details,status,reply,created_at,resolved_at FROM support_tickets WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[req.user.id]);res.json({tickets:r.rows});}catch(e){fail(res,e);}});
router.post('/tickets',async(req,res)=>{
  const subject=textOf(req.body?.subject,100),details=textOf(req.body?.details,2000);
  if(!subject||!details)return res.status(400).json({error:'Enter a subject (1–100 characters) and details (1–2000 characters).'});
  let c;try{c=await pool.connect();await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(71303,$1)',[req.user.id]);
    const r=await c.query(`INSERT INTO support_tickets(user_id,subject,details) SELECT $1,$2,$3
      WHERE (SELECT count(*) FROM support_tickets WHERE user_id=$1 AND status='open')<5
      AND (SELECT count(*) FROM support_tickets WHERE user_id=$1 AND created_at>now()-interval '1 hour')<5 RETURNING id`,[req.user.id,subject,details]);
    await c.query('COMMIT');if(!r.rowCount)return res.status(429).json({error:'Ticket limit reached. Please allow time for support to respond.'});res.status(201).json({id:r.rows[0].id});
  }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});fail(res,e);}finally{c?.release();}
});
router.get('/moderation/tickets',admin,async(req,res)=>{const state=req.query.status||'open';if(!['open','resolved'].includes(state))return res.status(400).json({error:'Invalid status.'});try{const r=await pool.query(`SELECT t.*,u.display_name FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.status=$1 ORDER BY t.id DESC LIMIT 100`,[state]);res.json({tickets:r.rows});}catch(e){fail(res,e);}});
router.patch('/moderation/tickets/:id',admin,async(req,res)=>{const id=idOf(req.params.id),reply=textOf(req.body?.reply,2000);if(!id||!reply)return res.status(400).json({error:'A response is required (1–2000 characters).'});try{const r=await pool.query(`UPDATE support_tickets SET status='resolved',reply=$2,resolved_at=now(),resolved_by=$3 WHERE id=$1 AND status='open' AND EXISTS(SELECT 1 FROM moderation_admins WHERE user_id=$3) RETURNING id`,[id,reply,req.user.id]);if(!r.rowCount)return res.status(409).json({error:'Ticket is no longer open or authorised.'});res.json({ok:true});}catch(e){fail(res,e);}});
router.get('/moderation/accounts',admin,async(req,res)=>{try{
  const {rows}=await pool.query(`SELECT
    COALESCE((SELECT json_agg(s) FROM (SELECT id,display_name,suspended_at FROM users WHERE suspended_at IS NOT NULL ORDER BY suspended_at DESC,id DESC LIMIT 100) s),'[]'::json) AS suspended,
    COALESCE((SELECT json_agg(a) FROM (SELECT a.id,a.user_id,u.display_name,a.action,a.reason,a.created_at FROM account_moderation_actions a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC,a.id DESC LIMIT 100) a),'[]'::json) AS actions`);
  res.json(rows[0]);
}catch(e){fail(res,e);}});
router.get('/moderation/accounts/:id',admin,async(req,res)=>{const id=idOf(req.params.id);if(!id)return res.status(400).json({error:'Invalid account ID.'});try{const r=await pool.query(`SELECT id,display_name,verified,suspended_at,EXISTS(SELECT 1 FROM moderation_admins WHERE user_id=users.id) AS moderator FROM users WHERE id=$1`,[id]);if(!r.rowCount)return res.status(404).json({error:'Account not found.'});res.json(r.rows[0]);}catch(e){fail(res,e);}});
router.patch('/moderation/accounts/:id',admin,async(req,res)=>{
  const id=idOf(req.params.id),action=req.body?.action,reason=textOf(req.body?.reason,500);
  if(!id||id===req.user.id||!['suspend','reinstate'].includes(action)||!reason)return res.status(400).json({error:'Choose another account, an action and a reason (1–500 characters).'});
  try{const r=await pool.query(`WITH changed AS (UPDATE users SET suspended_at=CASE WHEN $2='suspend' THEN now() ELSE NULL END
    WHERE id=$1 AND id<>$3 AND ($2='suspend')=(suspended_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM moderation_admins WHERE user_id=$1)
    AND EXISTS(SELECT 1 FROM moderation_admins WHERE user_id=$3) RETURNING id)
    INSERT INTO account_moderation_actions(admin_id,user_id,action,reason) SELECT $3,id,$2,$4 FROM changed RETURNING id`,[id,action,req.user.id,reason]);
    if(!r.rowCount)return res.status(409).json({error:'Account state changed, account is protected or action is not authorised.'});res.json({ok:true});
  }catch(e){fail(res,e);}
});
module.exports=router;
