const express = require("express");
const router = express.Router();
const { pool } = require("../database");
const { evaluateReadingLimit } = require("../limitEvaluator");

// POST ingest reading (device sends data here)
router.post("/", async (req, res) => {
  const { device_id, metric, value, unit } = req.body;
  if (!device_id || !metric || value === undefined)
    return res.status(400).json({ success: false, error: "device_id, metric, value required" });
  try {
    await pool.query(
      `INSERT INTO sensor_readings (device_id, metric, value, unit) VALUES (?,?,?,?)`,
      [device_id, metric, value, unit || null]
    );
    await pool.query(
      `UPDATE devices SET last_seen=NOW(), status='online' WHERE device_id=?`,
      [device_id]
    );
    await evaluateReadingLimit({
      device_id,
      metric,
      value,
      unit,
      broadcast: req.app.locals.broadcast,
    });
    // Broadcast via WebSocket (attached to app)
    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({ type: "reading", device_id, metric, value, unit, timestamp: new Date() });
    }
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET aggregated stats per device
router.get("/stats", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        device_id, metric,
        ROUND(AVG(value),2) as avg_val,
        ROUND(MIN(value),2) as min_val,
        ROUND(MAX(value),2) as max_val,
        ROUND((SELECT value FROM sensor_readings sr2 WHERE sr2.device_id=sr.device_id AND sr2.metric=sr.metric ORDER BY timestamp DESC LIMIT 1),2) as latest_val,
        unit,
        COUNT(*) as reading_count
      FROM sensor_readings sr
      WHERE timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY device_id, metric, unit
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
