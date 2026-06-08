const express = require("express");
const router = express.Router();
const { pool } = require("../database");

function cleanUser(body) {
  return {
    username: String(body.username || "").trim(),
    password: String(body.password || "").trim(),
    role: body.role === "admin" ? "admin" : "user",
  };
}

function requireAdmin(req, res, next) {
  if ((req.headers["x-user-role"] || req.body?.role) !== "admin") {
    return res.status(403).json({ success: false, error: "Admin role required" });
  }
  next();
}

router.post("/login", async (req, res) => {
  const { username, password } = cleanUser(req.body);
  if (!username || !password) return res.status(400).json({ success: false, error: "Username and password required" });

  try {
    const [rows] = await pool.query(
      `SELECT username, role FROM app_users WHERE username=? AND password=? LIMIT 1`,
      [username, password]
    );
    if (!rows.length) return res.status(401).json({ success: false, error: "Invalid credentials" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, username, role, created_at, updated_at FROM app_users ORDER BY username`);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const user = cleanUser(req.body);
  if (!user.username || !user.password) return res.status(400).json({ success: false, error: "Username and password required" });

  try {
    const [result] = await pool.query(
      `INSERT INTO app_users (username, password, role) VALUES (?,?,?)`,
      [user.username, user.password, user.role]
    );
    res.status(201).json({ success: true, id: result.insertId, data: { id: result.insertId, username: user.username, role: user.role } });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, error: "Username already exists" });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  const user = cleanUser(req.body);
  if (!user.username) return res.status(400).json({ success: false, error: "Username required" });

  try {
    const [currentRows] = await pool.query(`SELECT password FROM app_users WHERE id=?`, [req.params.id]);
    if (!currentRows.length) return res.status(404).json({ success: false, error: "User not found" });

    await pool.query(
      `UPDATE app_users SET username=?, password=?, role=? WHERE id=?`,
      [user.username, user.password || currentRows[0].password, user.role, req.params.id]
    );
    res.json({ success: true, data: { id: Number(req.params.id), username: user.username, role: user.role } });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, error: "Username already exists" });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM app_users WHERE id=?`, [req.params.id]);
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
