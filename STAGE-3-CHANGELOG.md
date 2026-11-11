# Stage 3 — Customer Management & Order Integration

## Perubahan pada basis project
- Mempertahankan tabel `customers` dan relasi opsional `users.customer_id` serta `orders.customer_id` yang sudah ada.
- Menambahkan tabel `order_status_history` secara additive saat backend startup.
- Menambahkan `PUT /api/customers/:id` untuk Admin/Staff memperbarui data kontak pelanggan.
- Menambahkan `DELETE /api/customers/:id` khusus Admin; penghapusan ditolak jika Customer masih terhubung ke akun login.
- Menambahkan `GET /api/orders/:id/history`; Admin/Staff dapat melihat riwayat semua pesanan, Customer hanya riwayat pesanan yang terhubung ke akunnya.
- Mencatat status awal `Queue` ketika pesanan dibuat dan mencatat perubahan status berikutnya beserta aktor dan waktu.
- Memperbaiki karakter literal `\\n` yang tersisa pada deklarasi data Vue di `frontend/index.html`.

## Batasan yang masih ada
- Registrasi akun Customer belum menyediakan proses klaim Guest Customer dengan OTP.
- Guest Customer tanpa akun tidak dapat login untuk melihat progress.
- Frontend saat ini belum menyediakan UI khusus Customer Management dan tampilan riwayat status; API dasarnya sudah disiapkan.
- Migration dijalankan saat backend startup dan belum diuji terhadap salinan database produksi. Backup database sebelum penerapan.

## Pemeriksaan yang dilakukan
- `node --check backend/index.js`: lulus.
- Pemeriksaan inline JavaScript frontend: lulus.
- Unit test dan integration test backend: 19/19 test lulus.
- Pengujian autentikasi dan otorisasi RBAC: lulus berdasarkan skenario test.
- Pengujian isolasi data Customer dan perlindungan IDOR: lulus berdasarkan skenario test.
- Integration test menggunakan MariaDB lokal melalui `docker-compose.test.yml`.
- GitHub Actions CI telah dikonfigurasi untuk menyediakan MariaDB sebagai service dan menjalankan unit test, integration test, serta dependency audit.
- Eksekusi GitHub Actions terhadap konfigurasi terbaru belum diverifikasi.
- Deployment runtime aplikasi lengkap melalui Docker Compose utama belum diverifikasi pada tahap pemeriksaan ini.
