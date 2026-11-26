const { normalizeISBN } = require('./isbn');
function field(value, max, required = false) {
  if (value == null) return required ? undefined : null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > max || (required && text.length < 2) ? undefined : text || null;
}
function department(value) {
  const text = field(value, 16);
  return text === null ? null : typeof text === 'string' && /^[A-Z][A-Z0-9 -]*$/i.test(text) ? text.toUpperCase() : undefined;
}
function parsePreferences(body) {
  const major = field(body?.major, 80), dept = department(body?.department);
  return major === undefined || dept === undefined ? null : { major, department: dept };
}
function parseRequest(body) {
  const title = field(body?.title, 120, true), rawISBN = field(body?.isbn, 40);
  const isbn = typeof rawISBN === 'string' ? normalizeISBN(rawISBN) : rawISBN;
  const dept = department(body?.department), course = field(body?.course, 16), notes = field(body?.notes, 500);
  const max = body?.max_price_cents ?? null;
  if ([title,rawISBN,dept,course,notes].includes(undefined) || (rawISBN && !isbn) ||
      (max !== null && (!Number.isInteger(max) || max < 0 || max > 2147483647))) return null;
  return { title, isbn, department: dept, course, notes, max };
}
const validId = value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647;
module.exports = { parsePreferences, parseRequest, validId };
