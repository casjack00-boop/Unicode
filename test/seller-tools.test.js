const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDimensions } = require('../server/listing-dimensions');

test('optional dimensions do not change existing listings', () => {
  assert.deepEqual(parseDimensions('furniture', null), [null, null, null, null]);
  assert.deepEqual(parseDimensions('textbooks', { width: 10 }), [null, null, null, null]);
});
test('positive complete dimensions with explicit units', () => {
  assert.deepEqual(parseDimensions('furniture', { width: 18.25, height: 36, depth: 20, unit: 'in' }), [18.25, 36, 20, 'in']);
  assert.deepEqual(parseDimensions('furniture', { width: 0.01, height: 10000, depth: 50, unit: 'cm' }), [0.01, 10000, 50, 'cm']);
});
test('reject partial, negative, nonnumeric, nonfinite and excessive measurements', () => {
  for (const width of [undefined, null, true, '18', [], 0, -1, Infinity, NaN, 10000.01, 18.123]) {
    assert.throws(() => parseDimensions('furniture', { width, height: 36, depth: 20, unit: 'in' }));
  }
  for (const unit of ['ft', '', null]) {
    assert.throws(() => parseDimensions('furniture', { width: 18, height: 36, depth: 20, unit }));
  }
});
