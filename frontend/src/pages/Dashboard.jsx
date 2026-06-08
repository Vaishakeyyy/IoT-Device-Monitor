import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useWs } from "../context/WsContext";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export default function Dashboard({ navigate }) {
  const [summary, setSummary] = useState(null);
  const [controlSummary, setControlSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [liveFeed, setLiveFeed] = useState([]);
  const [stats, setStats] = useState([]);
  const [networkInterfaces, setNetworkInterfaces] = useState([]);
  const { connected, subscribe } = useWs();

  const loadData = useCallback(async () => {
    try {
      const [s, d, a, st] = await Promise.all([
        api.getSummary(), api.getDevices(), api.getAlerts({ acknowledged: false }), api.getStats()
      ]);
      setSummary(s.data);
      setDevices(d.data.slice(0, 6));
      setAlerts(a.data.slice(0, 5));
      setStats(st.data);
    } catch (e) {
      console.error(e);
    }

    try {
      const cs = await api.getControlSummary();
      setControlSummary(cs.data);
    } catch (e) {}

    try {
      const net = await api.getNetwork();
      setNetworkInterfaces(net.interfaces ?? []);
    } catch (e) {
      console.warn("Network info unavailable", e);
      setNetworkInterfaces([]);
    }
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

  const metricRanges = {
    temperature: { min: 0, max: 50, label: "°C" },
    humidity: { min: 0, max: 100, label: "%" },
    co2: { min: 300, max: 2000, label: "ppm" },
    pressure: { min: 900, max: 1100, label: "hPa" },
    motion: { min: 0, max: 20, label: "events" },
    power: { min: 0, max: 2500, label: "W" },
  };

  const metrics = Object.values(stats.reduce((acc, row) => {
    const existing = acc[row.metric] || {
      metric: row.metric,
      unit: row.unit,
      sumLatest: 0,
      sumAvg: 0,
      min_val: Infinity,
      max_val: -Infinity,
      count: 0,
    };
    existing.unit = row.unit || existing.unit;
    existing.sumLatest += Number(row.latest_val || 0);
    existing.sumAvg += Number(row.avg_val || 0);
    existing.min_val = Math.min(existing.min_val, Number(row.min_val || Infinity));
    existing.max_val = Math.max(existing.max_val, Number(row.max_val || -Infinity));
    existing.count += 1;
    acc[row.metric] = existing;
    return acc;
  }, {})).map((entry) => ({
    ...entry,
    latest_val: entry.count ? +(entry.sumLatest / entry.count).toFixed(1) : null,
    avg_val: entry.count ? +(entry.sumAvg / entry.count).toFixed(1) : null,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><span>IoT</span><span>/</span><span>Dashboard</span></div>
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
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 24 }}>
          <StatCard label="Total Devices" value={summary?.total_devices ?? "—"} desc="Registered endpoints" color="accent" />
          <StatCard label="Online" value={controlSummary?.online ?? summary?.online ?? "—"} desc="Network reachable" color="green" />
          <StatCard label="Offline" value={controlSummary?.offline ?? summary?.offline ?? "—"} desc="Unreachable" color="yellow" />
          <StatCard label="Controlled" value={controlSummary?.controlled ?? "—"} desc="Devices powered ON" color="green" />
          <StatCard label="Alerts" value={summary?.unacked_alerts ?? 0} desc="Unacknowledged" color="red" />
          <StatCard label="Commands Today" value={controlSummary?.cmd_today ?? "—"} desc="Control actions sent" color="accent" />
          <StatCard label="Within Limits" value={summary?.devices_within_limits ?? 0} desc="Configured devices normal" color="green" />
          <StatCard label="Near Limit" value={summary?.devices_near_limit ?? 0} desc="Warning threshold reached" color="yellow" />
          <StatCard label="Exceeding Limits" value={summary?.devices_exceeding_limits ?? 0} desc="Outside configured range" color="red" />
          <StatCard label="Critical Alerts" value={summary?.active_critical_alerts ?? 0} desc="Active critical limit alerts" color="red" />
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

          <div className="card">
            <div className="card-header"><span>Sensor Rate Scales</span></div>
            <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              {metrics.length === 0 ? (
                <div className="empty-state"><div className="empty-state-text">No sensor metrics available.</div></div>
              ) : metrics.map((metric) => {
                const range = metricRanges[metric.metric] || { min: 0, max: Math.max(metric.max_val || 100, 100), label: metric.unit || "" };
                const latest = metric.latest_val ?? 0;
                const ratio = Math.max(0, Math.min(1, (latest - range.min) / (range.max - range.min || 1)));
                return (
                  <div key={metric.metric} className="metric-scale-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <div className="stat-label">{metric.metric.toUpperCase()}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginTop: 4 }}>{latest}{range.label}</div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase" }}>Avg {metric.avg_val}{range.label}</div>
                    </div>
                    <div className="scale-track">
                      <div className="scale-bar" style={{ width: `${ratio * 100}%`, background: metric.metric === "temperature" ? "var(--red)" : metric.metric === "humidity" ? "var(--accent)" : metric.metric === "co2" ? "var(--yellow)" : metric.metric === "pressure" ? "var(--purple)" : metric.metric === "motion" ? "var(--green)" : "var(--accent)" }} />
                    </div>
                    <div className="scale-labels">
                      <span>{range.min}</span><span>{range.max}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8, marginBottom: 24 }}>
            {metrics.length === 0 ? (
              <div className="card" style={{ minWidth: 280, flex: "0 0 280px" }}>
                <div className="card-body"><div className="empty-state"><div className="empty-state-text">No sensor stats available.</div></div></div>
              </div>
            ) : metrics.map((metric) => {
              const range = metricRanges[metric.metric] || { min: 0, max: Math.max(metric.max_val || 100, 100), label: metric.unit || "" };
              const color = metric.metric === "temperature" ? "var(--red)" : metric.metric === "humidity" ? "var(--accent)" : metric.metric === "co2" ? "var(--yellow)" : metric.metric === "pressure" ? "var(--purple)" : metric.metric === "motion" ? "var(--green)" : "var(--accent)";
              const data = [
                { t: "Min", v: metric.min_val },
                { t: "Avg", v: metric.avg_val },
                { t: "Max", v: metric.max_val }
              ].filter((item) => item.v != null);
              return (
                <div key={metric.metric} className="card" style={{ minWidth: 280, flex: "0 0 280px" }}>
                  <div className="card-header"><span>{metric.metric.toUpperCase()} Stats</span></div>
                  <div className="card-body" style={{ minHeight: 220 }}>
                    <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                      <Metric label="Latest" value={`${metric.latest_val}${range.label}`} color={color} />
                      <Metric label="Avg" value={`${metric.avg_val}${range.label}`} color="var(--text)" />
                      <Metric label="Peak" value={`${metric.max_val}${range.label}`} color={color} />
                    </div>
                    {data.length > 0 ? (
                      <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={data}>
                          <defs>
                            <linearGradient id={`grad-${metric.metric}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                              <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="t" tick={{ fill: "var(--text3)", fontSize: 11 }} />
                          <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--text3)", fontSize: 11 }} />
                          <Tooltip />
                          <Area type="monotone" dataKey="v" stroke={color} fill={`url(#grad-${metric.metric})`} strokeWidth={2} name={metric.metric} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="empty-state"><div className="empty-state-text">No data for {metric.metric}</div></div>
                    )}
                  </div>
                </div>
              );
            })}
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
                <th>Device</th><th>Type</th><th>Location</th><th>Status</th><th>Control</th><th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const limitRisk = d.status === "critical" || d.status === "warning";
                return (
                <tr
                  key={d.id}
                  style={{
                    cursor: "pointer",
                    boxShadow: limitRisk ? `inset 3px 0 0 ${d.status === "critical" ? "var(--red)" : "var(--yellow)"}` : "none",
                  }}
                  onClick={() => navigate("device-detail", d)}
                >
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
                  <td>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: d.control_state === "on" ? "var(--green)" : "var(--text3)" }}>
                      {d.control_state?.toUpperCase() || "—"}
                    </span>
                    {d.mode && <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", marginLeft: 6 }}>{d.mode}</span>}
                  </td>
                  <td className="mono">{d.minutes_since_seen != null ? `${d.minutes_since_seen}m ago` : "—"}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>

        {/* Alerts */}
        <div className="card">
          <div className="card-header">
            <span>Alerts</span>
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
