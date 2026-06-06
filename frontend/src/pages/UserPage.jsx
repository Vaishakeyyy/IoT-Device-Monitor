import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

function loadAssignments() {
  try { return JSON.parse(localStorage.getItem("iot-assignments")) || {}; } catch (e) { return {}; }
}

export default function UserPage({ navigate }) {
  const { user } = useAuth();
  const [devices, setDevices] = useState([]);
  const [assignments, setAssignments] = useState(loadAssignments());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api.getDevices(); setDevices(d.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const myDevices = devices.filter((d) => assignments[d.device_id] === user.username);
  const visible = myDevices.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()) && (filter ? d.status === filter : true));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><span>NEXUS</span><span>/</span><span>My Devices</span></div>
          <div className="page-title">My Devices</div>
          <div className="page-sub">Devices assigned to you</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => navigate("dashboard")}>Back</button>
        </div>
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="form-input" style={{ maxWidth: 260 }} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="form-select" style={{ width: 160 }}>
            <option value="">All statuses</option>
            <option value="online">Online</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        <div className="card">
          {visible.length === 0 ? (
            <div className="empty-state"><div className="empty-state-text">No devices assigned to you.</div></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Device</th><th>Device ID</th><th>Status</th><th>Last Seen</th><th>Sensor</th></tr></thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate('device-detail', d)}>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>{d.name}</td>
                    <td className="mono">{d.device_id}</td>
                    <td><span className={`status-badge ${d.status}`}>{d.status}</span></td>
                    <td className="mono">{d.minutes_since_seen != null ? `${d.minutes_since_seen}m ago` : '—'}</td>
                    <td className="mono">{d.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
