import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { DeviceIcon } from "./Dashboard";
import { useAuth } from "../context/AuthContext";
import { useWs } from "../context/WsContext";

export default function DevicesPage({ navigate }) {
  const [devices, setDevices] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const { subscribe } = useWs();

  const load = useCallback(async () => {
    try {
      const r = await api.getDevices();
      setDevices(r.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribe((msg) => {
      if (["connection_change", "command", "ping_result"].includes(msg.type)) {
        setDevices((prev) => prev.map((d) => {
          if (d.device_id !== msg.device_id) return d;
          if (msg.type === "connection_change") return { ...d, connection_state: msg.connection_state, last_response_ms: msg.ms };
          if (msg.type === "command") {
            const upd = {};
            if (msg.command === "turn_on" || msg.command === "start") upd.control_state = "on";
            if (msg.command === "turn_off" || msg.command === "stop") upd.control_state = "off";
            if (msg.command === "set_mode" && msg.payload?.mode) upd.mode = msg.payload.mode;
            return { ...d, ...upd };
          }
          return d;
        }));
      }
    });
    return unsub;
  }, [load, subscribe]);

  const filtered = devices.filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.device_id.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || d.status === filter || d.connection_state === filter;
    return matchSearch && matchFilter;
  });

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this device?")) return;
    await api.deleteDevice(id);
    load();
  };

  const handleCommand = async (deviceId, command, payload = {}, issued_by) => {
    try {
      await api.sendCommand(deviceId, command, payload, issued_by);
      load();
    } catch (e) { alert("Command failed: " + e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><span>IoT</span><span>/</span><span>Devices</span></div>
          <div className="page-title">Device <span>Registry</span></div>
          <div className="page-sub">{devices.length} registered endpoints</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Register Device</button>
        </div>
      </div>

      <div className="page-content">
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
          <input className="form-input" style={{ maxWidth: 260 }} placeholder="Search devices..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {["all","online","warning","critical","offline","error"].map((s) => (
            <button key={s} className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(s)}>{s.toUpperCase()}</button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-3">{[1,2,3,4,5,6].map((i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">◌</div><div className="empty-state-text">No devices found</div></div>
        ) : (
          <div className="grid grid-3">
            {filtered.map((d) => (
              <DeviceCard key={d.id} device={d}
                onView={() => navigate("device-detail", d)}
                onDelete={() => handleDelete(d.device_id)}
                onCommand={(cmd, payload) => handleCommand(d.device_id, cmd, payload, useAuth)}
              />
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddDeviceModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

function DeviceCard({ device: d, onView, onDelete, onCommand }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [cmdLoading, setCmdLoading] = useState("");

  const connColor = { online: "var(--green)", offline: "var(--text3)", connecting: "var(--yellow)", error: "var(--red)" };

  const sendCmd = async (cmd, payload = {}) => {
    setCmdLoading(cmd);
    try { await api.sendCommand(d.device_id, cmd, payload, user?.username || "user"); }
    catch (e) { console.error(e); }
    finally { setCmdLoading(""); }
  };

  return (
    <div className="card" style={{ cursor: "default" }}>
      <div style={{ padding: "16px 20px" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <DeviceIcon type={d.type} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span className={`status-badge ${d.status}`}>{d.status}</span>
            {/* Connection state indicator */}
            <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: connColor[d.connection_state] || "var(--text3)", display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: connColor[d.connection_state] || "var(--text3)", display: "block" }} />
              {(d.connection_state || "unknown").toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{d.name}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginBottom: 6 }}>{d.device_id}</div>
        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 3 }}>📍 {d.location || "No location"}</div>
        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", marginBottom: 8 }}>
          {d.ip_address ? `${d.ip_address}${d.port ? `:${d.port}` : ""}` : "No IP"} · FW {d.firmware_version}
        </div>

        {/* Control state row */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>PWR:</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: d.control_state === "on" ? "var(--green)" : "var(--text3)" }}>
            {d.control_state?.toUpperCase() || "—"}
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginLeft: 8 }}>MODE:</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: d.mode === "auto" ? "var(--accent)" : "var(--yellow)" }}>
            {d.mode?.toUpperCase() || "—"}
          </span>
          {d.last_response_ms != null && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", marginLeft: "auto" }}>{d.last_response_ms}ms</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onView}>View →</button>
        {(isAdmin || d.mode === "manual") && (
          <>
            <button
              className="btn btn-sm"
              style={{ background: d.control_state === "on" ? "rgba(0,229,122,0.1)" : "transparent", color: "var(--green)", border: "1px solid rgba(0,229,122,0.2)", padding: "5px 10px" }}
              onClick={() => sendCmd(d.control_state === "on" ? "turn_off" : "turn_on")}
              disabled={!!cmdLoading}
              title={d.control_state === "on" ? "Turn Off" : "Turn On"}
            >
              {cmdLoading ? "..." : d.control_state === "on" ? "⏻ Off" : "⏻ On"}
            </button>
          </>
        )}
        {isAdmin && (
          <button className="btn btn-danger btn-sm" onClick={onDelete}>✕</button>
        )}
      </div>
    </div>
  );
}

function AddDeviceModal({ onClose, onAdded }) {
  const [form, setForm] = useState({
    device_id: "", name: "", type: "custom", location: "",
    ip_address: "", port: "", mac_address: "", firmware_version: "1.0.0"
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.device_id || !form.name) { setError("Device ID and name are required"); return; }
    setLoading(true);
    try {
      await api.addDevice({ ...form, port: form.port ? parseInt(form.port) : null });
      onAdded(); onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-title">REGISTER NEW DEVICE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Device ID *</label>
            <input className="form-input" placeholder="DEV-007" value={form.device_id} onChange={(e) => set("device_id", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" placeholder="Warehouse Sensor" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.type} onChange={(e) => set("type", e.target.value)}>
              {["temperature","humidity","co2","pressure","motion","power","custom"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Firmware</label>
            <input className="form-input" value={form.firmware_version} onChange={(e) => set("firmware_version", e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Location</label>
            <input className="form-input" placeholder="Building A, Floor 2" value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">IP Address</label>
            <input className="form-input" placeholder="192.168.1.xxx" value={form.ip_address} onChange={(e) => set("ip_address", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Port (optional)</label>
            <input className="form-input" placeholder="80" type="number" value={form.port} onChange={(e) => set("port", e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: "1/-1" }}>
            <label className="form-label">MAC Address (optional)</label>
            <input className="form-input" placeholder="AA:BB:CC:DD:EE:FF" value={form.mac_address} onChange={(e) => set("mac_address", e.target.value)} />
          </div>
        </div>
        {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? "Registering..." : "Register"}</button>
        </div>
      </div>
    </div>
  );
}
