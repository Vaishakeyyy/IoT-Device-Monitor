import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("unacked");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter === "unacked" ? { acknowledged: false } : filter === "acked" ? { acknowledged: true } : {};
      const [alertResp, deviceResp] = await Promise.all([api.getAlerts(params), api.getDevices()]);
      const actualAlerts = alertResp.data || [];
      const deviceAlerts = deviceResp.data
        .filter((d) => d.status && d.status !== "online")
        .map((d) => ({
          id: `device-status-${d.device_id}`,
          device_id: d.device_id,
          device_name: d.name,
          location: d.location,
          severity: d.status,
          message: `Device status is ${d.status}`,
          acknowledged: false,
          created_at: d.last_seen || new Date().toISOString(),
          synthetic: true,
        }));

      const combined = filter === "acked" ? actualAlerts : [...deviceAlerts, ...actualAlerts];
      setAlerts(combined);
    } catch (e) {
      console.error(e);
      setAlerts([]);
      setError("Unable to load alerts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const acknowledge = async (id) => {
    try {
      await api.acknowledgeAlert(id);
      await load();
    } catch (e) {
      console.error(e);
      setError("Failed to acknowledge alert. Please retry.");
    }
  };

  const ackAll = async () => {
    try {
      const unacked = alerts.filter((a) => !a.acknowledged);
      await Promise.all(unacked.map((a) => api.acknowledgeAlert(a.id)));
      await load();
    } catch (e) {
      console.error(e);
      setError("Failed to acknowledge all alerts. Please retry.");
    }
  };

  const severityOrder = { critical: 0, warning: 1, info: 2, offline: 3 };
  const sorted = [...alerts].sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99));

  const counts = {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
    offline: alerts.filter((a) => a.severity === "offline").length,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="breadcrumb"><span>NEXUS</span><span>/</span><span>Alerts</span></div>
          <div className="page-title">Alert <span>Center</span></div>
          <div className="page-sub">{alerts.length} alerts</div>
        </div>
        <div className="page-actions">
          {filter === "unacked" && alerts.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={ackAll}>✓ Acknowledge All</button>
          )}
        </div>
      </div>

      <div className="page-content">
        {/* Stats */}
        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          {[ ["CRITICAL", counts.critical, "red"], ["WARNING", counts.warning, "yellow"], ["INFO", counts.info, "accent"], ["OFFLINE", counts.offline, "offline"] ].map(([l, v, c]) => (
            <div key={l} className={`stat-card ${c}`}>
              <div className="stat-label">{l}</div>
              <div className={`stat-value ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["unacked","Unacknowledged"],["acked","Acknowledged"],["all","All"]].map(([k, l]) => (
            <button key={k} className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>

        <div className="card">
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 12 }}>Loading...</div>
          ) : error ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--red)", fontFamily: "var(--mono)", fontSize: 12 }}>{error}</div>
          ) : sorted.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✓</div>
              <div className="empty-state-text">No alerts in this view</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th><th>Device</th><th>Location</th><th>Message</th><th>Time</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`status-badge ${a.severity}`}>{a.severity}</span></td>
                    <td>
                      <div style={{ fontWeight: 500, color: "var(--text)" }}>{a.device_name}</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{a.device_id}</div>
                    </td>
                    <td style={{ color: "var(--text2)" }}>{a.location || "—"}</td>
                    <td style={{ maxWidth: 300, color: "var(--text2)" }}>{a.message}</td>
                    <td className="mono">{new Date(a.created_at).toLocaleString()}</td>
                    <td>
                      {!a.acknowledged ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => acknowledge(a.id)}>✓ ACK</button>
                      ) : (
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)" }}>ACKNOWLEDGED</span>
                      )}
                    </td>
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
