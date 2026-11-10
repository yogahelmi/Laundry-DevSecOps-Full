const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '20kb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'laundry_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const ORDER_STATUSES = ['Queue', 'Washing', 'Ironing', 'Done', 'Picked Up'];
const PAYMENT_STATUSES = ['Pending', 'Paid'];
const ROLES = ['admin', 'staff', 'customer'];
const BCRYPT_ROUNDS = 12;

function validateNewOrder(body = {}) {
  const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  const serviceId = Number(body.service_id);
  const weight = Number(body.weight);
  if (!customerName || customerName.length > 100) {
    return { valid: false, error: 'Nama pelanggan wajib diisi (maksimal 100 karakter).' };
  }
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return { valid: false, error: 'ID layanan tidak valid.' };
  }
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return { valid: false, error: 'Berat harus lebih dari 0 dan maksimal 100 kg.' };
  }
  return { valid: true, value: { customerName, serviceId, weight } };
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 72;
}

function signAccessToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  return jwt.sign(
    { role: user.role, email: user.email },
    secret,
    { subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '1h', issuer: 'cloud-laundry', audience: 'cloud-laundry-client' }
  );
}

async function authenticateToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: 'Token autentikasi diperlukan.' });
  }
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'cloud-laundry', audience: 'cloud-laundry-client'
    });
    // Re-check account status and current role on every protected request.
    const [rows] = await pool.query('SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1', [claims.sub]);
    if (!rows[0] || !rows[0].is_active) {
      return res.status(401).json({ success: false, error: 'Akun tidak aktif atau tidak ditemukan.' });
    }
    req.user = { ...claims, role: rows[0].role, email: rows[0].email, name: rows[0].name };
    return next();
  } catch (_err) {
    return res.status(401).json({ success: false, error: 'Token tidak valid atau sesi tidak dapat diverifikasi.' });
  }
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Anda tidak memiliki izin untuk melakukan tindakan ini.' });
    }
    return next();
  };
}

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'staff', 'customer') NOT NULL DEFAULT 'customer',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      email VARCHAR(190) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customers_name (name),
      INDEX idx_customers_phone (phone)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(20) NOT NULL,
      old_status VARCHAR(30) NULL,
      new_status VARCHAR(30) NOT NULL,
      changed_by BIGINT UNSIGNED NULL,
      changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_order_history_order (order_id),
      CONSTRAINT fk_order_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_order_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);
  const [userCustomerCol] = await pool.query("SHOW COLUMNS FROM users LIKE 'customer_id'");
  if (!userCustomerCol.length) {
    await pool.query('ALTER TABLE users ADD COLUMN customer_id BIGINT UNSIGNED NULL');
    await pool.query('ALTER TABLE users ADD INDEX idx_users_customer_id (customer_id)');
    await pool.query('ALTER TABLE users ADD CONSTRAINT fk_users_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL');
  }
  const [orderCustomerCol] = await pool.query("SHOW COLUMNS FROM orders LIKE 'customer_id'");
  if (!orderCustomerCol.length) {
    await pool.query('ALTER TABLE orders ADD COLUMN customer_id BIGINT UNSIGNED NULL');
    await pool.query('ALTER TABLE orders ADD INDEX idx_orders_customer_id (customer_id)');
    await pool.query('ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL');
  }
  const [columns] = await pool.query("SHOW COLUMNS FROM orders LIKE 'user_id'");
  if (columns.length === 0) {
    await pool.query('ALTER TABLE orders ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER customer_name');
    await pool.query('ALTER TABLE orders ADD INDEX idx_orders_user_id (user_id)');
    await pool.query('ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
  }
}

async function bootstrapAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  const name = (process.env.ADMIN_NAME || 'Administrator').trim().slice(0, 100);
  if (!email || !validatePassword(password)) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12-72 characters) in .env before starting the backend.');
  }
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) {
    console.log('Bootstrap admin already exists; no account changes made.');
    return;
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, 'admin']
  );
  console.log('Initial administrator account created from environment configuration.');
}

app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', service: 'laundry-api' });
});

