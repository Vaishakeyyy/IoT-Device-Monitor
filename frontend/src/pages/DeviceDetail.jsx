import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useWs } from "../context/WsContext";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DeviceIcon } from "./Dashboard";

export default function DeviceDetail({ device: initialDevice, navigate }) {
  const [device, setDevice] = useState(initialDevice);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [liveData, setLiveData] = useState([]);
  const { subscribe } = useWs();

  const load = useCallback(async () => {
    if (!initialDevice) return;
    try {
      const [d, r, a] = await Promise.all([
        api.getDevice(initialDevice.device_id),
        api.getDeviceReadings(initialDevice.device_id, { limit: 40 }),
        api.getAlerts(),
      ]);
      setDevice(d.data);
      setReadings(r.data);
      const devAlerts = a.data.filter((al) => al.device_id === initialDevice.device_id);
      setAlerts(devAlerts);
      setLiveData(r.data.map((rd) => ({
        time: new Date(rd.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        value: rd.value,
        metric: rd.metric,
      })));
    } catch (e) { console.error(e); }
  }, [initialDevice]);

  useEffect(() => {
    load();
    const unsub = subscribe((msg) => {
      if (msg.type === "reading" && msg.device_id === initialDevice?.device_id) {
        const point = { time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), value: msg.value, metric: msg.metric };
        setLiveData((prev) => [...prev.slice(-49), point]);
        setDevice((d) => d ? { ...d, last_seen: new Date() } : d);
      }
    });
    return unsub;
  }, [load, subscribe, initialDevice]);

  if (!device) return null;

  const latestByMetric = {};
  readings.forEach((r) => { latestByMetric[r.metric] = r; });

  const chartColor = {
    temperature: "#ff3d5a", humidity: "#00d4ff", co2: "#9b59ff",
    pressure: "#ffb800", motion: "#00e57a", power: "#ffb800",
  }[device.type] || "#00d4ff";

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb">
            <button onClick={() => navigate("devices")}>Devices</button>
            <span>/</span><span>{device.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <DeviceIcon type={device.type} />
            <div>
              <div className="page-title">{device.name}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", letterSpacing: "0.1em" }}>{device.device_id}</div>
            </div>
          </div>
        </div>
        <div className="page-actions">
          <span className={`status-badge ${device.status}`}>{device.status}</span>
        </div>
      </div>

      <div className="page-content">
        {/* Info row */}
        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <InfoCard label="Location" value={device.location || "—"} />
          <InfoCard label="IP Address" value={device.ip_address || "—"} mono />
          <InfoCard label="Firmware" value={device.firmware_version} mono />
          <InfoCard label="Last Seen" value={device.minutes_since_seen != null ? `${device.minutes_since_seen}m ago` : "—"} mono />
        </div>

        {/* Live chart */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span>Live Sensor Data</span>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{liveData.length} points</div>
          </div>
          <div className="card-body">
            {liveData.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">No readings yet</div></div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={liveData}>
                  <defs>
                    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "var(--text3)" }}
                    itemStyle={{ color: chartColor }}
                  />
                  <Area type="monotone" dataKey="value" stroke={chartColor} fill="url(#cg)" strokeWidth={2} dot={false} name={device.type} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-2">
          {/* Recent readings */}
          <div className="card">
            <div className="card-header"><span>Recent Readings</span></div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {readings.length === 0 ? (
                <div className="empty-state"><div className="empty-state-text">No readings yet</div></div>
              ) : readings.slice().reverse().slice(0, 20).map((r) => (
                <div key={r.id} style={{ padding: "9px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: chartColor }}>{r.value} <span style={{ color: "var(--text3)" }}>{r.unit}</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div className="card">
            <div className="card-header"><span>Device Alerts</span></div>
            {alerts.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">✓</div><div className="empty-state-text">No alerts</div></div>
            ) : alerts.map((a) => (
              <div key={a.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span className={`status-badge ${a.severity}`}>{a.severity}</span>
                  {a.acknowledged && <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--green)" }}>ACK</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>{a.message}</div>
                <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 4 }}>
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, mono }) {
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: mono ? 13 : 14, fontFamily: mono ? "var(--mono)" : "var(--sans)", color: "var(--text)", fontWeight: 500 }}>{value}</div>
    </div>
  );
}
