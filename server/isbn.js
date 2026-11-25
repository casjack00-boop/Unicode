// Validate ISBN-10 or ISBN-13, including their check digits.
function normalizeISBN(raw) {
  const isbn = String(raw).trim().replace(/^ISBN(?:-1[03])?\s*:?\s*/i, '')
    .replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((n, c, i) => n + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    if (sum % 11 !== 0) return null;
    const base = '978' + isbn.slice(0, 9);
    const check = (10 - [...base].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10) % 10;
    return base + check;
  }
  if (!/^97[89]\d{10}$/.test(isbn)) return null;
  const sum = [...isbn].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0 ? isbn : null;
}

module.exports = { normalizeISBN };
