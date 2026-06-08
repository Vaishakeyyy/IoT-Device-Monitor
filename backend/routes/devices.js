const express = require("express");
const router = express.Router();
const { pool } = require("../database");
const http = require("http");
const { normalizeLimitBody } = require("../limitEvaluator");

// ── helpers ──────────────────────────────────────────────────────────────────

async function pingDevice(ip, port = 80) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get(
      { hostname: ip, port: port || 80, path: "/", timeout: 3000 },
      (res) => {
        res.resume();
        resolve({ reachable: true, ms: Date.now() - start, statusCode: res.statusCode });
      }
    );
    req.on("error", () => resolve({ reachable: false, ms: Date.now() - start }));
    req.on("timeout", () => { req.destroy(); resolve({ reachable: false, ms: Date.now() - start }); });
  });
}

async function logConnection(deviceId, event, ms, note) {
  try {
    await pool.query(
      `INSERT INTO connection_history (device_id, event, response_ms, note) VALUES (?,?,?,?)`,
      [deviceId, event, ms || null, note || null]
    );
  } catch (e) {}
}

function requireAdmin(req, res, next) {
  const role = req.headers["x-user-role"] || req.body?.role || "admin";
  if (role !== "admin") {
    return res.status(403).json({ success: false, error: "Admin role required" });
  }
  next();
}

