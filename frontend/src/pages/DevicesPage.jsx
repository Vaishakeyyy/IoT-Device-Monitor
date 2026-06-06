import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { DeviceIcon } from "./Dashboard";
import { useAuth } from "../context/AuthContext";

export default function DevicesPage({ navigate }) {
  const [devices, setDevices] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.getDevices();
      setDevices(r.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = devices.filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.device_id.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || d.status === filter;
    return matchSearch && matchFilter;
  });

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this device?")) return;
    await api.deleteDevice(id);
    load();
  };

  const toggleDevice = async (deviceId, currentStatus) => {
    const nextStatus = currentStatus === 'online' ? 'offline' : 'online';
    try { await api.updateDevice(deviceId, { status: nextStatus }); await load(); } catch (e) { console.error(e); alert('Failed to toggle device status'); }
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
        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="form-input" style={{ maxWidth: 260 }}
            placeholder="Search devices..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          {["all","online","warning","critical","offline"].map((s) => (
            <button key={s} className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(s)}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Device Grid */}
        {loading ? (
          <div className="grid grid-3">
            {[1,2,3,4,5,6].map((i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">◌</div>
            <div className="empty-state-text">No devices found</div>
          </div>
        ) : (
          <div className="grid grid-3">
            {filtered.map((d) => (
                <DeviceCard key={d.id} device={d} onView={() => navigate("device-detail", d)} onDelete={() => handleDelete(d.device_id)} onToggle={() => toggleDevice(d.device_id, d.status)} />
              ))}
          </div>
        )}
      </div>

      {showAdd && <AddDeviceModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

function DeviceCard({ device: d, onView, onDelete, onToggle }) {
  const { user } = useAuth();
  return (
    <div className="card" style={{ cursor: "default" }}>
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <DeviceIcon type={d.type} />
          <span className={`status-badge ${d.status}`}>{d.status}</span>
        </div>
        <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{d.name}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginBottom: 8 }}>{d.device_id}</div>
        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>📍 {d.location || "No location"}</div>
        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)" }}>
          FW {d.firmware_version} · {d.ip_address || "No IP"}
        </div>
      </div>
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onView}>View →</button>
        {user?.role === 'admin' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={onToggle}>{d.status === 'online' ? 'Turn Off' : 'Turn On'}</button>
            <button className="btn btn-danger btn-sm" onClick={onDelete}>✕</button>
          </>
        )}
      </div>
    </div>
  );
}

function AddDeviceModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ device_id: "", name: "", type: "custom", location: "", ip_address: "", firmware_version: "1.0.0" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.device_id || !form.name) { setError("Device ID and name are required"); return; }
    setLoading(true);
    try {
      await api.addDevice(form);
      onAdded();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">REGISTER NEW DEVICE</div>
        <div className="form-group">
          <label className="form-label">Device ID *</label>
          <input className="form-input" placeholder="DEV-007" value={form.device_id} onChange={(e) => set("device_id", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input className="form-input" placeholder="Warehouse Sensor" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.type} onChange={(e) => set("type", e.target.value)}>
              {["temperature","humidity","co2","pressure","motion","power","custom"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Firmware</label>
            <input className="form-input" value={form.firmware_version} onChange={(e) => set("firmware_version", e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Location</label>
          <input className="form-input" placeholder="Building A, Floor 2" value={form.location} onChange={(e) => set("location", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">IP Address</label>
          <input className="form-input" placeholder="192.168.1.xxx" value={form.ip_address} onChange={(e) => set("ip_address", e.target.value)} />
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
