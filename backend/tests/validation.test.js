const test = require('node:test');
const assert = require('node:assert/strict');
const { validateNewOrder } = require('../index');

test('accepts a valid laundry order', () => {
  const result = validateNewOrder({
    customer_name: 'Budi',
    service_id: 1,
    weight: 2.5
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    customerName: 'Budi',
    serviceId: 1,
    weight: 2.5
  });
});

test('rejects an empty customer name', () => {
  const result = validateNewOrder({
    customer_name: '  ',
    service_id: 1,
    weight: 2
  });
  assert.equal(result.valid, false);
});

test('rejects invalid service identifiers', () => {
  const result = validateNewOrder({
    customer_name: 'Budi',
    service_id: -1,
    weight: 2
  });
  assert.equal(result.valid, false);
});

test('rejects zero, negative, non-numeric, and excessive weight', () => {
  for (const weight of [0, -1, 'abc', 101]) {
    assert.equal(validateNewOrder({
      customer_name: 'Budi',
      service_id: 1,
      weight
    }).valid, false);
  }
});