async function logLimitHistory(limit, action, changedBy) {
  await pool.query(
    `INSERT INTO device_limit_history
      (limit_id, device_id, sensor_name, action, min_limit, max_limit, warning_threshold, critical_threshold, unit, changed_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      limit.id || null,
      limit.device_id,
      limit.sensor_name,
      action,
      limit.min_limit ?? null,
      limit.max_limit ?? null,
      limit.warning_threshold ?? null,
      limit.critical_threshold ?? null,
      limit.unit || null,
      changedBy || null,
    ]
  );
}

// ── routes ───────────────────────────────────────────────────────────────────

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
  const { device_id, name, type, location, ip_address, port, mac_address, firmware_version } = req.body;
  if (!device_id || !name) return res.status(400).json({ success: false, error: "device_id and name required" });
  try {
    await pool.query(
      `INSERT INTO devices (device_id, name, type, location, ip_address, port, mac_address, firmware_version) VALUES (?,?,?,?,?,?,?,?)`,
      [device_id, name, type || "custom", location || null, ip_address || null, port || null, mac_address || null, firmware_version || "1.0.0"]
    );
    res.status(201).json({ success: true, message: "Device registered" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, error: "Device ID already exists" });
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update device
router.put("/:deviceId", async (req, res) => {
  const { name, location, status, ip_address, port, mac_address, firmware_version, control_state, mode } = req.body;
  try {
    await pool.query(
      `UPDATE devices SET
        name=COALESCE(?,name), location=COALESCE(?,location),
        status=COALESCE(?,status), ip_address=COALESCE(?,ip_address),
        port=COALESCE(?,port), mac_address=COALESCE(?,mac_address),
        firmware_version=COALESCE(?,firmware_version),
        control_state=COALESCE(?,control_state),
        mode=COALESCE(?,mode)
       WHERE device_id=?`,
      [name, location, status, ip_address, port, mac_address, firmware_version, control_state, mode, req.params.deviceId]
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

// GET device readings
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

// GET configured limits for a device
router.get("/:deviceId/limits", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM device_limits WHERE device_id=? ORDER BY sensor_name ASC`,
      [req.params.deviceId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create a device limit
router.post("/:deviceId/limits", requireAdmin, async (req, res) => {
  const limit = normalizeLimitBody(req.body);
  if (!limit.sensor_name) return res.status(400).json({ success: false, error: "sensor_name required" });

  try {
    const [result] = await pool.query(
      `INSERT INTO device_limits
        (device_id, sensor_name, min_limit, max_limit, warning_threshold, critical_threshold, unit)
       VALUES (?,?,?,?,?,?,?)`,
      [
        req.params.deviceId,
        limit.sensor_name,
        limit.min_limit,
        limit.max_limit,
        limit.warning_threshold,
        limit.critical_threshold,
        limit.unit,
      ]
    );
    const saved = { id: result.insertId, device_id: req.params.deviceId, ...limit };
    await logLimitHistory(saved, "created", req.body.changed_by);
    res.status(201).json({ success: true, id: result.insertId, data: saved });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, error: "Limit already exists for this sensor" });
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update a device limit
router.put("/:deviceId/limits/:limitId", requireAdmin, async (req, res) => {
  const limit = normalizeLimitBody(req.body);
  if (!limit.sensor_name) return res.status(400).json({ success: false, error: "sensor_name required" });

  try {
    await pool.query(
      `UPDATE device_limits SET
        sensor_name=?, min_limit=?, max_limit=?, warning_threshold=?, critical_threshold=?, unit=?
       WHERE id=? AND device_id=?`,
      [
        limit.sensor_name,
        limit.min_limit,
        limit.max_limit,
        limit.warning_threshold,
        limit.critical_threshold,
        limit.unit,
        req.params.limitId,
        req.params.deviceId,
      ]
    );
    const saved = { id: Number(req.params.limitId), device_id: req.params.deviceId, ...limit };
    await logLimitHistory(saved, "updated", req.body.changed_by);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a device limit
router.delete("/:deviceId/limits/:limitId", requireAdmin, async (req, res) => {
  try {
    const [[existing]] = await pool.query(
      `SELECT * FROM device_limits WHERE id=? AND device_id=?`,
      [req.params.limitId, req.params.deviceId]
    );
    if (!existing) return res.status(404).json({ success: false, error: "Limit not found" });

    await pool.query(`DELETE FROM device_limits WHERE id=? AND device_id=?`, [req.params.limitId, req.params.deviceId]);
    await logLimitHistory(existing, "deleted", req.query.changed_by);
    res.json({ success: true, message: "Limit deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET limit change history for a device
router.get("/:deviceId/limits/history", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM device_limit_history WHERE device_id=? ORDER BY changed_at DESC LIMIT 50`,
      [req.params.deviceId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── CONTROL ──────────────────────────────────────────────────────────────────

// POST send command to device
router.post("/:deviceId/command", async (req, res) => {
  const { command, payload, issued_by = "system" } = req.body;
  if (!command) return res.status(400).json({ success: false, error: "command required" });

  const [deviceRows] = await pool.query(`SELECT * FROM devices WHERE device_id=?`, [req.params.deviceId]);
  if (!deviceRows.length) return res.status(404).json({ success: false, error: "Device not found" });
  const device = deviceRows[0];

  // Insert log as pending
  const [logResult] = await pool.query(
    `INSERT INTO command_logs (device_id, command, payload, issued_by, status) VALUES (?,?,?,?,?)`,
    [req.params.deviceId, command, JSON.stringify(payload || {}), issued_by, "pending"]
  );
  const logId = logResult.insertId;

  // Apply control state changes locally
  let dbUpdate = {};
  if (command === "turn_on") dbUpdate.control_state = "on";
  if (command === "turn_off") dbUpdate.control_state = "off";
  if (command === "set_mode" && payload?.mode) dbUpdate.mode = payload.mode;
  if (command === "start") dbUpdate.control_state = "on";
  if (command === "stop") dbUpdate.control_state = "off";

  // Try to send to physical device via HTTP if IP available
  let deliveryStatus = "success";
  let deliveryResponse = "Applied locally";

  if (device.ip_address) {
    try {
      const port = device.port || 80;
      const cmdPayload = JSON.stringify({ command, ...payload });
      const result = await new Promise((resolve) => {
        const postData = cmdPayload;
        const options = {
          hostname: device.ip_address,
          port,
          path: "/command",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) },
          timeout: 3000,
        };
        const req2 = http.request(options, (r) => {
          let body = "";
          r.on("data", (d) => { body += d; });
          r.on("end", () => resolve({ ok: r.statusCode < 400, body }));
        });
        req2.on("error", () => resolve({ ok: false, body: "Connection refused" }));
        req2.on("timeout", () => { req2.destroy(); resolve({ ok: false, body: "Timeout" }); });
        req2.write(postData);
        req2.end();
      });
      deliveryStatus = result.ok ? "success" : "failed";
      deliveryResponse = result.body || "No response";
    } catch (e) {
      deliveryStatus = "failed";
      deliveryResponse = e.message;
    }
  }

  // Update log
  await pool.query(`UPDATE command_logs SET status=?, response=? WHERE id=?`, [deliveryStatus, deliveryResponse, logId]);

  // Apply DB state update
  if (Object.keys(dbUpdate).length) {
    const sets = Object.entries(dbUpdate).map(([k]) => `${k}=?`).join(",");
    await pool.query(`UPDATE devices SET ${sets} WHERE device_id=?`, [...Object.values(dbUpdate), req.params.deviceId]);
  }

  // Broadcast via WebSocket
  if (req.app.locals.broadcast) {
    req.app.locals.broadcast({ type: "command", device_id: req.params.deviceId, command, payload, issued_by, status: deliveryStatus, logId });
  }

  res.json({ success: true, logId, status: deliveryStatus, response: deliveryResponse });
});

// GET command logs for device
router.get("/:deviceId/commands", async (req, res) => {
  const { limit = 30 } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM command_logs WHERE device_id=? ORDER BY created_at DESC LIMIT ?`,
      [req.params.deviceId, parseInt(limit)]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET all command logs (admin)
router.get("/commands/all", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT cl.*, d.name as device_name FROM command_logs cl
       JOIN devices d ON cl.device_id = d.device_id
       ORDER BY cl.created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST ping / check device availability
router.post("/:deviceId/ping", async (req, res) => {
  const [deviceRows] = await pool.query(`SELECT * FROM devices WHERE device_id=?`, [req.params.deviceId]);
  if (!deviceRows.length) return res.status(404).json({ success: false, error: "Device not found" });
  const device = deviceRows[0];

  if (!device.ip_address) {
    return res.json({ success: true, reachable: false, ms: null, note: "No IP configured" });
  }

  const result = await pingDevice(device.ip_address, device.port);
  const newConnState = result.reachable ? "online" : "error";

  await pool.query(
    `UPDATE devices SET connection_state=?, last_response_ms=?, last_seen=IF(?,NOW(),last_seen) WHERE device_id=?`,
    [newConnState, result.ms, result.reachable, req.params.deviceId]
  );
  await logConnection(req.params.deviceId, newConnState, result.ms, result.reachable ? "Ping OK" : "Unreachable");

  if (req.app.locals.broadcast) {
    req.app.locals.broadcast({ type: "ping_result", device_id: req.params.deviceId, ...result, connection_state: newConnState });
  }

  res.json({ success: true, ...result, connection_state: newConnState });
});

// GET connection history for device
router.get("/:deviceId/connection-history", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM connection_history WHERE device_id=? ORDER BY created_at DESC LIMIT 50`,
      [req.params.deviceId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
