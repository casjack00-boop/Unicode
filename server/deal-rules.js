// Pure validation/state transitions; routes apply these under a listing row lock.
const {reservationExpired}=require('./meetup-rules');
class DealError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = (status, message) => { throw new DealError(status, message); };
function cents(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000000)
    reject(400, 'Enter a price between $0 and $10,000 with at most two decimal places.');
  return value;
}
function transition(deal, listing, user, body, now = Date.now()) {
  if (user !== deal.buyer_id && user !== deal.seller_id) reject(404, 'Transaction not found.');
  if (body.revision !== deal.revision) reject(409, 'This transaction changed. Refresh and review the latest details.');
  const action = body.action;
  if (!['pending','reserved'].includes(deal.status)) reject(409, 'This transaction is closed.');
  if (action !== 'cancel' && reservationExpired(deal,now)) reject(409, 'This reservation expired. Refresh transactions.');
  const next = { ...deal };
  if (action === 'cancel') {
    next.status = 'cancelled';
    return next;
  }
  if (deal.status === 'pending') {
    if (action === 'decline' && user !== deal.proposed_by) { next.status = 'declined'; return next; }
    if (listing.status !== 'active') reject(409, 'This item is no longer available.');
    if (user === deal.proposed_by) reject(409, 'Wait for the other student to respond, or cancel the offer.');
    if (action === 'counter') { next.price_cents = cents(body.price_cents); next.proposed_by = user; }
    else if (action === 'accept') { next.status = 'reserved'; }
    else reject(400, 'Choose accept, counter, decline or cancel.');
    return next;
  }
  if (listing.status !== 'reserved') reject(409, 'Reservation is no longer active.');
  if (action === 'meetup') {
    if (deal.buyer_confirmed || deal.seller_confirmed) reject(409, 'Handover confirmation has started.');
    const spot = typeof body.spot === 'string' ? body.spot.trim() : '';
    const date = typeof body.at === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(body.at) ? Date.parse(body.at) : NaN;
    if (!spot || spot.length > 120 || !Number.isFinite(date) || date <= now || date > now + 90*86400000)
      reject(400, 'Enter a public meeting location and a future time within 90 days.');
    next.meetup_at = new Date(date).toISOString(); next.meetup_spot = spot;
    next.meetup_by = user; next.meetup_confirmed = false;
  } else if (action === 'confirm_meetup') {
    if (!deal.meetup_at || deal.meetup_by === user || deal.meetup_confirmed || Date.parse(deal.meetup_at) <= now)
      reject(409, 'Only the other student can confirm a future proposed meeting.');
    next.meetup_confirmed = true;
  } else if (action === 'complete') {
    if (!deal.meetup_confirmed) reject(409, 'Confirm a meetup first.');
    if (user === deal.buyer_id) next.buyer_confirmed = true;
    else next.seller_confirmed = true;
    if (next.buyer_confirmed && next.seller_confirmed) next.status = 'completed';
  } else reject(400, 'Invalid reservation action.');
  return next;
}
module.exports = { DealError, cents, transition };
