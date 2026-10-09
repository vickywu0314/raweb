const test = require('node:test');
const assert = require('node:assert/strict');
test('instrument:literal', { timeout: 30_000 }, () => {
  assert.equal(2 + 3, 5);
});
