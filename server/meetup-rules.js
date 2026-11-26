// Weekly campus-local availability; not an appointment or guarantee of attendance.
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function parseAvailability(value) {
  if (!Array.isArray(value) || value.length > 7) return null;
  const days = new Set(), result = [];
  for (const slot of value) {
    if (!slot || !Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6 || days.has(slot.day) ||
      typeof slot.start !== 'string' || typeof slot.end !== 'string' || !timePattern.test(slot.start) ||
      !timePattern.test(slot.end) || slot.start >= slot.end) return null;
    days.add(slot.day);
    result.push({day:slot.day,start:slot.start,end:slot.end});
  }
  return result.sort((a,b)=>a.day-b.day);
}
function reservationExpired(deal, now=Date.now()) {
  return deal.status==='reserved' && !deal.buyer_confirmed && !deal.seller_confirmed &&
    deal.reservation_expires_at != null && Date.parse(deal.reservation_expires_at)<=now;
}
module.exports = {parseAvailability,reservationExpired};
