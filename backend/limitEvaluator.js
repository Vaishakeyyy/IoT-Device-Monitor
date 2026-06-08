const { pool } = require("./database");

function numOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickBreach(limit, value) {
  const current = Number(value);
  if (!Number.isFinite(current)) return null;

  if (limit.critical_threshold != null && current >= Number(limit.critical_threshold)) {
    return { severity: "critical", limitType: "critical_threshold", configuredLimit: Number(limit.critical_threshold) };
  }
  if (limit.max_limit != null && current > Number(limit.max_limit)) {
    return { severity: "critical", limitType: "max_limit", configuredLimit: Number(limit.max_limit) };
  }
  if (limit.min_limit != null && current < Number(limit.min_limit)) {
    return { severity: "critical", limitType: "min_limit", configuredLimit: Number(limit.min_limit) };
  }
  if (limit.warning_threshold != null && current >= Number(limit.warning_threshold)) {
    return { severity: "warning", limitType: "warning_threshold", configuredLimit: Number(limit.warning_threshold) };
  }

  return null;
}

async function evaluateReadingLimit({ device_id, metric, value, unit, broadcast }) {
  const [limits] = await pool.query(
    `SELECT * FROM device_limits WHERE device_id=? AND sensor_name=? LIMIT 1`,
    [device_id, metric]
  );
  if (!limits.length) return null;

  const limit = limits[0];
  const breach = pickBreach(limit, value);
  if (!breach) {
    await pool.query(`UPDATE devices SET status='online' WHERE device_id=?`, [device_id]);
    return { severity: "normal", limit };
  }

  const message = `${metric} ${value}${unit || limit.unit || ""} reached ${breach.limitType.replace("_", " ")} (${breach.configuredLimit}${unit || limit.unit || ""})`;
  const [result] = await pool.query(
    `INSERT INTO alerts (device_id, severity, message, sensor_name, current_value, configured_limit, limit_type)
     VALUES (?,?,?,?,?,?,?)`,
    [device_id, breach.severity, message, metric, value, breach.configuredLimit, breach.limitType]
  );

  const status = breach.severity === "critical" ? "critical" : "warning";
  await pool.query(`UPDATE devices SET status=? WHERE device_id=?`, [status, device_id]);

  const alert = {
    type: "alert",
    id: result.insertId,
    device_id,
    severity: breach.severity,
    message,
    sensor_name: metric,
    current_value: value,
    configured_limit: breach.configuredLimit,
    limit_type: breach.limitType,
    timestamp: new Date(),
  };

  if (broadcast) broadcast(alert);
  return alert;
}

function normalizeLimitBody(body) {
  return {
    sensor_name: String(body.sensor_name || body.metric || "").trim(),
    min_limit: numOrNull(body.min_limit),
    max_limit: numOrNull(body.max_limit),
    warning_threshold: numOrNull(body.warning_threshold),
    critical_threshold: numOrNull(body.critical_threshold),
    unit: body.unit ? String(body.unit).trim() : null,
  };
}

module.exports = { evaluateReadingLimit, normalizeLimitBody };
