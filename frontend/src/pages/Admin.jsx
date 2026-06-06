import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

function loadUsers() {
  try { return JSON.parse(localStorage.getItem("iot-users")) || [{ username: "alice", role: "user" }, { username: "bob", role: "user" }]; }
  catch (e) { return [{ username: "alice", role: "user" }, { username: "bob", role: "user" }]; }
}

function saveUsers(list) { localStorage.setItem("iot-users", JSON.stringify(list)); }

function loadAssignments() {
  try { return JSON.parse(localStorage.getItem("iot-assignments")) || {}; }
  catch (e) { return {}; }
}

function saveAssignments(a) { localStorage.setItem("iot-assignments", JSON.stringify(a)); }

export default function Admin({ navigate }) {
  const { user } = useAuth();
  if (!user || user.role !== "admin") {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="breadcrumb"><span>NEXUS</span><span>/</span><span>Admin</span></div>
            <div className="page-title">Administration</div>
            <div className="page-sub">Access denied</div>
          </div>
        </div>
        <div className="page-content">
          <div className="card"><div className="empty-state">You do not have permission to view this page.</div></div>
        </div>
      </div>
    );
  }
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState(loadUsers());
  const [assignments, setAssignments] = useState(loadAssignments());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s, a] = await Promise.all([api.getDevices(), api.getSummary(), api.getAlerts()]);
      setDevices(d.data || []);
      setSummary(s.data || null);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const assign = (deviceId, username) => {
    const next = { ...assignments, [deviceId]: username };
    setAssignments(next); saveAssignments(next);
  };

  const delDevice = async (id) => {
    if (!confirm("Delete this device?")) return;
    try { await api.deleteDevice(id); await load(); } catch (e) { console.error(e); alert("Failed to delete device"); }
  };

  const editDevice = async (id) => {
    const name = prompt("New name"); if (name == null) return;
    try { await api.updateDevice(id, { name }); await load(); } catch (e) { console.error(e); alert("Failed to update"); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><span>NEXUS</span><span>/</span><span>Admin</span></div>
          <div className="page-title">Administration</div>
          <div className="page-sub">Manage devices, users and system state</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => navigate("dashboard")}>Back</button>
        </div>
      </div>

      <div className="page-content">
        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <div className="stat-card accent"><div className="stat-label">Devices</div><div className="stat-value accent">{devices.length}</div></div>
          <div className="stat-card accent"><div className="stat-label">Users</div><div className="stat-value accent">{users.length}</div></div>
          <div className="stat-card red"><div className="stat-label">Alerts</div><div className="stat-value red">{summary?.unacked_alerts ?? "—"}</div></div>
          <div className="stat-card green"><div className="stat-label">Online</div><div className="stat-value green">{summary?.online ?? "—"}</div></div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><span>Users</span></div>
          <div className="card-body">
            {users.map((u) => (
              <div key={u.username} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                <div><strong>{u.username}</strong> <span style={{ color: "var(--text3)", fontFamily: "var(--mono)" }}>{u.role}</span></div>
                <div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { const name = prompt("Username", u.username); if (name) { const next = users.map(x => x.username===u.username ? { ...x, username: name } : x); setUsers(next); saveUsers(next); }}}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { if (!confirm('Delete user?')) return; const next = users.filter(x => x.username !== u.username); setUsers(next); saveUsers(next); }}>Delete</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { const name = prompt('New username'); if (!name) return; const next = [...users, { username: name, role: 'user' }]; setUsers(next); saveUsers(next); }}>+ Add User</button>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><span>Devices</span></div>
          <div className="card-body">
            {loading ? <div className="empty-state">Loading...</div> : (
              <table className="data-table">
                <thead><tr><th>Device</th><th>Type</th><th>Status</th><th>Assigned</th><th>Actions</th></tr></thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ width: 36 }}>{d.name}</div>
                        </div>
                      </td>
                      <td className="mono" style={{ textTransform: 'uppercase' }}>{d.type}</td>
                      <td><span className={`status-badge ${d.status}`}>{d.status}</span></td>
                      <td>{assignments[d.device_id] || '—'}</td>
                      <td>
                        <select value={assignments[d.device_id] || ''} onChange={(e) => assign(d.device_id, e.target.value || null)}>
                          <option value="">Unassigned</option>
                          {users.map((u) => <option key={u.username} value={u.username}>{u.username}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm" onClick={() => editDevice(d.id)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => delDevice(d.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