// Public customer registration. Staff/admin accounts are provisioned by administrators.
app.post('/api/auth/register', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validatePassword(password)) {
    return res.status(400).json({ success: false, error: 'Nama, email valid, dan password minimal 12 karakter wajib diisi.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [customerResult] = await connection.query(
        'INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)',
        [name, '', email]
      );
      const [result] = await connection.query(
        'INSERT INTO users (name, email, password_hash, role, customer_id) VALUES (?, ?, ?, ?, ?)',
        [name, email, passwordHash, 'customer', customerResult.insertId]
      );
      await connection.commit();
      return res.status(201).json({ success: true, message: 'Registrasi berhasil. Silakan login.', user_id: result.insertId });
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    } finally {
      connection.release();
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Email sudah terdaftar.' });
    }
    console.error('POST /api/auth/register failed:', err.message);
    return res.status(503).json({ success: false, error: 'Registrasi sementara tidak tersedia.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || typeof password !== 'string' || password.length > 72) {
    return res.status(400).json({ success: false, error: 'Email dan password wajib diisi.' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordMatches || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Email atau password salah.' });
    }
    const accessToken = signAccessToken(user);
    return res.json({
      success: true,
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: process.env.JWT_EXPIRES_IN || '1h',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('POST /api/auth/login failed:', err.message);
    return res.status(503).json({ success: false, error: 'Login sementara tidak tersedia.' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1',
      [req.user.sub]
    );
    if (!rows[0] || !rows[0].is_active) {
      return res.status(401).json({ success: false, error: 'Akun tidak aktif atau tidak ditemukan.' });
    }
    const { is_active: _active, ...user } = rows[0];
    return res.json({ success: true, user });
  } catch (err) {
    console.error('GET /api/auth/me failed:', err.message);
    return res.status(503).json({ success: false, error: 'Profil sementara tidak tersedia.' });
  }
});

// Services are visible to authenticated users; operational changes are admin-only (future CRUD).
app.get('/api/services', authenticateToken, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM services ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/services failed:', err.message);
    res.status(503).json({ success: false, error: 'Layanan sementara tidak tersedia.' });
  }
});

// Admin-only user administration. Public registration can only create customer accounts.
app.get('/api/admin/users', authenticateToken, authorizeRoles('admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/admin/users failed:', err.message);
    res.status(503).json({ success: false, error: 'Data pengguna sementara tidak tersedia.' });
  }
});

app.post('/api/admin/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const role = typeof req.body?.role === 'string' ? req.body.role.toLowerCase() : '';
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validatePassword(password) || !['staff', 'customer'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Nama, email valid, password 12-72 karakter, dan role staff/customer wajib diisi.' });
  }
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    if (role === 'customer') {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [customerResult] = await connection.query(
          'INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)', [name, '', email]
        );
        const [result] = await connection.query(
          'INSERT INTO users (name,email,password_hash,role,customer_id) VALUES (?,?,?,?,?)',
          [name,email,hash,role,customerResult.insertId]
        );
        await connection.commit();
        return res.status(201).json({ success: true, user_id: result.insertId, customer_id: customerResult.insertId });
      } catch (transactionError) {
        await connection.rollback();
        throw transactionError;
      } finally {
        connection.release();
      }
    }
    const [result] = await pool.query('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', [name,email,hash,role]);
    return res.status(201).json({ success: true, user_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Email sudah terdaftar.' });
    console.error('POST /api/admin/users failed:', err.message);
    return res.status(503).json({ success: false, error: 'Pengguna gagal dibuat.' });
  }
});

app.patch('/api/admin/users/:id/active', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const active = req.body?.is_active;
  if (typeof active !== 'boolean') return res.status(400).json({ success: false, error: 'is_active harus boolean.' });
  if (String(req.user.sub) === String(req.params.id) && active === false) return res.status(400).json({ success: false, error: 'Admin tidak dapat menonaktifkan akunnya sendiri.' });
  try {
    const [result] = await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [active, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/admin/users/:id/active failed:', err.message);
    res.status(503).json({ success: false, error: 'Status pengguna gagal diperbarui.' });
  }
});


