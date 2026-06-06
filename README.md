# IoT Monitor — NEXUS Platform

Real-time IoT device monitoring with React.js, Node.js, MySQL, and WebSocket live data.

## Architecture

```
iot-monitor/
├── backend/                  # Node.js + Express + MySQL + WebSocket
│   ├── db/database.js        # MySQL connection pool + schema init + seeding
│   ├── routes/
│   │   ├── devices.js        # CRUD for devices
│   │   ├── readings.js       # Ingest sensor data + stats
│   │   └── alerts.js         # Alert management + dashboard summary
│   ├── server.js             # Express app + WebSocket server + demo simulator
│   ├── .env.example
│   └── package.json
└── frontend/                 # React.js + Recharts
    ├── src/
    │   ├── api.js            # Fetch wrapper for all API calls
    │   ├── context/
    │   │   └── WsContext.jsx # WebSocket context (live updates)
    │   ├── pages/
    │   │   ├── Dashboard.jsx     # Summary stats, live feed, device table
    │   │   ├── DevicesPage.jsx   # Device grid + register modal
    │   │   ├── DeviceDetail.jsx  # Live chart + readings + alerts per device
    │   │   └── AlertsPage.jsx    # Alert management with ACK
    │   ├── App.jsx           # Layout, sidebar, navigation
    │   └── App.css           # Full dark industrial design system
    └── package.json
```

## Features

- **Dashboard** — Live stats (online/warning/critical devices), real-time data stream feed, temperature chart, recent devices table, active alerts
- **Device Registry** — Search/filter by status, register new devices (modal form), view/delete, click-through to detail
- **Device Detail** — Live area chart (auto-updates via WebSocket), historical readings list, per-device alerts
- **Alert Center** — Filter by unacknowledged/acknowledged/all, acknowledge individual or all, severity sort
- **WebSocket Live Updates** — Backend pushes new readings every 3s; frontend updates charts and live feed without polling
- **Auto-seeded demo data** — 6 devices + readings simulator starts automatically in demo mode

## Database Schema

```sql
devices          -- device registry (id, type, status, location, firmware, ip)
sensor_readings  -- time-series data (device_id, metric, value, unit, timestamp)
alerts           -- alert log (device_id, severity, message, acknowledged)
```

## Quick Start

### 1. MySQL setup

```bash
mysql -u root -p
CREATE DATABASE iot_monitor;
EXIT;
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set DB_USER, DB_PASSWORD

npm install
npm run dev       # Uses nodemon for hot-reload
# Or: npm start
```

Server starts at http://localhost:5000  
Schema + seed data auto-created on first run.

### 3. Frontend

```bash
cd frontend
npm install
npm start         # Opens http://localhost:3000
```

### 4. Send real sensor data (optional)

```bash
curl -X POST http://localhost:5000/api/readings \
  -H "Content-Type: application/json" \
  -d '{"device_id":"DEV-001","metric":"temperature","value":24.5,"unit":"°C"}'
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/devices | List all devices |
| POST | /api/devices | Register device |
| GET | /api/devices/:id | Get device |
| PUT | /api/devices/:id | Update device |
| DELETE | /api/devices/:id | Remove device |
| GET | /api/devices/:id/readings | Device readings |
| POST | /api/readings | Ingest sensor reading |
| GET | /api/readings/stats | 24h aggregated stats |
| GET | /api/alerts | List alerts |
| POST | /api/alerts | Create alert |
| PATCH | /api/alerts/:id/acknowledge | Acknowledge alert |
| GET | /api/alerts/summary | Dashboard summary |
| GET /ws | WebSocket | Live data stream |

## WebSocket Events

Connect to `ws://localhost:5000/ws`

```json
{ "type": "reading", "device_id": "DEV-001", "metric": "temperature", "value": 23.4, "unit": "°C", "timestamp": "..." }
{ "type": "alert",   "device_id": "DEV-003", "severity": "warning", "message": "..." }
{ "type": "connected", "message": "IoT Monitor WebSocket ready" }
```

## Environment Variables

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=iot_monitor
FRONTEND_URL=http://localhost:3000
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Recharts, WebSocket API |
| Backend | Node.js, Express 4 |
| Database | MySQL 8 via mysql2/promise |
| Realtime | ws (WebSocket server) |
| Styling | Custom CSS design system (Space Mono + DM Sans) |
