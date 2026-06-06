require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const { initDB } = require("./database");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// WebSocket broadcast helper
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "connected", message: "IoT Monitor WebSocket ready" }));
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

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date() }));

// Simulate live sensor data (demo mode)
function simulateSensorData() {
  const { pool } = require("./database");
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
        await pool.query(
          `INSERT INTO sensor_readings (device_id, metric, value, unit) VALUES (?,?,?,?)`,
          [d.id, d.metric, value, d.unit]
        );
        await pool.query(`UPDATE devices SET last_seen=NOW() WHERE device_id=?`, [d.id]);
        app.locals.broadcast({ type: "reading", device_id: d.id, metric: d.metric, value, unit: d.unit, timestamp: new Date() });
      } catch (e) { /* device may not exist yet */ }
    }
  }, 3000);
}

const PORT = process.env.PORT || 5000;

initDB()
  .then(() => {
    simulateSensorData();
    server.listen(PORT, () => console.log(`🚀 IoT Monitor backend running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("❌ Failed to initialize DB:", err.message);
    process.exit(1);
  });
