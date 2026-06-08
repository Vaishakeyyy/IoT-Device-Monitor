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
        status ENUM('online','offline','warning','critical','connecting') DEFAULT 'offline',
        firmware_version VARCHAR(32) DEFAULT '1.0.0',
        ip_address VARCHAR(45),
        port INT DEFAULT NULL,
        mac_address VARCHAR(17) DEFAULT NULL,
        control_state ENUM('on','off') DEFAULT 'off',
        mode ENUM('auto','manual') DEFAULT 'auto',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP NULL,
        last_response_ms INT DEFAULT NULL,
        connection_state ENUM('online','offline','connecting','error') DEFAULT 'offline'
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
        sensor_name VARCHAR(64) DEFAULT NULL,
        current_value DOUBLE DEFAULT NULL,
        configured_limit DOUBLE DEFAULT NULL,
        limit_type VARCHAR(32) DEFAULT NULL,
        acknowledged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin','user') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS device_limits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        sensor_name VARCHAR(64) NOT NULL,
        min_limit DOUBLE DEFAULT NULL,
        max_limit DOUBLE DEFAULT NULL,
        warning_threshold DOUBLE DEFAULT NULL,
        critical_threshold DOUBLE DEFAULT NULL,
        unit VARCHAR(32) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_device_sensor (device_id, sensor_name),
        INDEX idx_device_limits (device_id),
        FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS device_limit_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        limit_id INT DEFAULT NULL,
        device_id VARCHAR(64) NOT NULL,
        sensor_name VARCHAR(64) NOT NULL,
        action ENUM('created','updated','deleted') NOT NULL,
        min_limit DOUBLE DEFAULT NULL,
        max_limit DOUBLE DEFAULT NULL,
        warning_threshold DOUBLE DEFAULT NULL,
        critical_threshold DOUBLE DEFAULT NULL,
        unit VARCHAR(32) DEFAULT NULL,
        changed_by VARCHAR(64) DEFAULT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_limit_history (device_id, sensor_name, changed_at)
      )
    `);

    // NEW: command_logs table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS command_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        command VARCHAR(64) NOT NULL,
        payload JSON DEFAULT NULL,
        issued_by VARCHAR(64) NOT NULL,
        status ENUM('pending','sent','success','failed') DEFAULT 'pending',
        response TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_device_cmd (device_id, created_at),
        FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
      )
    `);

    // NEW: connection_history table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS connection_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        event ENUM('online','offline','error','connecting') NOT NULL,
        response_ms INT DEFAULT NULL,
        note VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dev_hist (device_id, created_at),
        FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
      )
    `);

    // Add new columns to existing devices table if they don't exist
    const alterCols = [
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS port INT DEFAULT NULL`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17) DEFAULT NULL`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS control_state ENUM('on','off') DEFAULT 'off'`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS mode ENUM('auto','manual') DEFAULT 'auto'`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_response_ms INT DEFAULT NULL`,
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS connection_state ENUM('online','offline','connecting','error') DEFAULT 'offline'`,
    ];
    for (const sql of alterCols) {
      try { await conn.query(sql); } catch (e) { /* column may already exist */ }
    }

    const alertCols = [
      `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS sensor_name VARCHAR(64) DEFAULT NULL`,
      `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS current_value DOUBLE DEFAULT NULL`,
      `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS configured_limit DOUBLE DEFAULT NULL`,
      `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS limit_type VARCHAR(32) DEFAULT NULL`,
    ];
    for (const sql of alertCols) {
      try { await conn.query(sql); } catch (e) { /* column may already exist */ }
    }

    const [userRows] = await conn.query(`SELECT COUNT(*) as c FROM app_users`);
    if (userRows[0].c === 0) {
      await conn.query(`
        INSERT INTO app_users (username, password, role) VALUES
        ('admin', 'adminpass', 'admin'),
        ('alice', 'alicepass', 'user')
      `);
    }

    // Seed demo devices if empty
    const [rows] = await conn.query(`SELECT COUNT(*) as c FROM devices`);
    if (rows[0].c === 0) {
      await conn.query(`
        INSERT INTO devices (device_id, name, type, location, status, firmware_version, ip_address, port, control_state, mode, connection_state, last_seen) VALUES
        ('DEV-001', 'Warehouse Temp Sensor', 'temperature', 'Warehouse A', 'online', '2.1.4', '192.168.1.101', 80, 'on', 'auto', 'online', NOW()),
        ('DEV-002', 'Office Humidity', 'humidity', 'Office Floor 2', 'online', '2.0.1', '192.168.1.102', 80, 'on', 'auto', 'online', NOW()),
        ('DEV-003', 'Server Room CO2', 'co2', 'Server Room', 'warning', '1.9.8', '192.168.1.103', 8080, 'on', 'manual', 'online', NOW()),
        ('DEV-004', 'Rooftop Pressure', 'pressure', 'Rooftop', 'offline', '2.1.0', '192.168.1.104', 80, 'off', 'auto', 'offline', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
        ('DEV-005', 'Main Gate Motion', 'motion', 'Building Entrance', 'online', '2.1.4', '192.168.1.105', 80, 'on', 'auto', 'online', NOW()),
        ('DEV-006', 'Solar Power Monitor', 'power', 'Rooftop Solar', 'critical', '1.8.3', '192.168.1.106', 80, 'off', 'manual', 'error', NOW())
      `);

      await conn.query(`
        INSERT INTO alerts (device_id, severity, message) VALUES
        ('DEV-003', 'warning', 'CO2 levels elevated above 1000ppm threshold'),
        ('DEV-006', 'critical', 'Power output dropped below 20% of rated capacity'),
        ('DEV-004', 'info', 'Device offline - last seen 2 hours ago')
      `);

      await conn.query(`
        INSERT INTO command_logs (device_id, command, payload, issued_by, status) VALUES
        ('DEV-001', 'turn_on', '{"state":"on"}', 'admin', 'success'),
        ('DEV-003', 'set_mode', '{"mode":"manual"}', 'admin', 'success'),
        ('DEV-006', 'turn_off', '{"state":"off"}', 'admin', 'success')
      `);
    }

    console.log("✅ Database initialized (control edition)");
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDB };
