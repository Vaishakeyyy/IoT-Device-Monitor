const express = require("express");
const router = express.Router();
const { pool } = require("../database");

// GET all devices
router.get("/", async (req, res) => {
  try {
    const [devices] = await pool.query(
      `SELECT *, TIMESTAMPDIFF(MINUTE, last_seen, NOW()) as minutes_since_seen 
       FROM devices ORDER BY created_at DESC`
    );
    res.json({ success: true, data: devices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single device
router.get("/:deviceId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *, TIMESTAMPDIFF(MINUTE, last_seen, NOW()) as minutes_since_seen 
       FROM devices WHERE device_id = ?`,
      [req.params.deviceId]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: "Device not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add device
router.post("/", async (req, res) => {
  const { device_id, name, type, location, ip_address, firmware_version } = req.body;
  if (!device_id || !name) return res.status(400).json({ success: false, error: "device_id and name required" });
  try {
    await pool.query(
      `INSERT INTO devices (device_id, name, type, location, ip_address, firmware_version) VALUES (?,?,?,?,?,?)`,
      [device_id, name, type || "custom", location || null, ip_address || null, firmware_version || "1.0.0"]
    );
    res.status(201).json({ success: true, message: "Device registered" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, error: "Device ID already exists" });
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update device
router.put("/:deviceId", async (req, res) => {
  const { name, location, status, ip_address, firmware_version } = req.body;
  try {
    await pool.query(
      `UPDATE devices SET name=COALESCE(?,name), location=COALESCE(?,location), 
       status=COALESCE(?,status), ip_address=COALESCE(?,ip_address), 
       firmware_version=COALESCE(?,firmware_version) WHERE device_id=?`,
      [name, location, status, ip_address, firmware_version, req.params.deviceId]
    );
    res.json({ success: true, message: "Device updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE device
router.delete("/:deviceId", async (req, res) => {
  try {
    await pool.query(`DELETE FROM devices WHERE device_id = ?`, [req.params.deviceId]);
    res.json({ success: true, message: "Device removed" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET device readings (last 50 per metric)
router.get("/:deviceId/readings", async (req, res) => {
  const { metric, limit = 50 } = req.query;
  try {
    let query = `SELECT * FROM sensor_readings WHERE device_id = ?`;
    const params = [req.params.deviceId];
    if (metric) { query += ` AND metric = ?`; params.push(metric); }
    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(parseInt(limit));
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
