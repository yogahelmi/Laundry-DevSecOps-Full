const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');
const { nanoid } = require('nanoid');

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type']
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

app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', service: 'laundry-api' });
});

app.get('/api/services', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM services ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/services failed:', err.message);
    res.status(503).json({ success: false, error: 'Layanan sementara tidak tersedia.' });
  }
});

app.get('/api/orders', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT orders.*, services.name AS service_name
      FROM orders
      JOIN services ON orders.service_id = services.id
      ORDER BY orders.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/orders failed:', err.message);
    res.status(503).json({ success: false, error: 'Pesanan sementara tidak tersedia.' });
  }
});

app.post('/api/orders', async (req, res) => {
  const validation = validateNewOrder(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const { customerName, serviceId, weight } = validation.value;
  try {
    const [services] = await pool.query(
      'SELECT price_per_kg FROM services WHERE id = ?',
      [serviceId]
    );
    if (services.length === 0) {
      return res.status(404).json({ success: false, error: 'Layanan tidak ditemukan.' });
    }

    const totalAmount = Number(services[0].price_per_kg) * weight;
    const orderId = `LND-${nanoid(8).toUpperCase()}`;

    await pool.query(
      `INSERT INTO orders
       (id, customer_name, service_id, weight, total_amount)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, customerName, serviceId, weight, totalAmount]
    );

    return res.status(201).json({ success: true, order_id: orderId });
  } catch (err) {
    console.error('POST /api/orders failed:', err.message);
    return res.status(503).json({ success: false, error: 'Pesanan gagal disimpan.' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { order_status: orderStatus, payment_status: paymentStatus } = req.body || {};

  if (!ORDER_STATUSES.includes(orderStatus) || !PAYMENT_STATUSES.includes(paymentStatus)) {
    return res.status(400).json({ success: false, error: 'Status pesanan atau pembayaran tidak valid.' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE orders SET order_status = ?, payment_status = ? WHERE id = ?',
      [orderStatus, paymentStatus, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/orders/:id/status failed:', err.message);
    return res.status(503).json({ success: false, error: 'Status pesanan gagal diperbarui.' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled request error:', err.message);
  res.status(400).json({ success: false, error: 'Request tidak valid.' });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Laundry API listening on port ${port}`);
  });
}

module.exports = { app, pool, validateNewOrder };
