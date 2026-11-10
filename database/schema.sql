USE laundry_db;

CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price_per_kg DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(20) PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    service_id INT NOT NULL,
    weight DECIMAL(5, 2) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    order_status ENUM('Queue', 'Washing', 'Ironing', 'Done', 'Picked Up') DEFAULT 'Queue',
    payment_status ENUM('Pending', 'Paid') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_services FOREIGN KEY (service_id) REFERENCES services(id)
);

INSERT INTO services (name, price_per_kg)
SELECT seed.name, seed.price_per_kg
FROM (
    SELECT 'Cuci Komplit (Cuci + Setrika)' AS name, 8000.00 AS price_per_kg
    UNION ALL SELECT 'Cuci Kering (Tanpa Setrika)', 6000.00
    UNION ALL SELECT 'Setrika Saja', 5000.00
    UNION ALL SELECT 'Cuci Kilat 24 Jam', 15000.00
) AS seed
WHERE NOT EXISTS (
    SELECT 1 FROM services existing WHERE existing.name = seed.name
);
