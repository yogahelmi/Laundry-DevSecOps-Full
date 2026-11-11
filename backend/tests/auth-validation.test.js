const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, validatePassword } = require('../index');

test('normalizes email by trimming and lowercasing', () => {
  assert.equal(normalizeEmail('  ADMIN@Laundry.Local '), 'admin@laundry.local');
});

test('rejects non-string email values', () => {
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(123), '');
});

test('requires passwords between 12 and 72 characters', () => {
  assert.equal(validatePassword('short'), false);
  assert.equal(validatePassword('long-enough-password'), true);
  assert.equal(validatePassword('x'.repeat(73)), false);
  assert.equal(validatePassword(null), false);
});
