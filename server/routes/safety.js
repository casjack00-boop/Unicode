const express = require('express');
const pool = require('../db');
const requireUser = require('../requireUser');
const {validId,reportInput,safetyError} = require('../safety-rules');
const router = express.Router();
router.use(requireUser, (req,res,next) => {res.setHeader('Cache-Control','private, no-store');next();});
function fail(res,e) {
  if (safetyError(e,res)) return;
  console.error('Safety request failed:',e.code || e.name);
  res.status(500).json({error:'Unable to complete this safety request.'});
}
router.get('/blocks',async(req,res)=>{
  try {
    const {rows}=await pool.query(`SELECT b.blocked_id AS id,u.display_name,b.created_at FROM user_blocks b
      JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC`,[req.user.id]);
    res.json({blocks:rows});
  } catch(e){fail(res,e);}
});
router.post('/blocks',async(req,res)=>{
  const id=validId(req.body?.id), me=req.user.id;
  if(!id || id===me) return res.status(400).json({error:'Choose another student.'});
  try {
    const result=await pool.query(`INSERT INTO user_blocks(blocker_id,blocked_id)
      SELECT $1,id FROM users WHERE id=$2 ON CONFLICT DO NOTHING RETURNING blocked_id`,[me,id]);
    if(!result.rowCount){
      const existing=await pool.query('SELECT 1 FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[me,id]);
      if(!existing.rowCount) return res.status(404).json({error:'Student not found.'});
    }
    res.json({ok:true});
  } catch(e){fail(res,e);}
});
router.delete('/blocks/:id',async(req,res)=>{
  const id=validId(req.params.id);
  if(!id) return res.status(400).json({error:'Invalid student ID.'});
  try {await pool.query('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[req.user.id,id]);res.json({ok:true});}
  catch(e){fail(res,e);}
});
router.post('/reports',async(req,res)=>{
  const input=reportInput(req.body), me=req.user.id;
  if(!input) return res.status(400).json({error:'Choose a valid report reason and enter up to 1000 characters.'});
  try {
    // Targets and evidence are derived from the database, never from client-supplied user IDs.
    const queries={user:`SELECT id AS reported_user_id,NULL::int AS listing_id,NULL::int AS message_id,display_name AS evidence FROM users WHERE id=$1 AND id<>$2`,
      listing:`SELECT seller_id AS reported_user_id,id AS listing_id,NULL::int AS message_id,LEFT(title||' — '||COALESCE(description,''),2000) AS evidence FROM listings WHERE id=$1 AND seller_id<>$2`,
      message:`SELECT m.sender_id AS reported_user_id,c.listing_id,m.id AS message_id,m.body AS evidence FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND ($2=c.buyer_id OR $2=c.seller_id) AND m.sender_id<>$2`};
    const result=await pool.query(`INSERT INTO safety_reports(reporter_id,reported_user_id,target_type,listing_id,message_id,reason,details,evidence)
      SELECT $2,t.reported_user_id,$3,t.listing_id,t.message_id,$4,$5,t.evidence FROM (${queries[input.type]}) t RETURNING id`,[input.id,me,input.type,input.reason,input.details]);
    if(!result.rowCount) return res.status(404).json({error:'Report target not found or not eligible.'});
    res.status(201).json({id:result.rows[0].id});
  } catch(e){fail(res,e);}
});
module.exports=router;
