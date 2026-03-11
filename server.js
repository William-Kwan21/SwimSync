require("dotenv").config();

const express = require("express");
const path = require("path");
const { initDatabase } = require("./db");

const app = express();
const port = Number(process.env.PORT || 3000);

const dbConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "hello_db"
};

let pool;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS now");
    res.json({ status: "ok", dbTime: rows[0].now });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/api/users", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, created_at FROM users ORDER BY id ASC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
});

app.post("/api/users", async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: "name and email are required" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO users (name, email) VALUES (?, ?)",
      [name.trim(), email.trim()]
    );

    const [rows] = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id = ?",
      [result.insertId]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return res.status(500).json({ message: "Failed to add user", error: error.message });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  const userId = Number(req.params.id);

  if (Number.isNaN(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to remove user", error: error.message });
  }
});

/* ── catch-all: unknown routes return JSON instead of Express HTML 404 ── */
app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    hint: "Make sure you are accessing the app through the Node server (npm start), not by opening the HTML file directly."
  });
});

/* ── global error handler ── */
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error", error: err.message });
});

async function start() {
  console.log("[hello-db] Starting…");
  console.log(`[hello-db] DB host : ${dbConfig.host}:${dbConfig.port}`);
  console.log(`[hello-db] DB name : ${dbConfig.database}`);
  console.log(`[hello-db] DB user : ${dbConfig.user}`);

  if (!process.env.MYSQL_PASSWORD) {
    console.warn("[hello-db] WARNING: MYSQL_PASSWORD is not set. Copy .env.example to .env and fill in your password.");
  }

  try {
    pool = await initDatabase(dbConfig);
    console.log("[hello-db] Database ready.");
    app.listen(port, "0.0.0.0", () => {
      console.log(`[hello-db] Listening on http://0.0.0.0:${port}`);
      console.log(`[hello-db] Open in browser: http://localhost:${port}`);
    });
  } catch (error) {
    console.error("[hello-db] Failed to start:", error.message);
    console.error("[hello-db] Common causes:");
    console.error("  1. MySQL is not running  →  sudo systemctl start mysql");
    console.error("  2. Wrong password in .env  →  check MYSQL_PASSWORD");
    console.error("  3. node_modules missing  →  run: npm install");
    process.exit(1);
  }
}

start();
