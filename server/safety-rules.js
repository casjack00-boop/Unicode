const reasons = new Set(['scam','harassment','misleading','spam','unsafe','other']);
function validId(value) {
  if (!['number','string'].includes(typeof value) || !/^\d+$/.test(String(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}
function reportInput(body) {
  if (!body || !['user','listing','message'].includes(body.type) || !reasons.has(body.reason)) return null;
  const id = validId(body.id);
  const details = body.details === undefined ? '' : body.details;
  if (!id || typeof details !== 'string' || details.length > 1000 || details.includes('\0')) return null;
  return {type:body.type,id,reason:body.reason,details:details.trim()};
}
function safetyError(error, res) {
  if (error.code === 'UMB01') { res.status(403).json({error:'Contact with this student is unavailable.'}); return true; }
  if (error.code === 'UMB02') { res.status(429).json({error:'Too many requests. Please wait before trying again.'}); return true; }
  if (error.code === 'UMB03') { res.status(403).json({error:'Invalid message participant.'}); return true; }
  return false;
}
module.exports = {validId,reportInput,safetyError};
