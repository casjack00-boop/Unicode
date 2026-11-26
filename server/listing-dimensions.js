// Optional dimensions are accepted only for furniture. Do not coerce booleans or objects.
function parseDimensions(category, value) {
  if (category !== 'furniture' || value == null) return [null, null, null, null];
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid dimensions.');
  const numbers = ['width', 'height', 'depth'].map(key => {
    const raw = value[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0.01 || raw > 10000 ||
        Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-7) {
      throw new Error('Enter all three measurements between 0.01 and 10,000, with up to two decimal places.');
    }
    return raw;
  });
  if (!['in', 'cm'].includes(value.unit)) throw new Error('Select inches or centimetres.');
  return [...numbers, value.unit];
}
module.exports = { parseDimensions };
