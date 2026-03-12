require("dotenv").config();

const bcrypt = require("bcryptjs");
const express = require("express");
const jwt = require("jsonwebtoken");
const path = require("path");
const { initDatabase } = require("./db");

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || "swimsync-dev-secret";

const dbConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "hello_db"
};

const roleDescriptions = {
  admin: "Full access to manage users and system records.",
  coach: "Can view rosters and practice-related data.",
  swimmer: "Can view personal athlete information.",
  parent: "Can view linked swimmer information and schedules."
};

let pool;

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    jwtSecret,
    { expiresIn: "8h" }
  );
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied for this role" });
    }
    return next();
  };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/app", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS now");
    res.json({ status: "ok", dbTime: rows[0].now });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, password_hash, role, created_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email.trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];
    const matches = user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!matches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = createToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        roleDescription: roleDescriptions[user.role] || "Role permissions active."
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed", error: error.message });
  }
});

app.get("/api/me", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, role, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.user.sub]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      ...rows[0],
      roleDescription: roleDescriptions[rows[0].role] || "Role permissions active."
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
});

app.get("/api/users", authenticate, async (req, res) => {
  try {
    if (req.user.role === "admin" || req.user.role === "coach") {
      const [rows] = await pool.query(
        "SELECT id, name, email, role, created_at FROM users ORDER BY id ASC"
      );
      return res.json(rows);
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1",
      [req.user.sub]
    );
    return res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
});

app.post("/api/users", authenticate, requireRole("admin"), async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "name, email, password, and role are required" });
  }

  if (!["admin", "coach", "swimmer", "parent"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name.trim(), email.trim(), passwordHash, role]
    );

    const [rows] = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
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

app.delete("/api/users/:id", authenticate, requireRole("admin"), async (req, res) => {
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
      console.log(`[hello-db] Login page: http://localhost:${port}/`);
      console.log(`[hello-db] App page  : http://localhost:${port}/app`);
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
