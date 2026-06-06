const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "iot_monitor",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS iot_monitor`);
    await conn.query(`USE iot_monitor`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(128) NOT NULL,
        type ENUM('temperature','humidity','pressure','motion','power','co2','custom') DEFAULT 'custom',
        location VARCHAR(128),
        status ENUM('online','offline','warning','critical') DEFAULT 'offline',
        firmware_version VARCHAR(32) DEFAULT '1.0.0',
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP NULL
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        metric VARCHAR(64) NOT NULL,
        value DOUBLE NOT NULL,
        unit VARCHAR(32),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_device_time (device_id, timestamp),
        FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        severity ENUM('info','warning','critical') DEFAULT 'info',
        message TEXT NOT NULL,
        acknowledged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
      )
    `);

    // Seed demo devices if empty
    const [rows] = await conn.query(`SELECT COUNT(*) as c FROM devices`);
    if (rows[0].c === 0) {
      await conn.query(`
        INSERT INTO devices (device_id, name, type, location, status, firmware_version, ip_address, last_seen) VALUES
        ('DEV-001', 'Warehouse Temp Sensor', 'temperature', 'Warehouse A', 'online', '2.1.4', '192.168.1.101', NOW()),
        ('DEV-002', 'Office Humidity', 'humidity', 'Office Floor 2', 'online', '2.0.1', '192.168.1.102', NOW()),
        ('DEV-003', 'Server Room CO2', 'co2', 'Server Room', 'warning', '1.9.8', '192.168.1.103', NOW()),
        ('DEV-004', 'Rooftop Pressure', 'pressure', 'Rooftop', 'offline', '2.1.0', '192.168.1.104', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
        ('DEV-005', 'Main Gate Motion', 'motion', 'Building Entrance', 'online', '2.1.4', '192.168.1.105', NOW()),
        ('DEV-006', 'Solar Power Monitor', 'power', 'Rooftop Solar', 'critical', '1.8.3', '192.168.1.106', NOW())
      `);

      await conn.query(`
        INSERT INTO alerts (device_id, severity, message) VALUES
        ('DEV-003', 'warning', 'CO2 levels elevated above 1000ppm threshold'),
        ('DEV-006', 'critical', 'Power output dropped below 20% of rated capacity'),
        ('DEV-004', 'info', 'Device offline - last seen 2 hours ago')
      `);
    }

    console.log("✅ Database initialized");
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDB };
