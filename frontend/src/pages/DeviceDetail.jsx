import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useWs } from "../context/WsContext";
import { useAuth } from "../context/AuthContext";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DeviceIcon } from "./Dashboard";

export default function DeviceDetail({ device: initialDevice, navigate }) {
  const [device, setDevice] = useState(initialDevice);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [liveData, setLiveData] = useState([]);
  const [commandLogs, setCommandLogs] = useState([]);
  const [connHistory, setConnHistory] = useState([]);
  const [limits, setLimits] = useState([]);
  const [limitHistory, setLimitHistory] = useState([]);
  const [limitForm, setLimitForm] = useState(emptyLimitForm());
  const [editingLimitId, setEditingLimitId] = useState(null);
  const [limitError, setLimitError] = useState("");
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState(null);
  const [cmdLoading, setCmdLoading] = useState("");
  const { subscribe } = useWs();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    if (!initialDevice) return;
    try {
      const [d, r, a, cl, ch, lim, lh] = await Promise.all([
        api.getDevice(initialDevice.device_id),
        api.getDeviceReadings(initialDevice.device_id, { limit: 40 }),
        api.getAlerts(),
        api.getCommandLogs(initialDevice.device_id, 20),
        api.getConnectionHistory(initialDevice.device_id),
        api.getDeviceLimits(initialDevice.device_id),
        api.getDeviceLimitHistory(initialDevice.device_id),
      ]);
      setDevice(d.data);
      setReadings(r.data);
      const devAlerts = a.data.filter((al) => al.device_id === initialDevice.device_id);
      setAlerts(devAlerts);
      setCommandLogs(cl.data);
      setConnHistory(ch.data);
      setLimits(lim.data);
      setLimitHistory(lh.data);
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
      if (msg.type === "command" && msg.device_id === initialDevice?.device_id) {
        load();
      }
      if (msg.type === "alert" && msg.device_id === initialDevice?.device_id) {
        load();
      }
      if (msg.type === "ping_result" && msg.device_id === initialDevice?.device_id) {
        setPingResult(msg);
      }
      if (msg.type === "connection_change" && msg.device_id === initialDevice?.device_id) {
        setDevice((d) => d ? { ...d, connection_state: msg.connection_state, last_response_ms: msg.ms } : d);
      }
    });
    return unsub;
  }, [load, subscribe, initialDevice]);

  if (!device) return null;

  const chartColor = {
    temperature: "#ff3d5a", humidity: "#00d4ff", co2: "#9b59ff",
    pressure: "#ffb800", motion: "#00e57a", power: "#ffb800",
  }[device.type] || "#00d4ff";

  const sendCommand = async (command, payload = {}) => {
    setCmdLoading(command);
    try {
      await api.sendCommand(device.device_id, command, payload, user?.username || "user");
      await load();
    } catch (e) { console.error(e); }
    finally { setCmdLoading(""); }
  };

  const handlePing = async () => {
    setPinging(true);
    setPingResult(null);
    try {
      const r = await api.pingDevice(device.device_id);
      setPingResult(r);
      setDevice((d) => d ? { ...d, connection_state: r.connection_state, last_response_ms: r.ms } : d);
    } catch (e) { setPingResult({ reachable: false }); }
    finally { setPinging(false); }
  };

  const editLimit = (limit) => {
    setEditingLimitId(limit.id);
    setLimitError("");
    setLimitForm({
      sensor_name: limit.sensor_name || "",
      min_limit: limit.min_limit ?? "",
      max_limit: limit.max_limit ?? "",
      warning_threshold: limit.warning_threshold ?? "",
      critical_threshold: limit.critical_threshold ?? "",
      unit: limit.unit || "",
    });
  };

  const resetLimitForm = () => {
    setEditingLimitId(null);
    setLimitError("");
    setLimitForm(emptyLimitForm());
  };

  const saveLimit = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLimitError("");
    const payload = { ...limitForm, changed_by: user?.username || "admin" };
    try {
      if (editingLimitId) {
        await api.updateDeviceLimit(device.device_id, editingLimitId, payload, user?.role);
      } else {
        await api.addDeviceLimit(device.device_id, payload, user?.role);
      }
      resetLimitForm();
      await load();
    } catch (err) {
      setLimitError(err.message || "Unable to save limit");
    }
  };

  const deleteLimit = async (limitId) => {
    if (!isAdmin) return;
    setLimitError("");
    try {
      await api.deleteDeviceLimit(device.device_id, limitId, user?.role, user?.username || "admin");
      if (editingLimitId === limitId) resetLimitForm();
      await load();
    } catch (err) {
      setLimitError(err.message || "Unable to delete limit");
    }
  };

  const connColor = { online: "var(--green)", offline: "var(--text3)", connecting: "var(--yellow)", error: "var(--red)" };

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
        <div className="page-actions" style={{ gap: 8 }}>
          <span className={`status-badge ${device.status}`}>{device.status}</span>
          {device.control_state && (
            <span className="status-badge" style={{ background: device.control_state === "on" ? "rgba(0,229,122,0.1)" : "rgba(79,94,114,0.15)", color: device.control_state === "on" ? "var(--green)" : "var(--text3)", border: `1px solid ${device.control_state === "on" ? "rgba(0,229,122,0.2)" : "var(--border)"}` }}>
              PWR {device.control_state?.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="page-content">
        {/* Info row */}
        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <InfoCard label="Location" value={device.location || "—"} />
          <InfoCard label="IP Address" value={device.ip_address ? `${device.ip_address}${device.port ? `:${device.port}` : ""}` : "—"} mono />
          <InfoCard label="Firmware" value={device.firmware_version} mono />
          <InfoCard label="Last Seen" value={device.minutes_since_seen != null ? `${device.minutes_since_seen}m ago` : "—"} mono />
        </div>

        {/* ── CONTROL PANEL ─────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span>⚙ Control Panel</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: connColor[device.connection_state] || "var(--text3)" }}>
                ● {(device.connection_state || "unknown").toUpperCase()}
              </span>
              {device.last_response_ms != null && (
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{device.last_response_ms}ms</span>
              )}
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>

              {/* Power controls */}
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: "0.15em", marginBottom: 12, textTransform: "uppercase" }}>Power Control</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, background: device.control_state === "on" ? "rgba(0,229,122,0.15)" : "transparent", color: "var(--green)", border: "1px solid rgba(0,229,122,0.3)" }}
                    onClick={() => sendCommand("turn_on")}
                    disabled={!!cmdLoading || (!isAdmin && device.mode === "auto")}
                  >
                    {cmdLoading === "turn_on" ? "..." : "⏻ ON"}
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, background: device.control_state === "off" ? "rgba(79,94,114,0.3)" : "transparent", color: "var(--text3)", border: "1px solid var(--border2)" }}
                    onClick={() => sendCommand("turn_off")}
                    disabled={!!cmdLoading || (!isAdmin && device.mode === "auto")}
                  >
                    {cmdLoading === "turn_off" ? "..." : "⏻ OFF"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => sendCommand("start")} disabled={!!cmdLoading || (!isAdmin && device.mode === "auto")}>
                    {cmdLoading === "start" ? "..." : "▶ Start"}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => sendCommand("stop")} disabled={!!cmdLoading || (!isAdmin && device.mode === "auto")}>
                    {cmdLoading === "stop" ? "..." : "■ Stop"}
                  </button>
                </div>
              </div>

              {/* Mode */}
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: "0.15em", marginBottom: 12, textTransform: "uppercase" }}>Mode Selection</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, background: device.mode === "auto" ? "rgba(0,212,255,0.15)" : "transparent", color: "var(--accent)", border: "1px solid rgba(0,212,255,0.3)" }}
                    onClick={() => sendCommand("set_mode", { mode: "auto" })}
                    disabled={!!cmdLoading || !isAdmin}
                  >
                    {cmdLoading === "set_mode" ? "..." : "⟳ Auto"}
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, background: device.mode === "manual" ? "rgba(255,184,0,0.15)" : "transparent", color: "var(--yellow)", border: "1px solid rgba(255,184,0,0.3)" }}
                    onClick={() => sendCommand("set_mode", { mode: "manual" })}
                    disabled={!!cmdLoading || !isAdmin}
                  >
                    {cmdLoading === "set_mode" ? "..." : "✎ Manual"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                  Current: <span style={{ color: device.mode === "auto" ? "var(--accent)" : "var(--yellow)" }}>{device.mode?.toUpperCase() || "—"}</span>
                </div>
                {!isAdmin && <div style={{ fontSize: 10, color: "var(--red)", marginTop: 6 }}>Admin required to change mode</div>}
              </div>

              {/* Network diagnostics */}
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: "0.15em", marginBottom: 12, textTransform: "uppercase" }}>Network Diagnostics</div>
                <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginBottom: 10 }} onClick={handlePing} disabled={pinging || !device.ip_address}>
                  {pinging ? "Pinging..." : "◉ Ping Device"}
                </button>
                {pingResult && (
                  <div style={{ fontSize: 11, fontFamily: "var(--mono)", padding: "8px", background: "var(--bg3)", borderRadius: 6, border: `1px solid ${pingResult.reachable ? "rgba(0,229,122,0.2)" : "rgba(255,61,90,0.2)"}` }}>
                    <div style={{ color: pingResult.reachable ? "var(--green)" : "var(--red)" }}>
                      {pingResult.reachable ? "✓ Reachable" : "✗ Unreachable"}
                    </div>
                    {pingResult.ms != null && <div style={{ color: "var(--text3)" }}>{pingResult.ms}ms</div>}
                  </div>
                )}
                {!device.ip_address && <div style={{ fontSize: 10, color: "var(--text3)" }}>No IP configured</div>}
              </div>
            </div>

            {/* MAC / Port info row */}
            {(device.mac_address || device.port) && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 24 }}>
                {device.mac_address && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>MAC: {device.mac_address}</span>}
                {device.port && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>PORT: {device.port}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span>Limits</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: isAdmin ? "var(--green)" : "var(--text3)" }}>
              {isAdmin ? "ADMIN EDIT" : "VIEW ONLY"}
            </span>
          </div>
          <div className="card-body">
            {isAdmin && (
              <form onSubmit={saveLimit} style={{ marginBottom: 20 }}>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                  <LimitInput label="Sensor" value={limitForm.sensor_name} onChange={(v) => setLimitForm((f) => ({ ...f, sensor_name: v }))} placeholder="temperature" required />
                  <LimitInput label="Min" type="number" value={limitForm.min_limit} onChange={(v) => setLimitForm((f) => ({ ...f, min_limit: v }))} />
                  <LimitInput label="Max" type="number" value={limitForm.max_limit} onChange={(v) => setLimitForm((f) => ({ ...f, max_limit: v }))} />
                  <LimitInput label="Warning" type="number" value={limitForm.warning_threshold} onChange={(v) => setLimitForm((f) => ({ ...f, warning_threshold: v }))} />
                  <LimitInput label="Critical" type="number" value={limitForm.critical_threshold} onChange={(v) => setLimitForm((f) => ({ ...f, critical_threshold: v }))} />
                  <LimitInput label="Unit" value={limitForm.unit} onChange={(v) => setLimitForm((f) => ({ ...f, unit: v }))} placeholder="C, %, V" />
                </div>
                {limitError && <div style={{ color: "var(--red)", fontFamily: "var(--mono)", fontSize: 11, marginTop: 10 }}>{limitError}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                  {editingLimitId && <button type="button" className="btn btn-ghost btn-sm" onClick={resetLimitForm}>Cancel</button>}
                  <button className="btn btn-primary btn-sm" type="submit">{editingLimitId ? "Update Limit" : "+ Add Limit"}</button>
                </div>
              </form>
            )}

            {limits.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">No limits configured</div></div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sensor</th><th>Min</th><th>Max</th><th>Warning</th><th>Critical</th><th>Updated</th>{isAdmin && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {limits.map((limit) => (
                      <tr key={limit.id}>
                        <td className="mono">{limit.sensor_name}</td>
                        <td className="mono">{formatLimit(limit.min_limit, limit.unit)}</td>
                        <td className="mono">{formatLimit(limit.max_limit, limit.unit)}</td>
                        <td className="mono" style={{ color: "var(--yellow)" }}>{formatLimit(limit.warning_threshold, limit.unit)}</td>
                        <td className="mono" style={{ color: "var(--red)" }}>{formatLimit(limit.critical_threshold, limit.unit)}</td>
                        <td className="mono">{new Date(limit.updated_at || limit.created_at).toLocaleString()}</td>
                        {isAdmin && (
                          <td>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => editLimit(limit)}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteLimit(limit.id)}>Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {limitHistory.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", letterSpacing: "0.15em", marginBottom: 10, textTransform: "uppercase" }}>Limit History</div>
                <div style={{ display: "grid", gap: 8, maxHeight: 160, overflowY: "auto" }}>
                  {limitHistory.slice(0, 8).map((h) => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>
                      <span><span style={{ color: "var(--text2)" }}>{h.sensor_name}</span> {h.action}</span>
                      <span>{h.changed_by || "system"} · {new Date(h.changed_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                  <Tooltip contentStyle={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "var(--text3)" }} itemStyle={{ color: chartColor }} />
                  <Area type="monotone" dataKey="value" stroke={chartColor} fill="url(#cg)" strokeWidth={2} dot={false} name={device.type} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 24 }}>
          {/* Recent readings */}
          <div className="card">
            <div className="card-header"><span>Recent Readings</span></div>
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {readings.length === 0 ? (
                <div className="empty-state"><div className="empty-state-text">No readings yet</div></div>
              ) : readings.slice().reverse().slice(0, 20).map((r) => (
                <div key={r.id} style={{ padding: "9px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>{new Date(r.timestamp).toLocaleTimeString()}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: chartColor }}>{r.value} <span style={{ color: "var(--text3)" }}>{r.unit}</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Device Alerts */}
          <div className="card">
            <div className="card-header"><span>Device Alerts</span></div>
            {alerts.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">✓</div><div className="empty-state-text">No alerts</div></div>
            ) : alerts.map((a) => (
              <div key={a.id || Math.random()} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span className={`status-badge ${a.severity}`}>{a.severity}</span>
                  {a.acknowledged && <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--green)" }}>ACK</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>{a.message}</div>
                {a.sensor_name && (
                  <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 4 }}>
                    {a.sensor_name} · current {a.current_value ?? "-"} · limit {a.configured_limit ?? "-"}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 4 }}>{new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Command Logs + Connection History */}
        <div className="grid grid-2">
          <div className="card">
            <div className="card-header"><span>Command Log</span></div>
            {commandLogs.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">No commands yet</div></div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {commandLogs.map((c) => (
                  <div key={c.id} style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{c.command}</span>
                      <span className={`status-badge ${c.status === "success" ? "online" : c.status === "failed" ? "critical" : "warning"}`}>{c.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                      by {c.issued_by} · {new Date(c.created_at).toLocaleTimeString()}
                    </div>
                    {c.response && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{c.response}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header"><span>Connection History</span></div>
            {connHistory.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">No history yet</div></div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {connHistory.map((h) => (
                  <div key={h.id} style={{ padding: "9px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: connColor[h.event] || "var(--text3)", display: "block", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: connColor[h.event] || "var(--text3)", textTransform: "uppercase" }}>{h.event}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {h.response_ms != null && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{h.response_ms}ms</div>}
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{new Date(h.created_at).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

function emptyLimitForm() {
  return {
    sensor_name: "",
    min_limit: "",
    max_limit: "",
    warning_threshold: "",
    critical_threshold: "",
    unit: "",
  };
}

function formatLimit(value, unit) {
  if (value === null || value === undefined || value === "") return "-";
  return `${value}${unit || ""}`;
}

function LimitInput({ label, value, onChange, type = "text", placeholder, required }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
