const express = require("express");
const router = express.Router();
const { pool } = require("../database");

// GET all alerts
router.get("/", async (req, res) => {
  const acknowledgedParam = req.query.acknowledged;
  try {
    const ackFilter = acknowledgedParam !== undefined ? (acknowledgedParam === "true" || acknowledgedParam === "1") : null;

    // Existing alerts from the alerts table
    let alertQuery = `SELECT a.*, d.name as device_name, d.location FROM alerts a
                      JOIN devices d ON a.device_id = d.device_id`;
    if (ackFilter !== null) {
      alertQuery += ` WHERE a.acknowledged = ${ackFilter ? 1 : 0}`;
    }
    alertQuery += ` ORDER BY a.created_at DESC LIMIT 100`;
    const [alertRows] = await pool.query(alertQuery);

    // Synthetic alerts from devices with non-normal statuses
    const deviceAlertRows = ackFilter !== true ? (await pool.query(
      `SELECT
         NULL as id,
         d.device_id,
         d.status as severity,
         CONCAT('Device status is ', d.status) as message,
         FALSE as acknowledged,
         d.name as device_name,
         d.location,
         d.last_seen as created_at
       FROM devices d
       WHERE d.status IN ('warning','critical','offline')
       ORDER BY d.last_seen DESC
       LIMIT 100`
    ))[0] : [];

    const combined = ackFilter === true ? alertRows : [...deviceAlertRows, ...alertRows];
    res.json({ success: true, data: combined });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create alert
router.post("/", async (req, res) => {
  const { device_id, severity, message } = req.body;
  if (!device_id || !message) return res.status(400).json({ success: false, error: "device_id and message required" });
  try {
    const [result] = await pool.query(
      `INSERT INTO alerts (device_id, severity, message) VALUES (?,?,?)`,
      [device_id, severity || "info", message]
    );
    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({ type: "alert", device_id, severity, message, id: result.insertId });
    }
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH acknowledge alert
router.patch("/:id/acknowledge", async (req, res) => {
  try {
    await pool.query(`UPDATE alerts SET acknowledged=TRUE WHERE id=?`, [req.params.id]);
    res.json({ success: true, message: "Alert acknowledged" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET dashboard summary
router.get("/summary", async (req, res) => {
  try {
    const [[{ total_devices }]] = await pool.query(`SELECT COUNT(*) as total_devices FROM devices`);
    const [[{ online }]] = await pool.query(`SELECT COUNT(*) as online FROM devices WHERE status='online'`);
    const [[{ warning }]] = await pool.query(`SELECT COUNT(*) as warning FROM devices WHERE status='warning'`);
    const [[{ critical }]] = await pool.query(`SELECT COUNT(*) as critical FROM devices WHERE status='critical'`);
    const [[{ unacked }]] = await pool.query(`SELECT COUNT(*) as unacked FROM alerts WHERE acknowledged=FALSE`);
    const [[{ total_readings }]] = await pool.query(`SELECT COUNT(*) as total_readings FROM sensor_readings WHERE timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)`);
    res.json({ success: true, data: { total_devices, online, warning, critical, offline: total_devices - online - warning - critical, unacked_alerts: unacked, readings_24h: total_readings } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
