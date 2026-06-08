require("dotenv").config();
const os = require("os");
const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const { initDB, pool } = require("./database");
const { evaluateReadingLimit } = require("./limitEvaluator");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

app.use(cors());
app.use(express.json());

// WebSocket
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "connected", message: "IoT Control WebSocket ready" }));
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

app.locals.broadcast = (data) => {
  const payload = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
};

// Routes
app.use("/api/devices", require("./routes/devices"));
app.use("/api/readings", require("./routes/readings"));
app.use("/api/alerts", require("./routes/alerts"));
app.use("/api/users", require("./routes/users"));

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date() }));

app.get("/api/network", (req, res) => {
  const interfaces = Object.entries(os.networkInterfaces()).flatMap(([name, nets]) =>
    nets.filter((net) => net.family === "IPv4" && !net.internal)
        .map((net) => ({ interface: name, address: net.address }))
  );
  res.json({ success: true, interfaces });
});

// Control summary for dashboard
app.get("/api/control/summary", async (req, res) => {
  try {
    const [[{ controlled }]] = await pool.query(`SELECT COUNT(*) as controlled FROM devices WHERE control_state='on'`);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM devices`);
    const [[{ online }]] = await pool.query(`SELECT COUNT(*) as online FROM devices WHERE connection_state='online'`);
    const [[{ offline }]] = await pool.query(`SELECT COUNT(*) as offline FROM devices WHERE connection_state='offline'`);
    const [[{ cmd_today }]] = await pool.query(`SELECT COUNT(*) as cmd_today FROM command_logs WHERE DATE(created_at)=CURDATE()`);
    res.json({ success: true, data: { controlled, total, online, offline, cmd_today } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Demo simulator
function simulateSensorData() {
  const devices = [
    { id: "DEV-001", metric: "temperature", unit: "°C", base: 22, range: 5 },
    { id: "DEV-002", metric: "humidity", unit: "%", base: 55, range: 15 },
    { id: "DEV-003", metric: "co2", unit: "ppm", base: 950, range: 200 },
    { id: "DEV-005", metric: "motion", unit: "events", base: 0, range: 3 },
    { id: "DEV-006", metric: "power", unit: "W", base: 1800, range: 400 },
  ];

  setInterval(async () => {
    for (const d of devices) {
      const value = +(d.base + (Math.random() - 0.5) * d.range * 2).toFixed(2);
      try {
        await pool.query(`INSERT INTO sensor_readings (device_id, metric, value, unit) VALUES (?,?,?,?)`, [d.id, d.metric, value, d.unit]);
        await pool.query(`UPDATE devices SET last_seen=NOW() WHERE device_id=?`, [d.id]);
        await evaluateReadingLimit({ device_id: d.id, metric: d.metric, value, unit: d.unit, broadcast: app.locals.broadcast });
        app.locals.broadcast({ type: "reading", device_id: d.id, metric: d.metric, value, unit: d.unit, timestamp: new Date() });
      } catch (e) {}
    }
  }, 3000);
}

// Auto-ping all devices with IP every 30s
function startAvailabilityMonitor() {
  const httpModule = require("http");
  async function checkAll() {
    try {
      const [devices] = await pool.query(`SELECT device_id, ip_address, port, connection_state FROM devices WHERE ip_address IS NOT NULL AND ip_address != ''`);
      for (const dev of devices) {
        const start = Date.now();
        const reachable = await new Promise((resolve) => {
          const req = httpModule.get({ hostname: dev.ip_address, port: dev.port || 80, path: "/", timeout: 2000 }, (r) => { r.resume(); resolve(true); });
          req.on("error", () => resolve(false));
          req.on("timeout", () => { req.destroy(); resolve(false); });
        });
        const ms = Date.now() - start;
        const newState = reachable ? "online" : (dev.connection_state === "online" ? "error" : dev.connection_state);
        await pool.query(`UPDATE devices SET connection_state=?, last_response_ms=?, last_seen=IF(?,NOW(),last_seen) WHERE device_id=?`, [newState, ms, reachable, dev.device_id]);
        if (newState !== dev.connection_state) {
          app.locals.broadcast({ type: "connection_change", device_id: dev.device_id, connection_state: newState, ms });
          try { await pool.query(`INSERT INTO connection_history (device_id, event, response_ms) VALUES (?,?,?)`, [dev.device_id, newState, ms]); } catch (e) {}
        }
      }
    } catch (e) {}
  }
  setInterval(checkAll, 30000);
}

const PORT = process.env.PORT || 5000;

initDB().then(() => {
  simulateSensorData();
  startAvailabilityMonitor();
  server.listen(PORT, "0.0.0.0", () => console.log(`🚀 IoT Control Platform running on http://0.0.0.0:${PORT}`));
}).catch((err) => { console.error("❌ Failed to initialize DB:", err.message); process.exit(1); });
