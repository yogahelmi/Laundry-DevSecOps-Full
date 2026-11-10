const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

// Environment khusus database testing.
// Nilai environment ditetapkan sebelum index.js di-import.
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';

const TEST_DB_PORT = process.env.TEST_DB_PORT || '3307';
process.env.DB_PORT = TEST_DB_PORT;
process.env.DB_USER = process.env.DB_USER || 'laundry_test_user';
process.env.DB_PASSWORD =
  process.env.DB_PASSWORD || 'test_only_password_123';
process.env.DB_NAME = 'laundry_db';
process.env.JWT_SECRET =
  'integration-test-secret-only-do-not-use-in-production-2026';

const { app, pool, ensureUsersTable } = require('../index');

const testRun = crypto.randomUUID().slice(0, 8);

let admin;
let staff;
let customer;
let adminToken;
let staffToken;
let customerToken;
let disabledToken;
let customerB;
let customerBToken;
let customerAOrderId;
let customerBOrderId;

function createToken(user) {
  return jwt.sign(
    { role: user.role, email: user.email },
    process.env.JWT_SECRET,
    {
      subject: String(user.id),
      expiresIn: '1h',
      issuer: 'cloud-laundry',
      audience: 'cloud-laundry-client'
    }
  );
}

async function createUser(name, role, active = true) {
  const uniqueId = crypto.randomUUID().slice(0, 8);
  const email = `${role}-${uniqueId}@integration.test`;

  const passwordHash = await bcrypt.hash('TestPassword123!', 4);

  const [result] = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [name, email, passwordHash, role, active]
  );

  return {
    id: result.insertId,
    name,
    email,
    role
  };
}

async function createCustomerOrder(user, suffix) {
  const [customerResult] = await pool.query(
    `INSERT INTO customers (name, phone, email)
     VALUES (?, ?, ?)`,
    [
      user.name,
      `08${Date.now().toString().slice(-10)}`,
      user.email
    ]
  );

  const customerId = customerResult.insertId;

  await pool.query(
    'UPDATE users SET customer_id = ? WHERE id = ?',
    [customerId, user.id]
  );

  const orderId = `TEST-${suffix}-${crypto.randomUUID().slice(0, 6)}`;

  await pool.query(
    `INSERT INTO orders
      (id, customer_name, customer_id, user_id, service_id, weight, total_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      user.name,
      customerId,
      user.id,
      1,
      2,
      16000
    ]
  );

  await pool.query(
    `INSERT INTO order_status_history
      (order_id, old_status, new_status, changed_by)
     VALUES (?, NULL, ?, ?)`,
    [orderId, 'Queue', user.id]
  );

  return orderId;
}

before(async () => {
  // Safety guard: tests must never connect to the main database port.
  assert.equal(process.env.DB_HOST, '127.0.0.1');
  assert.equal(process.env.DB_PORT, TEST_DB_PORT);
  assert.equal(process.env.DB_NAME, 'laundry_db');

  const [dbInfo] = await pool.query(
    'SELECT DATABASE() AS db, @@port AS port'
  );

  assert.equal(dbInfo[0].db, 'laundry_db');
  assert.equal(Number(dbInfo[0].port), 3306);

  await ensureUsersTable();

  admin = await createUser('Test Admin', 'admin');
  staff = await createUser('Test Staff', 'staff');
  customer = await createUser('Test Customer', 'customer');
  customerB = await createUser('Test Customer B', 'customer');
  customerAOrderId = await createCustomerOrder(customer, 'A');
  customerBOrderId = await createCustomerOrder(customerB, 'B');

  const disabled = await createUser(
    'Disabled User',
    'customer',
    false
  );

  adminToken = createToken(admin);
  staffToken = createToken(staff);
  customerToken = createToken(customer);
  customerBToken = createToken(customerB);
  disabledToken = createToken(disabled);
});

after(async () => {
  if (pool) await pool.end();
});

test('API menolak request tanpa token', async () => {
  const response = await request(app).get('/api/services');

  assert.equal(response.status, 401);
});

test('API menolak token yang tidak valid', async () => {
  const response = await request(app)
    .get('/api/services')
    .set('Authorization', 'Bearer invalid-token');

  assert.equal(response.status, 401);
});

test('Customer dapat melihat daftar layanan', async () => {
  const response = await request(app)
    .get('/api/services')
    .set('Authorization', `Bearer ${customerToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.data));
});

test('Customer tidak dapat melihat daftar akun Admin', async () => {
  const response = await request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${customerToken}`);

  assert.equal(response.status, 403);
});

test('Staff tidak dapat melihat daftar akun Admin', async () => {
  const response = await request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${staffToken}`);

  assert.equal(response.status, 403);
});

test('Admin dapat melihat daftar akun pengguna', async () => {
  const response = await request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.data));
});

test('Customer tidak dapat membuat pesanan melalui endpoint operasional', async () => {
  const response = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      customer_name: 'Test Customer',
      service_id: 1,
      weight: 2
    });

  assert.equal(response.status, 403);
});

test('Akun nonaktif tidak dapat menggunakan token lama', async () => {
  const response = await request(app)
    .get('/api/services')
    .set('Authorization', `Bearer ${disabledToken}`);

  assert.equal(response.status, 401);
});

test('Customer hanya dapat melihat pesanan miliknya sendiri', async () => {
  const response = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${customerToken}`);

  assert.equal(response.status, 200);

  const orderIds = response.body.data.map(order => order.id);

  assert.ok(orderIds.includes(customerAOrderId));
  assert.ok(!orderIds.includes(customerBOrderId));
});

test('Customer B hanya dapat melihat pesanan miliknya sendiri', async () => {
  const response = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${customerBToken}`);

  assert.equal(response.status, 200);

  const orderIds = response.body.data.map(order => order.id);

  assert.ok(orderIds.includes(customerBOrderId));
  assert.ok(!orderIds.includes(customerAOrderId));
});

test('Customer tidak dapat mengakses riwayat pesanan Customer lain', async () => {
  const response = await request(app)
    .get(`/api/orders/${customerBOrderId}/history`)
    .set('Authorization', `Bearer ${customerToken}`);

  assert.equal(response.status, 404);
});

test('Customer B tidak dapat mengakses riwayat pesanan Customer A', async () => {
  const response = await request(app)
    .get(`/api/orders/${customerAOrderId}/history`)
    .set('Authorization', `Bearer ${customerBToken}`);

  assert.equal(response.status, 404);
});
