import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { normalizeUsers, useAuth } from "../context/AuthContext";

function loadUsers() {
  try {
    return normalizeUsers(JSON.parse(localStorage.getItem("iot-users"))) || [
      { username: "admin", password: "adminpass", role: "admin" },
      { username: "alice", password: "alicepass", role: "user" }
    ];
  } catch (e) {
    return [
      { username: "admin", password: "adminpass", role: "admin" },
      { username: "alice", password: "alicepass", role: "user" }
    ];
  }
}

function saveUsers(list) {
  const normalized = normalizeUsers(list);
  localStorage.setItem("iot-users", JSON.stringify(normalized));
  return normalized;
}

function userExists(users, username, exceptUsername) {
  const clean = String(username || "").trim();
  return users.some((user) => user.username === clean && user.username !== exceptUsername);
}

function loadAssignments() {
  try { return JSON.parse(localStorage.getItem("iot-assignments")) || {}; }
  catch (e) { return {}; }
}

function saveAssignments(a) { localStorage.setItem("iot-assignments", JSON.stringify(a)); }

export default function Admin({ navigate }) {
  const { user } = useAuth();
  const [cmdLogs, setCmdLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("users");

  useEffect(() => {
    if (activeTab === "cmdlogs") {
      api.getAllCommandLogs().then((r) => setCmdLogs(r.data)).catch(() => {});
    }
  }, [activeTab]);

  if (!user || user.role !== "admin") {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="breadcrumb"><span>IoT</span><span>/</span><span>Admin</span></div>
            <div className="page-title">Administration</div>
            <div className="page-sub">Access denied</div>
          </div>
        </div>
        <div style={{ padding: "0 32px", borderBottom: "1px solid var(--border)", display: "flex", gap: 0 }}>
        {[["users","Users & Access"],["cmdlogs","Command Logs"]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: activeTab === id ? "2px solid var(--accent)" : "2px solid transparent", color: activeTab === id ? "var(--accent)" : "var(--text3)", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", cursor: "pointer", textTransform: "uppercase" }}>{label}</button>
        ))}
      </div>
      <div className="page-content" style={{ display: activeTab !== "users" ? "none" : undefined }}>
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
      const [d, s, a, u] = await Promise.all([api.getDevices(), api.getSummary(), api.getAlerts(), api.getUsers(user.role)]);
      setDevices(d.data || []);
      setSummary(s.data || null);
      setUsers((u.data || []).map((item) => ({
        id: item.id,
        username: String(item.username || "").trim(),
        role: item.role || "user",
        password: "",
      })).filter((item) => item.username));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user.role]);

  useEffect(() => { load(); }, [load]);

  const assign = (deviceId, username) => {
    const next = { ...assignments, [deviceId]: username };
    setAssignments(next); saveAssignments(next);
  };

  const delDevice = async (deviceId) => {
    if (!confirm("Delete this device?")) return;
    try { await api.deleteDevice(deviceId); await load(); } catch (e) { console.error(e); alert("Failed to delete device"); }
  };

  const editDevice = async (deviceId) => {
    const name = prompt("New name"); if (name == null) return;
    try { await api.updateDevice(deviceId, { name }); await load(); } catch (e) { console.error(e); alert("Failed to update"); }
  };

  const toggleDevice = async (deviceId, currentStatus) => {
    const nextStatus = currentStatus === 'online' ? 'offline' : 'online';
    try {
      await api.updateDevice(deviceId, { status: nextStatus });
      await load();
    } catch (e) { console.error(e); alert('Failed to toggle device status'); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><span>IoT</span><span>/</span><span>Admin</span></div>
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
                  <button className="btn btn-ghost btn-sm" onClick={async () => {
                    const name = prompt("Username", u.username)?.trim(); if (!name) return;
                    if (userExists(users, name, u.username)) { alert("Username already exists"); return; }
                    const pass = prompt("Password (leave blank to keep)");
                    const cleanPass = pass == null || pass === "" ? "" : pass.trim();
                    const next = users.map(x => x.username===u.username ? { ...x, username: name, password: cleanPass || x.password } : x);
                    try {
                      if (u.id) await api.updateUser(u.id, { username: name, password: cleanPass, role: u.role }, user.role);
                      await load();
                    } catch (e) {
                      console.error(e);
                      setUsers(saveUsers(next));
                    }
                  }}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={async () => {
                    if (!confirm('Delete user?')) return;
                    const next = users.filter(x => x.username !== u.username);
                    try {
                      if (u.id) await api.deleteUser(u.id, user.role);
                      await load();
                    } catch (e) {
                      console.error(e);
                      setUsers(saveUsers(next));
                    }
                  }}>Delete</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={async () => {
                const name = prompt('New username')?.trim(); if (!name) return;
                if (userExists(users, name)) { alert("Username already exists"); return; }
                const pass = prompt('Password for user'); if (pass == null) return;
                const cleanPass = pass.trim();
                if (!cleanPass) { alert("Password cannot be empty"); return; }
                const next = [...users, { username: name, role: 'user', password: cleanPass }];
                try {
                  await api.addUser({ username: name, role: "user", password: cleanPass }, user.role);
                  await load();
                } catch (e) {
                  console.error(e);
                  alert(e.message || "Failed to save user on server. Saved locally only.");
                  setUsers(saveUsers(next));
                }
              }}>+ Add User</button>
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
                        <button className="btn btn-ghost btn-sm" onClick={() => editDevice(d.device_id)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => delDevice(d.device_id)}>Delete</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleDevice(d.device_id, d.status)}>{d.status === 'online' ? 'Turn Off' : 'Turn On'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {activeTab === "cmdlogs" && (
        <div className="page-content">
          <div className="card">
            <div className="card-header">
              <span>All Command Logs</span>
              <button className="btn btn-ghost btn-sm" onClick={() => api.getAllCommandLogs().then((r) => setCmdLogs(r.data)).catch(() => {})}>↻ Refresh</button>
            </div>
            {cmdLogs.length === 0 ? (
              <div className="empty-state"><div className="empty-state-text">No commands logged yet</div></div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Device</th><th>Command</th><th>Payload</th><th>Issued By</th><th>Status</th><th>Time</th></tr></thead>
                <tbody>
                  {cmdLogs.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ color: "var(--text)", fontWeight: 500 }}>{c.device_name}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{c.device_id}</div>
                      </td>
                      <td style={{ fontFamily: "var(--mono)", color: "var(--accent)", fontSize: 12, fontWeight: 700 }}>{c.command}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>{c.payload ? JSON.stringify(c.payload).slice(0, 40) : "—"}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{c.issued_by}</td>
                      <td><span className={`status-badge ${c.status === "success" ? "online" : c.status === "failed" ? "critical" : "warning"}`}>{c.status}</span></td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>{new Date(c.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
