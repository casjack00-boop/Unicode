const { normalizeISBN } = require('./isbn');
const categories = new Set(['all','textbooks','furniture','dorm','electronics','clothing','other']);
const kinds = ['messages','transactions','price_drops','saved_searches'];
function parseSearch(body) {
  const term = typeof body?.term === 'string' ? body.term.trim() : '';
  const category = body?.category ?? 'all';
  const max = body?.max_price_cents ?? null;
  if (term.length < 2 || term.length > 120 || !categories.has(category) ||
      (max !== null && (!Number.isInteger(max) || max < 0 || max > 2147483647))) return null;
  const isbn = normalizeISBN(term);
  if (isbn && !['all','textbooks'].includes(category)) return null;
  return { term, category, isbn, max };
}
function parsePreferences(body) {
  if (!body || !kinds.every(k => typeof body[k] === 'boolean')) return null;
  return kinds.map(k => body[k]);
}
function validId(value) { return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n; }
module.exports = { parseSearch, parsePreferences, validId };