// Customer directory: searchable by name/phone for Admin and Staff.
app.get('/api/customers', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  if (q.length < 2) return res.json({ success: true, data: [] });
  try {
    const like = `%${q}%`;
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.phone, c.email, COUNT(o.id) AS total_orders
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
       WHERE c.name LIKE ? OR c.phone LIKE ?
       GROUP BY c.id ORDER BY c.name LIMIT 10`, [like, like]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/customers failed:', err.message);
    return res.status(503).json({ success: false, error: 'Pencarian customer gagal.' });
  }
});

app.get('/api/customers/all', authenticateToken, authorizeRoles('admin', 'staff'), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.phone, c.email, COUNT(o.id) AS total_orders
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
       GROUP BY c.id ORDER BY c.created_at DESC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/customers/all failed:', err.message);
    return res.status(503).json({ success: false, error: 'Data customer gagal dimuat.' });
  }
});

app.post('/api/customers', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const email = typeof req.body?.email === 'string' && req.body.email.trim() ? normalizeEmail(req.body.email) : null;
  if (!name || name.length > 100 || !phone || phone.length > 30 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ success: false, error: 'Nama dan nomor HP wajib diisi; email harus valid jika diberikan.' });
  }
  try {
    const [result] = await pool.query('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)', [name, phone, email]);
    return res.status(201).json({ success: true, customer_id: result.insertId });
  } catch (err) {
    console.error('POST /api/customers failed:', err.message);
    return res.status(503).json({ success: false, error: 'Customer gagal dibuat.' });
  }
});

// Customer profile maintenance: Staff may correct contact details; only Admin may delete records.
app.put('/api/customers/:id', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const email = typeof req.body?.email === 'string' && req.body.email.trim() ? normalizeEmail(req.body.email) : null;
  if (!name || name.length > 100 || !phone || phone.length > 30 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ success: false, error: 'Nama dan nomor HP wajib diisi; email harus valid jika diberikan.' });
  }
  try {
    const [result] = await pool.query('UPDATE customers SET name = ?, phone = ?, email = ? WHERE id = ?', [name, phone, email, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Customer tidak ditemukan.' });
    await pool.query('UPDATE users SET name = ?, email = COALESCE(?, email) WHERE customer_id = ?', [name, email, req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Email sudah digunakan akun lain.' });
    console.error('PUT /api/customers/:id failed:', err.message);
    return res.status(503).json({ success: false, error: 'Data customer gagal diperbarui.' });
  }
});

app.delete('/api/customers/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [linked] = await pool.query('SELECT id FROM users WHERE customer_id = ? LIMIT 1', [req.params.id]);
    if (linked.length) return res.status(409).json({ success: false, error: 'Customer masih terhubung ke akun. Nonaktifkan akun atau putuskan relasi terlebih dahulu.' });
    const [result] = await pool.query('DELETE FROM customers WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Customer tidak ditemukan.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/customers/:id failed:', err.message);
    return res.status(503).json({ success: false, error: 'Customer gagal dihapus.' });
  }
});

// Admin has full access; Staff has operational access; Customer can only read own linked orders.
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const base = `SELECT o.*, COALESCE(c.name, o.customer_name) AS customer_name,
                         c.phone AS customer_phone, s.name AS service_name
                  FROM orders o
                  JOIN services s ON o.service_id = s.id
                  LEFT JOIN customers c ON c.id = o.customer_id`;
    let rows;
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      [rows] = await pool.query(`${base} ORDER BY o.created_at DESC`);
    } else {
      [rows] = await pool.query(
        `${base} LEFT JOIN users u ON u.customer_id = o.customer_id
         WHERE u.id = ? OR o.user_id = ? ORDER BY o.created_at DESC`,
        [req.user.sub, req.user.sub]
      );
    }
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/orders failed:', err.message);
    return res.status(503).json({ success: false, error: 'Pesanan sementara tidak tersedia.' });
  }
});

app.get('/api/orders/:id/history', authenticateToken, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.id FROM orders o LEFT JOIN users u ON u.customer_id = o.customer_id
       WHERE o.id = ? AND (? IN ('admin','staff') OR u.id = ? OR o.user_id = ?) LIMIT 1`,
      [req.params.id, req.user.role, req.user.sub, req.user.sub]
    );
    if (!orders.length) return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
    const [rows] = await pool.query(
      `SELECT h.old_status, h.new_status, h.changed_at, u.name AS changed_by_name
       FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.order_id = ? ORDER BY h.changed_at ASC, h.id ASC`, [req.params.id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET order history failed:', err.message);
    return res.status(503).json({ success: false, error: 'Riwayat status gagal dimuat.' });
  }
});

