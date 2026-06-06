import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useWs } from "../context/WsContext";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export default function Dashboard({ navigate }) {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [liveFeed, setLiveFeed] = useState([]);
  const [stats, setStats] = useState([]);
  const [networkInterfaces, setNetworkInterfaces] = useState([]);
  const { connected, subscribe } = useWs();

  const loadData = useCallback(async () => {
    try {
      const [s, d, a, st, net] = await Promise.all([
        api.getSummary(), api.getDevices(), api.getAlerts({ acknowledged: false }), api.getStats(), api.getNetwork()
      ]);
      setSummary(s.data);
      setDevices(d.data.slice(0, 6));
      setAlerts(a.data.slice(0, 5));
      setStats(st.data);
      setNetworkInterfaces(net.interfaces ?? []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = subscribe((msg) => {
      if (msg.type === "reading") {
        setLiveFeed((prev) => [
          { ...msg, id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString() },
          ...prev.slice(0, 19),
        ]);
        setSummary((s) => s ? { ...s, readings_24h: (s.readings_24h || 0) + 1 } : s);
      }
      if (msg.type === "alert") loadData();
    });
    return unsub;
  }, [loadData, subscribe]);

  // Build chart data from stats for one interesting metric
  const tempStats = stats.find((s) => s.metric === "temperature");
  const chartData = [
    { t: "Min", v: tempStats?.min_val }, { t: "Avg", v: tempStats?.avg_val }, { t: "Max", v: tempStats?.max_val }
  ].filter((d) => d.v != null);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><span>NEXUS</span><span>/</span><span>Dashboard</span></div>
          <div className="page-title">System <span>Overview</span></div>
          <div className="page-sub">Real-time IoT infrastructure monitoring</div>
        </div>
        <div className="page-actions">
          <div className={`ws-badge ${connected ? "" : "disconnected"}`}>
            <div className="live-dot" style={connected ? {} : { background: "var(--text3)", boxShadow: "none", animation: "none" }} />
            {connected ? "LIVE" : "OFFLINE"}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("devices")}>+ Add Device</button>
        </div>
      </div>

      <div className="page-content">
        {/* Stats */}
        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <StatCard label="Total Devices" value={summary?.total_devices ?? "—"} desc="Registered endpoints" color="accent" />
          <StatCard label="Online" value={summary?.online ?? "—"} desc="Actively reporting" color="green" />
          <StatCard label="Warnings" value={(summary?.warning ?? 0) + (summary?.critical ?? 0)} desc="Need attention" color="yellow" />
          <StatCard label="Readings / 24h" value={summary?.readings_24h ?? "—"} desc="Data points ingested" color="accent" />
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><span>Local Network Address</span></div>
          <div className="card-body">
            {networkInterfaces.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">No local network information available.</div></div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {networkInterfaces.map((iface) => (
                  <div key={`${iface.interface}-${iface.address}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ color: "var(--text2)", fontSize: 12 }}>{iface.interface}</div>
                    <div style={{ color: "var(--text)", fontFamily: "var(--mono)", fontSize: 13 }}>{iface.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 24 }}>
          {/* Live Feed */}
          <div className="card">
            <div className="card-header">
              <span>Live Data Stream</span>
              <div className="live-dot" />
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {liveFeed.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">◌</div><div className="empty-state-text">Waiting for data...</div></div>
              ) : liveFeed.map((m) => (
                <LiveRow key={m.id} msg={m} />
              ))}
            </div>
          </div>

          {/* Temperature chart */}
          <div className="card">
            <div className="card-header"><span>Temperature Stats (24h)</span></div>
            <div className="card-body">
              {tempStats ? (
                <>
                  <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                    <Metric label="Latest" value={`${tempStats.latest_val}°C`} color="var(--accent)" />
                    <Metric label="Avg" value={`${tempStats.avg_val}°C`} color="var(--text)" />
                    <Metric label="Peak" value={`${tempStats.max_val}°C`} color="var(--red)" />
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ff3d5a" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ff3d5a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="t" />
                      <YAxis domain={["auto", "auto"]} />
                      <Tooltip />
                      <Area type="monotone" dataKey="v" stroke="#ff3d5a" fill="url(#tg)" strokeWidth={2} name="°C" />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <div className="empty-state"><div className="empty-state-text">No temperature data yet</div></div>
              )}
            </div>
          </div>
        </div>

        {/* Devices table */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span>Recent Devices</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("devices")}>View all →</button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Device</th><th>Type</th><th>Location</th><th>Status</th><th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => navigate("device-detail", d)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <DeviceIcon type={d.type} />
                      <div>
                        <div style={{ color: "var(--text)", fontWeight: 500 }}>{d.name}</div>
                        <div className="mono" style={{ fontSize: 10, color: "var(--text3)" }}>{d.device_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ textTransform: "uppercase", fontSize: 11 }}>{d.type}</td>
                  <td>{d.location || "—"}</td>
                  <td><span className={`status-badge ${d.status}`}>{d.status}</span></td>
                  <td className="mono">{d.minutes_since_seen != null ? `${d.minutes_since_seen}m ago` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Alerts */}
        <div className="card">
          <div className="card-header">
            <span>Active Alerts</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("alerts")}>View all →</button>
          </div>
          {alerts.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">✓</div><div className="empty-state-text">No active alerts</div></div>
          ) : alerts.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, desc, color }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      <div className="stat-desc">{desc}</div>
    </div>
  );
}

function LiveRow({ msg }) {
  return (
    <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", minWidth: 70 }}>{msg.time}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", minWidth: 80 }}>{msg.device_id}</span>
      <span style={{ fontSize: 12, color: "var(--text2)", flex: 1 }}>{msg.metric}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text)", fontWeight: 700 }}>{msg.value} <span style={{ color: "var(--text3)", fontWeight: 400 }}>{msg.unit}</span></span>
    </div>
  );
}

function AlertRow({ alert }) {
  const colors = { info: "var(--accent)", warning: "var(--yellow)", critical: "var(--red)" };
  return (
    <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ color: colors[alert.severity], fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", paddingTop: 2, minWidth: 56 }}>{alert.severity}</span>
      <div>
        <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 2 }}>{alert.message}</div>
        <div style={{ fontSize: 11, color: "var(--text3)" }}>{alert.device_name} · {alert.location}</div>
      </div>
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export function DeviceIcon({ type }) {
  const icons = { temperature: "🌡", humidity: "💧", co2: "🫁", pressure: "🔵", motion: "👁", power: "⚡", custom: "◈" };
  return <div className={`device-type-icon icon-${type}`}>{icons[type] || "◈"}</div>;
}
