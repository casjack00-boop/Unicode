'use strict';
// Serialize uploads per listing and persist an entire batch or none of it.
async function storePhotoBatch(pool, listingId, ownerId, urls, max=3) {
  if (!Array.isArray(urls) || urls.length<1 || urls.length>max) throw Object.assign(new Error('Invalid photo batch.'),{status:400});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const listing=await client.query('SELECT seller_id FROM listings WHERE id=$1 FOR UPDATE',[listingId]);
    if (!listing.rowCount || String(listing.rows[0].seller_id)!==String(ownerId)) throw Object.assign(new Error('Listing not found or no longer yours.'),{status:403});
    const result=await client.query('SELECT position FROM listing_photos WHERE listing_id=$1 ORDER BY position',[listingId]);
    const taken=new Set(result.rows.map(row=>Number(row.position)));
    const free=Array.from({length:max},(_,i)=>i+1).filter(n=>!taken.has(n));
    if (urls.length>free.length) throw Object.assign(new Error(`A listing can have at most ${max} photos.`),{status:400});
    const saved=[];
    for (let i=0;i<urls.length;i++) {
      const r=await client.query('INSERT INTO listing_photos (listing_id,url,position) VALUES ($1,$2,$3) RETURNING id',[listingId,urls[i],free[i]]);
      saved.push({id:r.rows[0].id,url:urls[i]});
    }
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
}
module.exports={storePhotoBatch};