app.post('/api/orders', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  const customerId = req.body?.customer_id ? Number(req.body.customer_id) : null;
  const customerName = typeof req.body?.customer_name === 'string' ? req.body.customer_name.trim() : '';
  const customerPhone = typeof req.body?.customer_phone === 'string' ? req.body.customer_phone.trim() : '';
  const validation = validateNewOrder({ ...req.body, customer_name: customerName || 'Guest Customer' });
  if (!validation.valid) return res.status(400).json({ success: false, error: validation.error });
  if (customerId !== null && (!Number.isSafeInteger(customerId) || customerId <= 0)) {
    return res.status(400).json({ success: false, error: 'Customer ID tidak valid.' });
  }
  if (customerId === null && (!customerName || !customerPhone)) {
    return res.status(400).json({ success: false, error: 'Pilih customer atau isi nama dan nomor HP customer baru.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let resolvedCustomerId = customerId;
    if (resolvedCustomerId !== null) {
      const [customers] = await connection.query('SELECT id FROM customers WHERE id = ? LIMIT 1', [resolvedCustomerId]);
      if (!customers.length) {
        await connection.rollback();
        return res.status(404).json({ success: false, error: 'Customer tidak ditemukan.' });
      }
    } else {
      const [customerResult] = await connection.query(
        'INSERT INTO customers (name, phone) VALUES (?, ?)', [customerName, customerPhone]
      );
      resolvedCustomerId = customerResult.insertId;
    }
    const [services] = await connection.query('SELECT price_per_kg FROM services WHERE id = ?', [validation.value.serviceId]);
    if (!services.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: 'Layanan tidak ditemukan.' });
    }
    const totalAmount = Number(services[0].price_per_kg) * validation.value.weight;
    const orderId = `LND-${nanoid(8).toUpperCase()}`;
    await connection.query(
      `INSERT INTO orders (id, customer_name, customer_id, user_id, service_id, weight, total_amount)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      [orderId, customerName || 'Guest Customer', resolvedCustomerId, validation.value.serviceId, validation.value.weight, totalAmount]
    );
    await connection.query(
      'INSERT INTO order_status_history (order_id, old_status, new_status, changed_by) VALUES (?, NULL, ?, ?)',
      [orderId, 'Queue', req.user.sub]
    );
    await connection.commit();
    return res.status(201).json({ success: true, order_id: orderId, customer_id: resolvedCustomerId });
  } catch (err) {
    await connection.rollback();
    console.error('POST /api/orders failed:', err.message);
    return res.status(503).json({ success: false, error: 'Pesanan gagal disimpan.' });
  } finally {
    connection.release();
  }
});

app.put('/api/orders/:id/status', authenticateToken, authorizeRoles('admin', 'staff'), async (req, res) => {
  const { id } = req.params;
  const { order_status: orderStatus, payment_status: paymentStatus } = req.body || {};
  if (!ORDER_STATUSES.includes(orderStatus) || !PAYMENT_STATUSES.includes(paymentStatus)) {
    return res.status(400).json({ success: false, error: 'Status pesanan atau pembayaran tidak valid.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [current] = await connection.query('SELECT order_status FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (!current.length) { await connection.rollback(); return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' }); }
    const oldStatus = current[0].order_status;
    await connection.query('UPDATE orders SET order_status = ?, payment_status = ? WHERE id = ?', [orderStatus, paymentStatus, id]);
    if (oldStatus !== orderStatus) {
      await connection.query(
        'INSERT INTO order_status_history (order_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)',
        [id, oldStatus, orderStatus, req.user.sub]
      );
    }
    await connection.commit();
    return res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    console.error('PUT /api/orders/:id/status failed:', err.message);
    return res.status(503).json({ success: false, error: 'Status pesanan gagal diperbarui.' });
  } finally { connection.release(); }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled request error:', err.message);
  res.status(400).json({ success: false, error: 'Request tidak valid.' });
});

async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set and contain at least 32 characters.');
  }
  await ensureUsersTable();
  await bootstrapAdmin();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`Laundry API listening on port ${port}`));
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Backend startup failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  app, pool, validateNewOrder, normalizeEmail, validatePassword,
  authenticateToken, authorizeRoles, ensureUsersTable, bootstrapAdmin
};
