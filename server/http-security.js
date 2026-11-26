'use strict';
const SAFE_METHODS = new Set(['GET','HEAD','OPTIONS']);
// Browser writes must come from the application's own origin. Non-browser
// clients without Origin remain supported; cookie authentication still applies.
function sameOriginWrite(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  const expected = process.env.UNIMARKET_PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
  if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected)) {
    return res.status(403).json({ error: 'Cross-origin request refused.' });
  }
  next();
}
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  next();
}
function noStore(req, res, next) {
  res.setHeader('Cache-Control','private, no-store');
  next();
}
module.exports={sameOriginWrite,securityHeaders,noStore};
