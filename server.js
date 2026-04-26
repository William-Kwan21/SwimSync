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
  database: process.env.MYSQL_DATABASE || "hello_db",
};

const roleDescriptions = {
  admin: "Full access to manage users and system records.",
  coach: "Can view rosters and practice-related data.",
  swimmer: "Can view personal athlete information.",
  parent: "Can view linked swimmer information and schedules.",
};

let pool;

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    jwtSecret,
    { expiresIn: "8h" },
  );
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    const [rows] = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [decoded.sub],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    req.user = {
      ...decoded,
      sub: rows[0].id,
      name: rows[0].name,
      email: rows[0].email,
      role: rows[0].role,
    };

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

async function getVisibleGroupIdsForUser(user) {
  if (!user || !user.role) {
    return [];
  }

  if (user.role === "admin" || user.role === "coach") {
    return null;
  }

  if (user.role === "swimmer") {
    const [rows] = await pool.query(
      `SELECT DISTINCT sg.group_id
       FROM swimmers s
       JOIN swimmer_groups sg ON sg.swimmer_id = s.id
       WHERE s.user_id = ?`,
      [user.sub],
    );
    return rows.map((row) => row.group_id);
  }

  if (user.role === "parent") {
    const [rows] = await pool.query(
      `SELECT DISTINCT sg.group_id
       FROM parents p
       JOIN parent_swimmers ps ON ps.parent_id = p.id
       JOIN swimmer_groups sg ON sg.swimmer_id = ps.swimmer_id
       WHERE p.user_id = ?`,
      [user.sub],
    );
    return rows.map((row) => row.group_id);
  }

  return [];
}

async function getAccessibleSwimmerIdsForUser(user) {
  if (!user || !user.role) {
    return [];
  }

  if (user.role === "admin" || user.role === "coach") {
    return null;
  }

  if (user.role === "swimmer") {
    const [rows] = await pool.query(
      `SELECT s.id
       FROM swimmers s
       WHERE s.user_id = ?
       LIMIT 1`,
      [user.sub],
    );
    return rows.map((row) => row.id);
  }

  if (user.role === "parent") {
    const [rows] = await pool.query(
      `SELECT DISTINCT ps.swimmer_id
       FROM parents p
       JOIN parent_swimmers ps ON ps.parent_id = p.id
       WHERE p.user_id = ?`,
      [user.sub],
    );
    return rows.map((row) => row.swimmer_id);
  }

  return [];
}

function normalizeStroke(stroke) {
  return String(stroke || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeGender(gender) {
  const raw = String(gender || "").trim().toLowerCase();
  if (!raw) return "";
  if (["m", "male", "boys", "boy", "men", "man"].includes(raw)) {
    return "male";
  }
  if (["f", "female", "girls", "girl", "women", "woman"].includes(raw)) {
    return "female";
  }
  if (["mixed", "open", "coed", "co-ed", "all"].includes(raw)) {
    return "mixed";
  }
  return raw;
}

function genderMatches(eventGender, swimmerGender) {
  const e = normalizeGender(eventGender);
  const s = normalizeGender(swimmerGender);
  if (!e || e === "mixed") return true;
  if (!s) return true;
  return e === s;
}

function parseTimeToSeconds(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
  }

  if (/^\d{1,2}:\d{1,2}(\.\d+)?$/.test(raw)) {
    const [minutesPart, secondsPart] = raw.split(":");
    const minutes = Number(minutesPart);
    const seconds = Number(secondsPart);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return null;
    }
    return Number((minutes * 60 + seconds).toFixed(2));
  }

  if (/^\d+:\d{1,2}:\d{1,2}(\.\d+)?$/.test(raw)) {
    const [hoursPart, minutesPart, secondsPart] = raw.split(":");
    const hours = Number(hoursPart);
    const minutes = Number(minutesPart);
    const seconds = Number(secondsPart);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds)
    ) {
      return null;
    }
    return Number((hours * 3600 + minutes * 60 + seconds).toFixed(2));
  }

  return null;
}

function formatSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return null;

  const mins = Math.floor(value / 60);
  const secs = (value - mins * 60).toFixed(2).padStart(5, "0");
  return `${mins}:${secs}`;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvToObjects(content) {
  const lines = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] != null ? values[index] : "";
    });
    rows.push(row);
  }

  return rows;
}

function parseCsvFromAnyText(content) {
  const rawLines = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const candidateLines = rawLines.filter((line) => line.includes(","));
  if (candidateLines.length < 2) {
    return [];
  }

  return parseCsvToObjects(candidateLines.join("\n"));
}

async function extractTextFromPdfBase64(base64) {
  let pdfParse;
  try {
    pdfParse = require("pdf-parse");
  } catch (_error) {
    throw new Error(
      "PDF support requires pdf-parse. Run npm install to install dependencies.",
    );
  }

  let buffer;
  try {
    buffer = Buffer.from(String(base64 || ""), "base64");
  } catch (_error) {
    throw new Error("Invalid base64 PDF payload");
  }

  if (!buffer.length) {
    throw new Error("PDF payload is empty");
  }

  const parsed = await pdfParse(buffer);
  const text = String(parsed && parsed.text ? parsed.text : "").trim();
  if (!text) {
    throw new Error("Unable to read text from PDF");
  }

  return text;
}

function parseMultipartUpload(req) {
  return new Promise((resolve, reject) => {
     let Busboy;
    try {
      Busboy = require("busboy");
    } catch (_error) {
      reject(
        new Error(
          "Multipart upload support is unavailable. Run npm install to install dependencies.",
        ),
      );
      return;
    }

    const contentType = req.headers["content-type"] || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      resolve({ fields: {}, file: null, fileName: "" });
      return;
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: 100 * 1024 * 1024,
      },
    });

    const fields = {};
    let fileBuffer = null;
    let fileName = "";
    let fileMimeType = "";

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (_name, file, info) => {
      fileName = info && info.filename ? info.filename : fileName;
      fileMimeType = info && info.mimeType ? info.mimeType : fileMimeType;
      const chunks = [];

      file.on("data", (chunk) => {
        chunks.push(chunk);
      });

      file.on("limit", () => {
        reject(
          new Error("Uploaded file is too large. Try a smaller PDF or CSV export."),
        );
      });

      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("error", reject);
    busboy.on("finish", () => {
      resolve({
        fields,
        file: fileBuffer,
        fileName,
        fileMimeType,
      });
    });

    req.pipe(busboy);
  });
}

async function getImportedTextFromPayload(payload) {
  if (Buffer.isBuffer(payload)) {
    const parsed = await (async () => {
      let pdfParse;
      try {
        pdfParse = require("pdf-parse");
      } catch (_error) {
        throw new Error(
          "PDF support requires pdf-parse. Run npm install to install dependencies.",
        );
      }

      const pdf = await pdfParse(payload);
      const text = String(pdf && pdf.text ? pdf.text : "").trim();
      if (!text) {
        throw new Error("Unable to read text from PDF");
      }
      return text;
    })();
    return parsed;
  }

  const rawContent = payload && payload.content ? String(payload.content) : "";
  const rawType = payload && payload.file_type ? String(payload.file_type) : "";
  const rawName = payload && payload.file_name ? String(payload.file_name) : "";
  const rawEncoding = payload && payload.encoding ? String(payload.encoding) : "utf8";

  const lowerType = rawType.trim().toLowerCase();
  const lowerName = rawName.trim().toLowerCase();
  const isPdf =
    lowerType === "pdf" ||
    lowerType === "application/pdf" ||
    lowerName.endsWith(".pdf");

  if (!rawContent.trim()) {
    throw new Error("content is required");
  }

  if (!isPdf) {
    return rawContent;
  }

  if (rawEncoding === "base64") {
    return extractTextFromPdfBase64(rawContent);
  }

  throw new Error("PDF uploads must be sent as a raw PDF file or base64 content");
}

async function extractImportPayload(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const multipart = await parseMultipartUpload(req);
    const fileBuffer = multipart.file;
    const fileName = multipart.fileName || "";
    const defaultSwimmerId = multipart.fields.default_swimmer_id
      ? Number(multipart.fields.default_swimmer_id)
      : 0;

    if (fileBuffer && fileBuffer.length) {
      if (fileName.toLowerCase().endsWith(".pdf") || multipart.fileMimeType === "application/pdf") {
        const content = await getImportedTextFromPayload(fileBuffer);
        return {
          content,
          file_name: fileName,
          default_swimmer_id: defaultSwimmerId,
        };
      }

      return {
        content: fileBuffer.toString("utf8"),
        file_name: fileName,
        default_swimmer_id: defaultSwimmerId,
      };
    }

    return {
      content: multipart.fields.content || "",
      file_name: fileName,
      default_swimmer_id: defaultSwimmerId,
    };
  }

  return req.body || {};
}

function firstNonEmpty(obj, keys, fallback = "") {
  for (const key of keys) {
    const value = obj && obj[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return fallback;
}

function normalizeNameForLookup(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\b(times?|results?|export)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEventCode(rawEventCode) {
  const value = String(rawEventCode || "").trim();
  if (!value) {
    return { stroke: "", distance_meters: null, course: null };
  }

  const match = value.match(/^(\d+)\s+([A-Za-z]+)\s+([A-Za-z]{3})$/i);
  if (!match) {
    return { stroke: "", distance_meters: null, course: null };
  }

  const distance_meters = Number(match[1]);
  const strokeCode = match[2].toUpperCase();
  const course = match[3].toUpperCase();
  const strokeMap = {
    FR: "freestyle",
    FREE: "freestyle",
    BK: "backstroke",
    BACK: "backstroke",
    BR: "breaststroke",
    BREAST: "breaststroke",
    FL: "butterfly",
    FLY: "butterfly",
    IM: "individual medley",
  };

  return {
    stroke: normalizeStroke(strokeMap[strokeCode] || strokeCode),
    distance_meters: Number.isFinite(distance_meters) ? distance_meters : null,
    course,
  };
}

async function findSwimmerIdByName(connection, swimmerName) {
  const normalizedInput = normalizeNameForLookup(swimmerName);
  if (!normalizedInput) {
    return null;
  }

  const [rows] = await connection.query(
    `SELECT s.id AS swimmer_id, u.name
     FROM swimmers s
     JOIN users u ON u.id = s.user_id`,
  );

  const exact = rows.find(
    (row) => normalizeNameForLookup(row.name) === normalizedInput,
  );
  if (exact) {
    return Number(exact.swimmer_id);
  }

  const partial = rows.find((row) => {
    const normalizedRowName = normalizeNameForLookup(row.name);
    return (
      normalizedRowName.includes(normalizedInput) ||
      normalizedInput.includes(normalizedRowName)
    );
  });

  return partial ? Number(partial.swimmer_id) : null;
}

function normalizeDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseTruthy(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "selected"].includes(raw);
}

function parseMeetFileContent(content) {
  const text = String(content || "").trim();
  if (!text) {
    throw new Error("Meet file content is empty");
  }

  let payloadRows = [];
  let meta = null;

  if (text.startsWith("{") || text.startsWith("[")) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      payloadRows = parsed;
    } else {
      meta = parsed;
      payloadRows = Array.isArray(parsed.rows)
        ? parsed.rows
        : Array.isArray(parsed.events)
          ? parsed.events
          : [];
    }
  } else {
    payloadRows = parseCsvToObjects(text);
    if (!payloadRows.length) {
      payloadRows = parseCsvFromAnyText(text);
    }
  }

  if (!Array.isArray(payloadRows) || payloadRows.length === 0) {
    throw new Error(
      "No meet rows found. Provide JSON with events/rows or a CSV with at least one data row.",
    );
  }

  const first = payloadRows[0];
  const meetName =
    (meta && firstNonEmpty(meta, ["meet_name", "meetName", "title"])) ||
    firstNonEmpty(first, ["meet_name", "meet", "meetname", "title"], "Imported Meet");

  const meetDate =
    normalizeDateOnly(
      (meta && firstNonEmpty(meta, ["meet_date", "meetDate", "date"])) ||
        firstNonEmpty(first, ["meet_date", "date", "meet_day", "day"]),
    ) || normalizeDateOnly(new Date().toISOString().slice(0, 10));

  const location =
    (meta && firstNonEmpty(meta, ["location"])) ||
    firstNonEmpty(first, ["location", "pool", "venue"], "");

  const hostTeam =
    (meta && firstNonEmpty(meta, ["host_team", "hostTeam", "host"])) ||
    firstNonEmpty(first, ["host_team", "host"], "");

  const daySet = new Set();
  const events = [];

  const metaDays = meta && Array.isArray(meta.days) ? meta.days : [];
  metaDays.forEach((day) => {
    const normalized = normalizeDateOnly(day);
    if (normalized) daySet.add(normalized);
  });

  payloadRows.forEach((row, index) => {
    const meetDay = normalizeDateOnly(
      firstNonEmpty(row, ["meet_day", "day", "day_date", "date"]),
    );
    if (meetDay) {
      daySet.add(meetDay);
    }

    const eventName = firstNonEmpty(row, ["event_name", "event", "name"], "");
    if (!eventName) {
      return;
    }

    const stroke = firstNonEmpty(row, ["stroke"], "");
    const distanceRaw = firstNonEmpty(row, ["distance_meters", "distance", "meters"], "");
    const distanceMeters = distanceRaw ? Number(distanceRaw) : null;
    const ageGroup = firstNonEmpty(row, ["age_group", "age"], "");
    const gender = firstNonEmpty(row, ["gender", "sex"], "");
    const qualifyingRaw = firstNonEmpty(row, ["qualifying_time", "time_standard", "cut_time", "standard"], "");
    const qualifyingSeconds = parseTimeToSeconds(qualifyingRaw);
    const selectedRaw = firstNonEmpty(row, ["is_selected", "selected"], "");

    events.push({
      event_name: eventName,
      stroke: stroke || null,
      distance_meters: Number.isFinite(distanceMeters) ? distanceMeters : null,
      age_group: ageGroup || null,
      gender: gender || null,
      qualifying_time_seconds: qualifyingSeconds,
      qualifying_time_text: qualifyingSeconds != null ? formatSeconds(qualifyingSeconds) : null,
      is_selected: selectedRaw ? parseTruthy(selectedRaw) : index < 4,
    });
  });

  if (!events.length) {
    throw new Error("No valid events were found in the meet file");
  }

  if (!daySet.size) {
    daySet.add(meetDate);
  }

  return {
    meet_name: meetName,
    meet_date: meetDate,
    location: location || null,
    host_team: hostTeam || null,
    days: Array.from(daySet).sort(),
    events,
  };
}

async function getCoachIdForUser(userId) {
  const [rows] = await pool.query(
    "SELECT id FROM coaches WHERE user_id = ? LIMIT 1",
    [userId],
  );
  return rows.length ? rows[0].id : null;
}

async function getSwimmerRowsByIds(swimmerIds) {
  if (!Array.isArray(swimmerIds) || swimmerIds.length === 0) {
    return [];
  }

  const [rows] = await pool.query(
    `SELECT s.id AS swimmer_id, u.name AS swimmer_name, s.gender
     FROM swimmers s
     JOIN users u ON u.id = s.user_id
     WHERE s.id IN (${swimmerIds.map(() => "?").join(",")})
     ORDER BY u.name ASC`,
    swimmerIds,
  );

  return rows;
}

async function getMeetEligibilityForSwimmers(meetId, swimmerIds) {
  const eventRows = await (async () => {
    const [rows] = await pool.query(
      `SELECT id, event_name, stroke, distance_meters, gender,
              is_selected, qualifying_time_seconds
       FROM meet_events
       WHERE meet_id = ?
       ORDER BY id ASC`,
      [meetId],
    );
    return rows;
  })();

  const selectedEvents = eventRows.filter((event) => Number(event.is_selected) === 1);

  const eligibilityBySwimmerId = new Map();

  if (!Array.isArray(swimmerIds) || swimmerIds.length === 0 || !selectedEvents.length) {
    return {
      selectedEvents,
      eligibilityBySwimmerId,
      visibleSwimmerIds: [],
    };
  }

  const swimmers = await getSwimmerRowsByIds(swimmerIds);
  const [timeRows] = await pool.query(
    `SELECT swimmer_id, stroke, distance_meters, best_time_seconds
     FROM swimmer_best_times
     WHERE swimmer_id IN (${swimmerIds.map(() => "?").join(",")})`,
    swimmerIds,
  );

  const timesBySwimmer = new Map();
  timeRows.forEach((row) => {
    const swimmerId = Number(row.swimmer_id);
    if (!timesBySwimmer.has(swimmerId)) {
      timesBySwimmer.set(swimmerId, new Map());
    }
    const key = `${normalizeStroke(row.stroke)}|${Number(row.distance_meters) || 0}`;
    timesBySwimmer.get(swimmerId).set(key, Number(row.best_time_seconds));
  });

  swimmers.forEach((swimmer) => {
    const swimmerId = Number(swimmer.swimmer_id);
    const swimmerTimes = timesBySwimmer.get(swimmerId) || new Map();
    const eligibleEventIds = [];

    selectedEvents.forEach((event) => {
      if (!genderMatches(event.gender, swimmer.gender)) {
        return;
      }

      const hasStandard =
        event.qualifying_time_seconds != null &&
        Number.isFinite(Number(event.qualifying_time_seconds));

      if (!hasStandard) {
        eligibleEventIds.push(Number(event.id));
        return;
      }

      const distance = Number(event.distance_meters);
      const stroke = normalizeStroke(event.stroke);
      if (!distance || !stroke) {
        return;
      }

      const key = `${stroke}|${distance}`;
      const best = swimmerTimes.get(key);
      const standard = Number(event.qualifying_time_seconds);
      if (Number.isFinite(best) && best <= standard) {
        eligibleEventIds.push(Number(event.id));
      }
    });

    eligibilityBySwimmerId.set(swimmerId, {
      swimmer_id: swimmerId,
      swimmer_name: swimmer.swimmer_name,
      eligible_event_ids: eligibleEventIds,
      is_visible: eligibleEventIds.length > 0,
    });
  });

  const visibleSwimmerIds = Array.from(eligibilityBySwimmerId.values())
    .filter((entry) => entry.is_visible)
    .map((entry) => entry.swimmer_id);

  return {
    selectedEvents,
    eligibilityBySwimmerId,
    visibleSwimmerIds,
  };
}

app.use(express.json({ limit: "100mb" }));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/signup", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
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
      [email.trim()],
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
        roleDescription:
          roleDescriptions[user.role] || "Role permissions active.",
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Login failed", error: error.message });
  }
});

app.post("/api/signup", async (req, res) => {
  const { name, email, password, role, gender, date_of_birth, address } = req.body;

  if (!name || !email || !password || !role || !gender || !date_of_birth || !address) {
    return res
      .status(400)
      .json({ message: "name, email, password, role, gender, date_of_birth, and address are required" });
  }

  if (!["swimmer", "parent"].includes(role)) {
    return res.status(400).json({ message: "Role must be swimmer or parent" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters" });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanGender = String(gender).trim().toLowerCase();
  const cleanAddress = String(address).trim();
  const cleanDob = normalizeDateOnly(date_of_birth);

  if (!cleanName || !cleanEmail || !cleanGender || !cleanAddress || !cleanDob) {
    return res.status(400).json({
      message: "name, email, gender, date_of_birth, and address must be valid and non-blank",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(
      "INSERT INTO users (name, email, password_hash, role, gender, date_of_birth, address) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [cleanName, cleanEmail, passwordHash, role, cleanGender, cleanDob, cleanAddress],
    );

    if (role === "swimmer") {
      await connection.query(
        "INSERT INTO swimmers (user_id, date_of_birth, gender, skill_level) VALUES (?, ?, ?, NULL)",
        [result.insertId, cleanDob, cleanGender],
      );

      const [swimmerRows] = await connection.query(
        "SELECT id FROM swimmers WHERE user_id = ? LIMIT 1",
        [result.insertId],
      );
      const [defaultGroupRows] = await connection.query(
        "SELECT id FROM practice_groups WHERE group_name = ? LIMIT 1",
        ["Junior 1"],
      );

      if (swimmerRows.length && defaultGroupRows.length) {
        await connection.query(
          `INSERT INTO swimmer_groups (swimmer_id, group_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE group_id = VALUES(group_id)`,
          [swimmerRows[0].id, defaultGroupRows[0].id],
        );
      }
    }

    if (role === "parent") {
      await connection.query(
        "INSERT INTO parents (user_id, phone, emergency_contact) VALUES (?, NULL, NULL)",
        [result.insertId],
      );
    }

    await connection.commit();

    return res.status(201).json({ message: "Account created successfully" });
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email already exists" });
    }

    return res
      .status(500)
      .json({ message: "Signup failed", error: error.message });
  } finally {
    connection.release();
  }
});

app.get("/api/me", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, role, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.user.sub],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      ...rows[0],
      roleDescription:
        roleDescriptions[rows[0].role] || "Role permissions active.",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch profile", error: error.message });
  }
});

app.get("/api/users", authenticate, async (req, res) => {
  try {
    if (req.user.role === "admin" || req.user.role === "coach") {
      const [rows] = await pool.query(
        "SELECT id, name, email, role, created_at FROM users ORDER BY id ASC",
      );
      return res.json(rows);
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1",
      [req.user.sub],
    );
    return res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch users", error: error.message });
  }
});

app.post("/api/users", authenticate, requireRole("admin"), async (req, res) => {
  const { name, email, password, role, gender, date_of_birth, address } = req.body;

  if (!name || !email || !password || !role || !gender || !date_of_birth || !address) {
    return res
      .status(400)
      .json({ message: "name, email, password, role, gender, date_of_birth, and address are required" });
  }

  if (!["admin", "coach", "swimmer", "parent"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters" });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanGender = String(gender).trim().toLowerCase();
  const cleanAddress = String(address).trim();
  const cleanDob = normalizeDateOnly(date_of_birth);

  if (!cleanName || !cleanEmail || !cleanGender || !cleanAddress || !cleanDob) {
    return res.status(400).json({
      message: "name, email, gender, date_of_birth, and address must be valid and non-blank",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(
      "INSERT INTO users (name, email, password_hash, role, gender, date_of_birth, address) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [cleanName, cleanEmail, passwordHash, role, cleanGender, cleanDob, cleanAddress],
    );

    if (role === "swimmer") {
      await connection.query(
        "INSERT INTO swimmers (user_id, date_of_birth, gender, skill_level) VALUES (?, ?, ?, NULL)",
        [result.insertId, cleanDob, cleanGender],
      );
    }

    if (role === "parent") {
      await connection.query(
        "INSERT INTO parents (user_id, phone, emergency_contact) VALUES (?, NULL, NULL)",
        [result.insertId],
      );
    }

    if (role === "coach" || role === "admin") {
      await connection.query(
        "INSERT INTO coaches (user_id, certification, years_experience) VALUES (?, NULL, NULL)",
        [result.insertId],
      );
    }

    const [rows] = await connection.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
      [result.insertId],
    );

    await connection.commit();

    return res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email already exists" });
    }
    return res
      .status(500)
      .json({ message: "Failed to add user", error: error.message });
  } finally {
    connection.release();
  }
});

app.delete(
  "/api/users/:id",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);

    if (Number.isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    try {
      const [result] = await pool.query("DELETE FROM users WHERE id = ?", [
        userId,
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(204).send();
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Failed to remove user", error: error.message });
    }
  },
);

/* ── page routes ── */
app.get("/schedule", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "schedule.html"));
});

app.get("/team", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "team.html"));
});

app.get("/meets", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "meets.html"));
});

/* ── practice groups ── */
app.get("/api/practice-groups", authenticate, async (req, res) => {
  try {
    const visibleGroupIds = await getVisibleGroupIdsForUser(req.user);

    if (Array.isArray(visibleGroupIds) && visibleGroupIds.length === 0) {
      return res.json([]);
    }

    const selectSql = `SELECT pg.id, pg.group_name, pg.level,
              u.name AS coach_name
       FROM practice_groups pg
       LEFT JOIN coaches c ON pg.coach_id = c.id
       LEFT JOIN users u ON c.user_id = u.id`;

    const [rows] = Array.isArray(visibleGroupIds)
      ? await pool.query(
          `${selectSql}
       WHERE pg.id IN (${visibleGroupIds.map(() => "?").join(",")})
       ORDER BY pg.group_name ASC`,
          visibleGroupIds,
        )
      : await pool.query(
          `${selectSql}
       ORDER BY pg.group_name ASC`,
        );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch practice groups",
      error: error.message,
    });
  }
});

app.post(
  "/api/practice-groups",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const { group_name, level } = req.body;
    if (!group_name) {
      return res.status(400).json({ message: "group_name is required" });
    }

    let coachId = null;
    if (req.user.role === "coach") {
      const [rows] = await pool.query(
        "SELECT id FROM coaches WHERE user_id = ? LIMIT 1",
        [req.user.sub],
      );
      if (rows.length) coachId = rows[0].id;
    }

    try {
      const [result] = await pool.query(
        "INSERT INTO practice_groups (group_name, level, coach_id) VALUES (?, ?, ?)",
        [group_name.trim(), level || null, coachId],
      );
      const [rows] = await pool.query(
        `SELECT pg.id, pg.group_name, pg.level, u.name AS coach_name
       FROM practice_groups pg
       LEFT JOIN coaches c ON pg.coach_id = c.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE pg.id = ?`,
        [result.insertId],
      );
      return res.status(201).json(rows[0]);
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Failed to create group", error: error.message });
    }
  },
);

/* ── practice schedule ── */
app.get("/api/schedule", authenticate, async (req, res) => {
  const requestedDate = (req.query && req.query.date) || null;
  const hasDateFilter =
    typeof requestedDate === "string" && requestedDate.trim() !== "";

  if (hasDateFilter && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return res
      .status(400)
      .json({ message: "Invalid date format. Use YYYY-MM-DD." });
  }

  try {
    const visibleGroupIds = await getVisibleGroupIdsForUser(req.user);
    if (Array.isArray(visibleGroupIds) && visibleGroupIds.length === 0) {
      return res.json([]);
    }

    const whereClauses = [];
    const params = [];

    if (hasDateFilter) {
      whereClauses.push("ps.practice_date = ?");
      params.push(requestedDate);
    } else {
      whereClauses.push("ps.practice_date >= CURDATE()");
    }

    if (Array.isArray(visibleGroupIds)) {
      whereClauses.push(
        `ps.group_id IN (${visibleGroupIds.map(() => "?").join(",")})`,
      );
      params.push(...visibleGroupIds);
    }

    const orderSql = hasDateFilter
      ? "ORDER BY ps.start_time ASC"
      : "ORDER BY ps.practice_date ASC, ps.start_time ASC";

    let rows;
    if (req.user.role === "swimmer") {
      const [swimmerRows] = await pool.query(
        "SELECT id FROM swimmers WHERE user_id = ? LIMIT 1",
        [req.user.sub],
      );

      if (swimmerRows.length === 0) {
        return res.json([]);
      }

      const swimmerId = swimmerRows[0].id;
      const [result] = await pool.query(
        `SELECT ps.id, ps.group_id, ps.practice_date, ps.start_time, ps.end_time, ps.location,
                pg.group_name, pg.level,
                a.status AS my_attendance_status,
                a.note AS my_attendance_note
         FROM practice_schedule ps
         JOIN practice_groups pg ON ps.group_id = pg.id
         LEFT JOIN attendance a ON a.schedule_id = ps.id AND a.swimmer_id = ?
         WHERE ${whereClauses.join(" AND ")}
         ${orderSql}`,
        [swimmerId, ...params],
      );
      rows = result;
    } else if (req.user.role === "parent") {
      const [result] = await pool.query(
        `SELECT ps.id, ps.group_id, ps.practice_date, ps.start_time, ps.end_time, ps.location,
                pg.group_name, pg.level,
                GROUP_CONCAT(
                  CASE
                    WHEN swg.swimmer_id IS NULL THEN NULL
                    ELSE CONCAT(swim_user.name, ': ', COALESCE(a.status, 'unmarked'))
                  END
                  ORDER BY swim_user.name ASC
                  SEPARATOR ' | '
                ) AS parent_attendance_summary
         FROM practice_schedule ps
         JOIN practice_groups pg ON ps.group_id = pg.id
         LEFT JOIN parents p ON p.user_id = ?
         LEFT JOIN parent_swimmers psw ON psw.parent_id = p.id
         LEFT JOIN swimmers sw ON sw.id = psw.swimmer_id
         LEFT JOIN swimmer_groups swg ON swg.swimmer_id = sw.id AND swg.group_id = ps.group_id
         LEFT JOIN users swim_user ON swim_user.id = sw.user_id
         LEFT JOIN attendance a ON a.schedule_id = ps.id AND a.swimmer_id = swg.swimmer_id
         WHERE ${whereClauses.join(" AND ")}
         GROUP BY ps.id, ps.group_id, ps.practice_date, ps.start_time, ps.end_time, ps.location, pg.group_name, pg.level
         ${orderSql}`,
        [req.user.sub, ...params],
      );
      rows = result;
    } else {
      const [result] = await pool.query(
        `SELECT ps.id, ps.group_id, ps.practice_date, ps.start_time, ps.end_time, ps.location,
                pg.group_name, pg.level
         FROM practice_schedule ps
         JOIN practice_groups pg ON ps.group_id = pg.id
         WHERE ${whereClauses.join(" AND ")}
         ${orderSql}`,
        params,
      );
      rows = result;
    }

    return res.json(rows);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch schedule", error: error.message });
  }
});

app.post(
  "/api/schedule",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const { group_id, practice_date, start_time, end_time, location } =
      req.body;
    const repeatWeekly = Boolean(req.body.repeat_weekly);
    const repeatUntilRemoved = Boolean(req.body.repeat_until_removed);
    const repeatUntilRaw =
      typeof req.body.repeat_until === "string"
        ? req.body.repeat_until.trim()
        : "";
    const repeatDaysInput = Array.isArray(req.body.repeat_days)
      ? req.body.repeat_days
      : [];
    const repeatDays = [
      ...new Set(
        repeatDaysInput
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      ),
    ];

    if (!group_id || !practice_date || !start_time || !end_time) {
      return res.status(400).json({
        message:
          "group_id, practice_date, start_time, and end_time are required",
      });
    }

    const baseDate = new Date(`${practice_date}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) {
      return res.status(400).json({ message: "Invalid practice_date" });
    }

    const hasRepeatUntil = Boolean(repeatUntilRaw);
    const hasRepeatDays = repeatDays.length > 0;
    const shouldRepeat =
      repeatWeekly || repeatUntilRemoved || hasRepeatUntil || hasRepeatDays;
    let repeatUntilDate = null;

    if (shouldRepeat) {
      if (hasRepeatUntil) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(repeatUntilRaw)) {
          return res
            .status(400)
            .json({ message: "Invalid repeat_until date. Use YYYY-MM-DD." });
        }

        repeatUntilDate = new Date(`${repeatUntilRaw}T00:00:00`);
        if (Number.isNaN(repeatUntilDate.getTime())) {
          return res.status(400).json({ message: "Invalid repeat_until date" });
        }
      } else if (repeatUntilRemoved) {
        repeatUntilDate = new Date(baseDate);
        repeatUntilDate.setDate(baseDate.getDate() + 520 * 7);
      } else {
        return res.status(400).json({
          message: "repeat_until is required for weekly recurrence",
        });
      }

      if (repeatUntilDate < baseDate) {
        return res.status(400).json({
          message: "repeat_until must be on or after practice_date",
        });
      }
    }

    function toIsoDateLocal(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function nextDateForWeekdayOnOrAfter(startDate, weekday) {
      const candidate = new Date(startDate);
      const delta = (weekday - candidate.getDay() + 7) % 7;
      candidate.setDate(candidate.getDate() + delta);
      return candidate;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const values = [];
      const params = [];

      if (shouldRepeat) {
        const weekdays = repeatDays.length ? repeatDays : [baseDate.getDay()];

        weekdays.forEach((weekday) => {
          let cursor = nextDateForWeekdayOnOrAfter(baseDate, weekday);
          while (cursor <= repeatUntilDate) {
            values.push("(?, ?, ?, ?, ?)");
            params.push(
              group_id,
              toIsoDateLocal(cursor),
              start_time,
              end_time,
              location || null,
            );
            const next = new Date(cursor);
            next.setDate(next.getDate() + 7);
            cursor = next;
          }
        });
      } else {
        values.push("(?, ?, ?, ?, ?)");
        params.push(
          group_id,
          toIsoDateLocal(baseDate),
          start_time,
          end_time,
          location || null,
        );
      }

      if (!values.length) {
        return res
          .status(400)
          .json({ message: "No sessions to create from selected options" });
      }

      const [result] = await connection.query(
        `INSERT INTO practice_schedule (group_id, practice_date, start_time, end_time, location)
       VALUES ${values.join(", ")}`,
        params,
      );

      const firstId = result.insertId;
      const createdCount = values.length;
      const lastIdExclusive = firstId + createdCount;

      const [rows] = await connection.query(
        `SELECT ps.id, ps.group_id, ps.practice_date, ps.start_time, ps.end_time, ps.location,
              pg.group_name, pg.level
       FROM practice_schedule ps
       JOIN practice_groups pg ON ps.group_id = pg.id
       WHERE ps.id >= ? AND ps.id < ?
       ORDER BY ps.practice_date ASC, ps.start_time ASC`,
        [firstId, lastIdExclusive],
      );

      await connection.commit();

      return res.status(201).json({
        created_count: rows.length,
        sessions: rows,
      });
    } catch (error) {
      await connection.rollback();
      return res
        .status(500)
        .json({ message: "Failed to create session", error: error.message });
    } finally {
      connection.release();
    }
  },
);

app.put(
  "/api/schedule/:id",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const id = Number(req.params.id);
    const { group_id, practice_date, start_time, end_time, location } =
      req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    if (!group_id || !practice_date || !start_time || !end_time) {
      return res.status(400).json({
        message:
          "group_id, practice_date, start_time, and end_time are required",
      });
    }

    try {
      const [result] = await pool.query(
        `UPDATE practice_schedule
       SET group_id = ?, practice_date = ?, start_time = ?, end_time = ?, location = ?
       WHERE id = ?`,
        [group_id, practice_date, start_time, end_time, location || null, id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Session not found" });
      }

      const [rows] = await pool.query(
        `SELECT ps.id, ps.group_id, ps.practice_date, ps.start_time, ps.end_time, ps.location,
              pg.group_name, pg.level
       FROM practice_schedule ps
       JOIN practice_groups pg ON ps.group_id = pg.id
       WHERE ps.id = ?
       LIMIT 1`,
        [id],
      );

      return res.json(rows[0]);
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Failed to update session", error: error.message });
    }
  },
);

app.get("/api/attendance/summary", authenticate, async (req, res) => {
  try {
    const swimmerIds = await getAccessibleSwimmerIdsForUser(req.user);

    let rows;
    if (Array.isArray(swimmerIds)) {
      if (swimmerIds.length === 0) {
        return res.json([]);
      }

      const [result] = await pool.query(
        `SELECT s.id AS swimmer_id,
                u.name AS swimmer_name,
                SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present_count,
                SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late_count,
                SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
                SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) AS excused_count,
                SUM(CASE WHEN a.status IN ('present', 'late', 'absent', 'excused') THEN 1 ELSE 0 END) AS marked_count,
                ROUND(
                  100 * SUM(CASE WHEN a.status IN ('present', 'late') THEN 1 ELSE 0 END) /
                  NULLIF(SUM(CASE WHEN a.status IN ('present', 'late', 'absent', 'excused') THEN 1 ELSE 0 END), 0),
                  1
                ) AS attendance_rate
         FROM swimmers s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN attendance a ON a.swimmer_id = s.id
         WHERE s.id IN (${swimmerIds.map(() => "?").join(",")})
         GROUP BY s.id, u.name
         ORDER BY u.name ASC`,
        swimmerIds,
      );
      rows = result;
    } else {
      const [result] = await pool.query(
        `SELECT s.id AS swimmer_id,
                u.name AS swimmer_name,
                SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present_count,
                SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late_count,
                SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
                SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) AS excused_count,
                SUM(CASE WHEN a.status IN ('present', 'late', 'absent', 'excused') THEN 1 ELSE 0 END) AS marked_count,
                ROUND(
                  100 * SUM(CASE WHEN a.status IN ('present', 'late') THEN 1 ELSE 0 END) /
                  NULLIF(SUM(CASE WHEN a.status IN ('present', 'late', 'absent', 'excused') THEN 1 ELSE 0 END), 0),
                  1
                ) AS attendance_rate
         FROM swimmers s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN attendance a ON a.swimmer_id = s.id
         GROUP BY s.id, u.name
         ORDER BY u.name ASC`,
      );
      rows = result;
    }

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch attendance summary",
      error: error.message,
    });
  }
});

app.get(
  "/api/schedule/:id/attendance",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const scheduleId = Number(req.params.id);
    if (Number.isNaN(scheduleId)) {
      return res.status(400).json({ message: "Invalid schedule id" });
    }

    try {
      const [scheduleRows] = await pool.query(
        "SELECT id, group_id FROM practice_schedule WHERE id = ? LIMIT 1",
        [scheduleId],
      );

      if (scheduleRows.length === 0) {
        return res.status(404).json({ message: "Session not found" });
      }

      const groupId = scheduleRows[0].group_id;
      const [groupRows] = await pool.query(
        `SELECT s.id AS swimmer_id,
                u.name,
                u.email,
                COALESCE(a.status, 'unmarked') AS status,
                a.note
         FROM swimmer_groups sg
         JOIN swimmers s ON s.id = sg.swimmer_id
         JOIN users u ON u.id = s.user_id
         LEFT JOIN attendance a ON a.schedule_id = ? AND a.swimmer_id = s.id
         WHERE sg.group_id = ?
         ORDER BY u.name ASC`,
        [scheduleId, groupId],
      );

      if (groupRows.length > 0) {
        return res.json({
          schedule_id: scheduleId,
          group_id: groupId,
          swimmers: groupRows,
          source: "group",
        });
      }

      const [fallbackRows] = await pool.query(
        `SELECT s.id AS swimmer_id,
                u.name,
                u.email,
                COALESCE(a.status, 'unmarked') AS status,
                a.note
         FROM swimmers s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN attendance a ON a.schedule_id = ? AND a.swimmer_id = s.id
         ORDER BY u.name ASC`,
        [scheduleId],
      );

      return res.json({
        schedule_id: scheduleId,
        group_id: groupId,
        swimmers: fallbackRows,
        source: "all-swimmers-fallback",
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to fetch attendance roster",
        error: error.message,
      });
    }
  },
);

app.put(
  "/api/schedule/:id/attendance",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const scheduleId = Number(req.params.id);
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

    if (Number.isNaN(scheduleId)) {
      return res.status(400).json({ message: "Invalid schedule id" });
    }

    if (!entries.length) {
      return res.status(400).json({ message: "entries are required" });
    }

    const validStatuses = new Set([
      "present",
      "absent",
      "late",
      "excused",
      "unmarked",
    ]);

    const connection = await pool.getConnection();
    try {
      const [scheduleRows] = await connection.query(
        "SELECT id, group_id FROM practice_schedule WHERE id = ? LIMIT 1",
        [scheduleId],
      );

      if (scheduleRows.length === 0) {
        return res.status(404).json({ message: "Session not found" });
      }

      const groupId = scheduleRows[0].group_id;
      const [allowedRows] = await connection.query(
        "SELECT swimmer_id FROM swimmer_groups WHERE group_id = ?",
        [groupId],
      );
      const allowedSwimmerIds = new Set(
        allowedRows.map((row) => Number(row.swimmer_id)),
      );
      const useFallbackRoster = allowedSwimmerIds.size === 0;

      let validFallbackSwimmerIds = new Set();
      if (useFallbackRoster) {
        const [allSwimmerRows] = await connection.query("SELECT id FROM swimmers");
        validFallbackSwimmerIds = new Set(
          allSwimmerRows.map((row) => Number(row.id)),
        );
      }

      await connection.beginTransaction();

      for (const entry of entries) {
        const swimmerId = Number(entry && entry.swimmer_id);
        const status = String(entry && entry.status ? entry.status : "").trim();
        const note = entry && typeof entry.note === "string" ? entry.note.trim() : null;

        const swimmerAllowed = useFallbackRoster
          ? validFallbackSwimmerIds.has(swimmerId)
          : allowedSwimmerIds.has(swimmerId);

        if (!Number.isInteger(swimmerId) || !swimmerAllowed) {
          await connection.rollback();
          return res.status(400).json({
            message: `Invalid swimmer for session group: ${entry && entry.swimmer_id}`,
          });
        }

        if (!validStatuses.has(status)) {
          await connection.rollback();
          return res.status(400).json({
            message: `Invalid attendance status: ${status}`,
          });
        }

        if (status === "unmarked") {
          await connection.query(
            "DELETE FROM attendance WHERE schedule_id = ? AND swimmer_id = ?",
            [scheduleId, swimmerId],
          );
          continue;
        }

        await connection.query(
          `INSERT INTO attendance (swimmer_id, schedule_id, status, note)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             status = VALUES(status),
             note = VALUES(note)`,
          [swimmerId, scheduleId, status, note || null],
        );
      }

      await connection.commit();
      return res.json({ message: "Attendance saved" });
    } catch (error) {
      await connection.rollback();
      return res.status(500).json({
        message: "Failed to save attendance",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  },
);

app.delete(
  "/api/schedule",
  authenticate,
  requireRole("admin", "coach"),
  async (_req, res) => {
    try {
      const [result] = await pool.query("DELETE FROM practice_schedule");
      return res.json({ deleted_count: result.affectedRows || 0 });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Failed to delete sessions", error: error.message });
    }
  },
);

app.delete(
  "/api/schedule/:id",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    try {
      const [result] = await pool.query(
        "DELETE FROM practice_schedule WHERE id = ?",
        [id],
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Session not found" });
      }
      return res.status(204).send();
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Failed to delete session", error: error.message });
    }
  },
);

app.put(
  "/api/swimmers/:id/group",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const swimmerId = Number(req.params.id);
    const groupId = Number(req.body.group_id);

    if (Number.isNaN(swimmerId) || Number.isNaN(groupId)) {
      return res
        .status(400)
        .json({ message: "Valid swimmer id and group_id are required" });
    }

    try {
      const [swimmerRows] = await pool.query(
        "SELECT id FROM swimmers WHERE id = ? LIMIT 1",
        [swimmerId],
      );
      if (swimmerRows.length === 0) {
        return res.status(404).json({ message: "Swimmer not found" });
      }

      const [groupRows] = await pool.query(
        "SELECT id FROM practice_groups WHERE id = ? LIMIT 1",
        [groupId],
      );
      if (groupRows.length === 0) {
        return res.status(404).json({ message: "Practice group not found" });
      }

      await pool.query(
        `INSERT INTO swimmer_groups (swimmer_id, group_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE group_id = VALUES(group_id), assigned_at = CURRENT_TIMESTAMP`,
        [swimmerId, groupId],
      );

      const [rows] = await pool.query(
        `SELECT s.id AS swimmer_id, u.name, u.email, pg.id AS group_id, pg.group_name, pg.level
       FROM swimmers s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN swimmer_groups sg ON sg.swimmer_id = s.id
       LEFT JOIN practice_groups pg ON pg.id = sg.group_id
       WHERE s.id = ?
       LIMIT 1`,
        [swimmerId],
      );

      return res.json(rows[0]);
    } catch (error) {
      return res.status(500).json({
        message: "Failed to update swimmer group",
        error: error.message,
      });
    }
  },
);

/* ── team roster ── */
app.get("/api/team", authenticate, async (req, res) => {
  try {
    if (req.user.role === "swimmer") {
      const [groupPeers] = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, s.id AS swimmer_id, s.date_of_birth, s.gender, s.skill_level,
                pg.id AS group_id, pg.group_name, pg.level
         FROM swimmers me
         JOIN swimmer_groups my_group ON my_group.swimmer_id = me.id
         JOIN swimmer_groups sg ON sg.group_id = my_group.group_id
         JOIN swimmers s ON s.id = sg.swimmer_id
         JOIN users u ON s.user_id = u.id
         JOIN practice_groups pg ON pg.id = sg.group_id
         WHERE me.user_id = ?
         ORDER BY u.name ASC`,
        [req.user.sub],
      );

      let swimmers = groupPeers;
      if (groupPeers.length === 0) {
        const [selfOnly] = await pool.query(
          `SELECT u.id, u.name, u.email, s.id AS swimmer_id, s.date_of_birth, s.gender, s.skill_level,
                  NULL AS group_id, NULL AS group_name, NULL AS level
           FROM swimmers s
           JOIN users u ON s.user_id = u.id
           WHERE u.id = ?
           LIMIT 1`,
          [req.user.sub],
        );
        swimmers = selfOnly;
      }

      const [coaches] = await pool.query(
        `SELECT u.id, u.name, u.email, c.certification, c.years_experience
         FROM coaches c
         JOIN users u ON c.user_id = u.id
         ORDER BY u.name ASC`,
      );

      const [parents] = await pool.query(
        `SELECT u.id, u.name, u.email, p.phone, p.emergency_contact
         FROM parents p
         JOIN users u ON p.user_id = u.id
         ORDER BY u.name ASC`,
      );

      return res.json({ coaches, swimmers, parents });
    }

    if (req.user.role === "parent") {
      const [parentRows] = await pool.query(
        "SELECT id FROM parents WHERE user_id = ? LIMIT 1",
        [req.user.sub],
      );

      if (parentRows.length === 0) {
        return res.json({ coaches: [], swimmers: [], parents: [] });
      }

      const parentId = parentRows[0].id;

      const [coaches] = await pool.query(
        `SELECT u.id, u.name, u.email, c.certification, c.years_experience
         FROM coaches c
         JOIN users u ON c.user_id = u.id
         ORDER BY u.name ASC`,
      );

      const [swimmers] = await pool.query(
        `SELECT u.id, u.name, u.email, s.date_of_birth, s.gender, s.skill_level,
                ps.relationship, ps.is_primary
         FROM parent_swimmers ps
         JOIN swimmers s ON ps.swimmer_id = s.id
         JOIN users u ON s.user_id = u.id
         WHERE ps.parent_id = ?
         ORDER BY u.name ASC`,
        [parentId],
      );

      const [parents] = await pool.query(
        `SELECT u.id, u.name, u.email, p.phone, p.emergency_contact
         FROM parents p
         JOIN users u ON p.user_id = u.id
         WHERE p.id = ?`,
        [parentId],
      );

      return res.json({ coaches, swimmers, parents });
    }

    const [coaches] = await pool.query(
      `SELECT u.id, u.name, u.email, c.certification, c.years_experience
       FROM coaches c
       JOIN users u ON c.user_id = u.id
       ORDER BY u.name ASC`,
    );
    const [swimmers] = await pool.query(
      `SELECT u.id, u.name, u.email, s.id AS swimmer_id, s.date_of_birth, s.gender, s.skill_level,
            pg.id AS group_id, pg.group_name, pg.level
       FROM swimmers s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN swimmer_groups sg ON sg.swimmer_id = s.id
       LEFT JOIN practice_groups pg ON pg.id = sg.group_id
       ORDER BY u.name ASC`,
    );
    const [parents] = await pool.query(
      `SELECT u.id, u.name, u.email, p.phone, p.emergency_contact
       FROM parents p
       JOIN users u ON p.user_id = u.id
       ORDER BY u.name ASC`,
    );
    return res.json({ coaches, swimmers, parents });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch team", error: error.message });
  }
});

app.get(
  "/api/my-swimmers",
  authenticate,
  requireRole("parent"),
  async (req, res) => {
    try {
      const [parentRows] = await pool.query(
        "SELECT id FROM parents WHERE user_id = ? LIMIT 1",
        [req.user.sub],
      );

      if (parentRows.length === 0) {
        return res.json([]);
      }

      const [rows] = await pool.query(
        `SELECT s.id AS swimmer_id,
              u.id AS user_id,
              u.name,
              u.email,
              s.date_of_birth,
              s.gender,
              s.skill_level,
              ps.relationship,
              ps.is_primary
       FROM parent_swimmers ps
       JOIN swimmers s ON ps.swimmer_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE ps.parent_id = ?
       ORDER BY u.name ASC`,
        [parentRows[0].id],
      );

      return res.json(rows);
    } catch (error) {
      return res.status(500).json({
        message: "Failed to fetch linked swimmers",
        error: error.message,
      });
    }
  },
);

app.get(
  "/api/swimmers/options",
  authenticate,
  requireRole("admin", "coach"),
  async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT s.id AS swimmer_id,
                u.name,
                u.email,
                pg.group_name
         FROM swimmers s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN swimmer_groups sg ON sg.swimmer_id = s.id
         LEFT JOIN practice_groups pg ON pg.id = sg.group_id
         ORDER BY u.name ASC`,
      );

      return res.json(rows);
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load swimmer options",
        error: error.message,
      });
    }
  },
);

app.post(
  "/api/meets/import",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    let payload;
    try {
      payload = await extractImportPayload(req);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    let content;
    try {
      content = await getImportedTextFromPayload(
        payload && payload.content ? payload.content : payload,
      );
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    let parsedMeet;
    try {
      parsedMeet = parseMeetFileContent(content);
    } catch (error) {
      return res
        .status(400)
        .json({ message: `Invalid meet file: ${error.message}` });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const coachId = await getCoachIdForUser(req.user.sub);

      const [meetResult] = await connection.query(
        `INSERT INTO meets (meet_name, meet_date, location, host_team, created_by_coach_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          parsedMeet.meet_name,
          parsedMeet.meet_date,
          parsedMeet.location,
          parsedMeet.host_team,
          coachId,
        ],
      );

      const meetId = meetResult.insertId;

      if (parsedMeet.days.length) {
        const dayValues = parsedMeet.days.map(() => "(?, ?)").join(", ");
        const dayParams = parsedMeet.days.flatMap((day) => [meetId, day]);

        await connection.query(
          `INSERT INTO meet_days (meet_id, meet_day) VALUES ${dayValues}`,
          dayParams,
        );
      }

      if (parsedMeet.events.length) {
        const eventValues = parsedMeet.events
          .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .join(", ");

        const eventParams = parsedMeet.events.flatMap((event) => [
          meetId,
          event.event_name,
          event.stroke,
          event.distance_meters,
          event.age_group,
          event.gender,
          event.is_selected ? 1 : 0,
          event.qualifying_time_seconds,
          event.qualifying_time_text,
        ]);

        await connection.query(
          `INSERT INTO meet_events
             (meet_id, event_name, stroke, distance_meters, age_group, gender, is_selected, qualifying_time_seconds, qualifying_time_text)
           VALUES ${eventValues}`,
          eventParams,
        );
      }

      await connection.commit();

      return res.status(201).json({
        message: "Meet imported",
        meet: {
          id: meetId,
          meet_name: parsedMeet.meet_name,
          meet_date: parsedMeet.meet_date,
          days: parsedMeet.days,
          event_count: parsedMeet.events.length,
        },
      });
    } catch (error) {
      await connection.rollback();
      return res
        .status(500)
        .json({ message: "Failed to import meet", error: error.message });
    } finally {
      connection.release();
    }
  },
);

app.post(
  "/api/meets",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const meetName = String(req.body && req.body.meet_name ? req.body.meet_name : "").trim();
    const meetDate = normalizeDateOnly(req.body && req.body.meet_date);
    const location = String(req.body && req.body.location ? req.body.location : "").trim();
    const hostTeam = String(req.body && req.body.host_team ? req.body.host_team : "").trim();

    if (!meetName || !meetDate) {
      return res.status(400).json({ message: "meet_name and meet_date are required" });
    }

    try {
      const coachId = await getCoachIdForUser(req.user.sub);
      const [result] = await pool.query(
        `INSERT INTO meets (meet_name, meet_date, location, host_team, created_by_coach_id)
         VALUES (?, ?, ?, ?, ?)`,
        [meetName, meetDate, location || null, hostTeam || null, coachId],
      );

      const meetId = result.insertId;
      await pool.query(
        "INSERT INTO meet_days (meet_id, meet_day) VALUES (?, ?) ON DUPLICATE KEY UPDATE meet_day = VALUES(meet_day)",
        [meetId, meetDate],
      );

      const [rows] = await pool.query(
        `SELECT id, meet_name, meet_date, location, host_team, created_at
         FROM meets
         WHERE id = ?
         LIMIT 1`,
        [meetId],
      );

      return res.status(201).json({
        message: "Meet created",
        meet: rows[0],
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to create meet",
        error: error.message,
      });
    }
  },
);

app.get("/api/meets", authenticate, async (req, res) => {
  try {
    const [meetRows] = await pool.query(
      `SELECT m.id, m.meet_name, m.meet_date, m.location, m.host_team,
              COUNT(DISTINCT md.id) AS day_count,
              COUNT(DISTINCT me.id) AS event_count,
              SUM(CASE WHEN me.is_selected = 1 THEN 1 ELSE 0 END) AS selected_event_count
       FROM meets m
       LEFT JOIN meet_days md ON md.meet_id = m.id
       LEFT JOIN meet_events me ON me.meet_id = m.id
       GROUP BY m.id, m.meet_name, m.meet_date, m.location, m.host_team
       ORDER BY m.meet_date DESC, m.id DESC`,
    );

    if (req.user.role === "admin" || req.user.role === "coach") {
      return res.json(meetRows);
    }

    const swimmerIds = await getAccessibleSwimmerIdsForUser(req.user);
    if (!Array.isArray(swimmerIds) || swimmerIds.length === 0) {
      return res.json([]);
    }

    const visibleMeets = [];
    for (const meet of meetRows) {
      const eligibility = await getMeetEligibilityForSwimmers(meet.id, swimmerIds);
      if (eligibility.visibleSwimmerIds.length > 0) {
        visibleMeets.push({
          ...meet,
          qualified_swimmer_count: eligibility.visibleSwimmerIds.length,
        });
      }
    }

    return res.json(visibleMeets);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch meets", error: error.message });
  }
});

app.get("/api/meets/:id", authenticate, async (req, res) => {
  const meetId = Number(req.params.id);
  if (Number.isNaN(meetId)) {
    return res.status(400).json({ message: "Invalid meet id" });
  }

  try {
    const [meetRows] = await pool.query(
      `SELECT id, meet_name, meet_date, location, host_team, created_at
       FROM meets
       WHERE id = ?
       LIMIT 1`,
      [meetId],
    );

    if (!meetRows.length) {
      return res.status(404).json({ message: "Meet not found" });
    }

    const [days] = await pool.query(
      "SELECT meet_day FROM meet_days WHERE meet_id = ? ORDER BY meet_day ASC",
      [meetId],
    );
    const [events] = await pool.query(
      `SELECT id, event_name, stroke, distance_meters, age_group, gender,
              is_selected, qualifying_time_seconds, qualifying_time_text
       FROM meet_events
       WHERE meet_id = ?
       ORDER BY id ASC`,
      [meetId],
    );

    let swimmerIds = [];
    if (req.user.role === "admin" || req.user.role === "coach") {
      const [swimmerRows] = await pool.query("SELECT id FROM swimmers ORDER BY id ASC");
      swimmerIds = swimmerRows.map((row) => Number(row.id));
    } else {
      swimmerIds = await getAccessibleSwimmerIdsForUser(req.user);
    }

    const eligibility = await getMeetEligibilityForSwimmers(meetId, swimmerIds);

    if (
      (req.user.role === "swimmer" || req.user.role === "parent") &&
      eligibility.visibleSwimmerIds.length === 0
    ) {
      return res.status(404).json({ message: "Meet not found" });
    }

    const visibleSwimmerIds =
      req.user.role === "admin" || req.user.role === "coach"
        ? swimmerIds
        : eligibility.visibleSwimmerIds;

    const swimmerRows = await getSwimmerRowsByIds(visibleSwimmerIds);

    let declarations = [];
    if (visibleSwimmerIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT md.meet_day, d.swimmer_id, d.status, d.note, u.name AS swimmer_name
         FROM meet_declarations d
         JOIN meet_days md ON md.meet_id = d.meet_id AND md.meet_day = d.meet_day
         JOIN swimmers s ON s.id = d.swimmer_id
         JOIN users u ON u.id = s.user_id
         WHERE d.meet_id = ?
           AND d.swimmer_id IN (${visibleSwimmerIds.map(() => "?").join(",")})
         ORDER BY md.meet_day ASC, u.name ASC`,
        [meetId, ...visibleSwimmerIds],
      );
      declarations = rows;
    }

    return res.json({
      meet: meetRows[0],
      days,
      events,
      swimmers: swimmerRows,
      eligibility: Array.from(eligibility.eligibilityBySwimmerId.values()),
      declarations,
      can_select_events: req.user.role === "admin" || req.user.role === "coach",
      can_declare: req.user.role === "swimmer" || req.user.role === "parent",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch meet", error: error.message });
  }
});

app.put(
  "/api/meets/:id/events/selection",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const meetId = Number(req.params.id);
    const eventIdsInput = Array.isArray(req.body.event_ids) ? req.body.event_ids : [];
    const eventIds = [
      ...new Set(
        eventIdsInput
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    if (Number.isNaN(meetId)) {
      return res.status(400).json({ message: "Invalid meet id" });
    }

    const connection = await pool.getConnection();

    try {
      const [eventRows] = await connection.query(
        "SELECT id FROM meet_events WHERE meet_id = ?",
        [meetId],
      );
      const eventIdSet = new Set(eventRows.map((row) => Number(row.id)));

      if (!eventRows.length) {
        return res.status(404).json({ message: "No events found for meet" });
      }

      const invalid = eventIds.find((id) => !eventIdSet.has(id));
      if (invalid) {
        return res
          .status(400)
          .json({ message: `Event ${invalid} does not belong to this meet` });
      }

      await connection.beginTransaction();

      await connection.query("UPDATE meet_events SET is_selected = 0 WHERE meet_id = ?", [
        meetId,
      ]);

      if (eventIds.length) {
        await connection.query(
          `UPDATE meet_events
           SET is_selected = 1
           WHERE meet_id = ?
             AND id IN (${eventIds.map(() => "?").join(",")})`,
          [meetId, ...eventIds],
        );
      }

      await connection.commit();

      return res.json({
        message: "Selected events updated",
        selected_event_ids: eventIds,
      });
    } catch (error) {
      await connection.rollback();
      return res.status(500).json({
        message: "Failed to update selected events",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  },
);

app.put(
  "/api/meets/:id/declarations",
  authenticate,
  requireRole("swimmer", "parent"),
  async (req, res) => {
    const meetId = Number(req.params.id);
    const declarations = Array.isArray(req.body.declarations)
      ? req.body.declarations
      : [];

    if (Number.isNaN(meetId)) {
      return res.status(400).json({ message: "Invalid meet id" });
    }

    if (!declarations.length) {
      return res.status(400).json({ message: "declarations are required" });
    }

    try {
      const accessibleSwimmerIds = await getAccessibleSwimmerIdsForUser(req.user);
      if (!Array.isArray(accessibleSwimmerIds) || accessibleSwimmerIds.length === 0) {
        return res.status(403).json({ message: "No swimmers available for declarations" });
      }

      const eligibility = await getMeetEligibilityForSwimmers(
        meetId,
        accessibleSwimmerIds,
      );

      if (!eligibility.visibleSwimmerIds.length) {
        return res.status(403).json({ message: "No qualified swimmers for this meet" });
      }

      const [meetDayRows] = await pool.query(
        "SELECT meet_day FROM meet_days WHERE meet_id = ?",
        [meetId],
      );
      const meetDaySet = new Set(meetDayRows.map((row) => String(row.meet_day).slice(0, 10)));

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const validStatuses = new Set(["yes", "no", "maybe"]);

        for (const entry of declarations) {
          const requestedSwimmerId = Number(entry.swimmer_id);
          let swimmerId = requestedSwimmerId;

          if (req.user.role === "swimmer") {
            swimmerId = accessibleSwimmerIds[0];
          }

          if (
            !Number.isInteger(swimmerId) ||
            !eligibility.visibleSwimmerIds.includes(swimmerId)
          ) {
            await connection.rollback();
            return res.status(400).json({
              message: `Swimmer is not eligible for declarations: ${entry.swimmer_id}`,
            });
          }

          const meetDay = normalizeDateOnly(entry.meet_day);
          if (!meetDay || !meetDaySet.has(meetDay)) {
            await connection.rollback();
            return res.status(400).json({
              message: `Invalid meet day: ${entry.meet_day}`,
            });
          }

          const status = String(entry.status || "").trim().toLowerCase();
          if (!validStatuses.has(status)) {
            await connection.rollback();
            return res
              .status(400)
              .json({ message: `Invalid status: ${entry.status}` });
          }

          const note =
            typeof entry.note === "string" ? entry.note.trim() : null;

          await connection.query(
            `INSERT INTO meet_declarations
               (meet_id, swimmer_id, meet_day, status, note, declared_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               status = VALUES(status),
               note = VALUES(note),
               declared_by_user_id = VALUES(declared_by_user_id),
               updated_at = CURRENT_TIMESTAMP`,
            [meetId, swimmerId, meetDay, status, note || null, req.user.sub],
          );
        }

        await connection.commit();
        return res.json({ message: "Declarations saved" });
      } finally {
        connection.release();
      }
    } catch (error) {
      return res.status(500).json({
        message: "Failed to save declarations",
        error: error.message,
      });
    }
  },
);

app.get("/api/swimmer-times", authenticate, async (req, res) => {
  try {
    const accessibleSwimmerIds = await getAccessibleSwimmerIdsForUser(req.user);

    let rows;
    if (Array.isArray(accessibleSwimmerIds)) {
      if (!accessibleSwimmerIds.length) {
        return res.json([]);
      }

      const [result] = await pool.query(
        `SELECT sbt.id, sbt.swimmer_id, u.name AS swimmer_name,
                sbt.stroke, sbt.distance_meters, sbt.course,
                sbt.best_time_seconds, sbt.best_time_text, sbt.achieved_on
         FROM swimmer_best_times sbt
         JOIN swimmers s ON s.id = sbt.swimmer_id
         JOIN users u ON u.id = s.user_id
         WHERE sbt.swimmer_id IN (${accessibleSwimmerIds.map(() => "?").join(",")})
         ORDER BY u.name ASC, sbt.distance_meters ASC, sbt.stroke ASC`,
        accessibleSwimmerIds,
      );
      rows = result;
    } else {
      const [result] = await pool.query(
        `SELECT sbt.id, sbt.swimmer_id, u.name AS swimmer_name,
                sbt.stroke, sbt.distance_meters, sbt.course,
                sbt.best_time_seconds, sbt.best_time_text, sbt.achieved_on
         FROM swimmer_best_times sbt
         JOIN swimmers s ON s.id = sbt.swimmer_id
         JOIN users u ON u.id = s.user_id
         ORDER BY u.name ASC, sbt.distance_meters ASC, sbt.stroke ASC`,
      );
      rows = result;
    }

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch swimmer times",
      error: error.message,
    });
  }
});

app.post(
  "/api/swimmer-times",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const swimmerId = Number(req.body.swimmer_id);
    const stroke = normalizeStroke(req.body.stroke);
    const distanceMeters = Number(req.body.distance_meters);
    const course = req.body.course ? String(req.body.course).trim() : null;
    const bestTimeSeconds = parseTimeToSeconds(req.body.best_time);
    const achievedOn = normalizeDateOnly(req.body.achieved_on);

    if (!Number.isInteger(swimmerId) || swimmerId <= 0) {
      return res.status(400).json({ message: "Valid swimmer_id is required" });
    }
    if (!stroke) {
      return res.status(400).json({ message: "stroke is required" });
    }
    if (!Number.isInteger(distanceMeters) || distanceMeters <= 0) {
      return res.status(400).json({ message: "Valid distance_meters is required" });
    }
    if (bestTimeSeconds == null) {
      return res.status(400).json({
        message: "best_time is required (seconds or mm:ss.xx)",
      });
    }

    try {
      const [swimmerRows] = await pool.query(
        "SELECT id FROM swimmers WHERE id = ? LIMIT 1",
        [swimmerId],
      );
      if (!swimmerRows.length) {
        return res.status(404).json({ message: "Swimmer not found" });
      }

      await pool.query(
        `INSERT INTO swimmer_best_times
           (swimmer_id, stroke, distance_meters, course, best_time_seconds, best_time_text, achieved_on)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           best_time_seconds = LEAST(best_time_seconds, VALUES(best_time_seconds)),
           best_time_text = IF(VALUES(best_time_seconds) <= best_time_seconds, VALUES(best_time_text), best_time_text),
           achieved_on = IF(VALUES(best_time_seconds) <= best_time_seconds, VALUES(achieved_on), achieved_on),
           updated_at = CURRENT_TIMESTAMP`,
        [
          swimmerId,
          stroke,
          distanceMeters,
          course,
          bestTimeSeconds,
          formatSeconds(bestTimeSeconds),
          achievedOn,
        ],
      );

      return res.status(201).json({ message: "Swimmer best time saved" });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to save swimmer time",
        error: error.message,
      });
    }
  },
);

app.post(
  "/api/swimmer-times/import",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    let payload;
    try {
      payload = await extractImportPayload(req);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    let content;
    try {
      content = await getImportedTextFromPayload(
        payload && payload.content ? payload.content : payload,
      );
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    let rows;
    try {
      const text = content.trim();
      if (text.startsWith("[") || text.startsWith("{")) {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.rows) ? parsed.rows : [];
      } else {
        rows = parseCsvToObjects(text);
      }
    } catch (error) {
      return res.status(400).json({ message: `Invalid file: ${error.message}` });
    }

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ message: "No time rows found" });
    }

    const importFileName = String(payload && payload.file_name ? payload.file_name : req.headers["x-file-name"] || "");
    const requestedDefaultSwimmerId = Number(
      payload && payload.default_swimmer_id ? payload.default_swimmer_id : req.headers["x-default-swimmer-id"] || 0,
    );
    const connection = await pool.getConnection();
    let imported = 0;
    const skipped = [];

    try {
      await connection.beginTransaction();

      let explicitDefaultSwimmerId = null;
      if (
        Number.isInteger(requestedDefaultSwimmerId) &&
        requestedDefaultSwimmerId > 0
      ) {
        const [defaultSwimmerRows] = await connection.query(
          "SELECT id FROM swimmers WHERE id = ? LIMIT 1",
          [requestedDefaultSwimmerId],
        );
        if (!defaultSwimmerRows.length) {
          await connection.rollback();
          return res.status(400).json({
            message: `default_swimmer_id does not exist: ${requestedDefaultSwimmerId}`,
          });
        }
        explicitDefaultSwimmerId = requestedDefaultSwimmerId;
      }

      const defaultSwimmerFromFilename = await findSwimmerIdByName(
        connection,
        importFileName,
      );

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const swimmerIdRaw = firstNonEmpty(row, ["swimmer_id"], "");
        const swimmerEmail = firstNonEmpty(row, ["swimmer_email", "email"], "");
        const swimmerName = firstNonEmpty(row, ["swimmer_name", "swimmer", "name", "athlete"], "");
        let swimmerId = swimmerIdRaw ? Number(swimmerIdRaw) : null;

        if (!swimmerId && swimmerEmail) {
          const [swimmerRows] = await connection.query(
            `SELECT s.id
             FROM swimmers s
             JOIN users u ON u.id = s.user_id
             WHERE u.email = ?
             LIMIT 1`,
            [swimmerEmail.toLowerCase()],
          );
          swimmerId = swimmerRows.length ? Number(swimmerRows[0].id) : null;
        }

        if (!swimmerId && swimmerName) {
          swimmerId = await findSwimmerIdByName(connection, swimmerName);
        }

        if (!swimmerId && explicitDefaultSwimmerId) {
          swimmerId = explicitDefaultSwimmerId;
        }

        if (!swimmerId && defaultSwimmerFromFilename) {
          swimmerId = defaultSwimmerFromFilename;
        }

        const parsedEventCode = parseEventCode(
          firstNonEmpty(row, ["event code", "event_code", "event"], ""),
        );

        const stroke = normalizeStroke(
          firstNonEmpty(row, ["stroke"], parsedEventCode.stroke || ""),
        );
        const distanceMeters = Number(
          firstNonEmpty(
            row,
            ["distance_meters", "distance", "meters"],
            parsedEventCode.distance_meters != null
              ? String(parsedEventCode.distance_meters)
              : "0",
          ),
        );
        const bestTimeSeconds = parseTimeToSeconds(
          firstNonEmpty(
            row,
            [
              "best_time",
              "time",
              "result_time",
              "swim time formatted",
              "swim time adj formatted",
            ],
            "",
          ),
        );

        if (!swimmerId || !stroke || !distanceMeters || bestTimeSeconds == null) {
          skipped.push({ row: i + 1, reason: "Missing swimmer/stroke/distance/time" });
          continue;
        }

        const course =
          firstNonEmpty(row, ["course"], parsedEventCode.course || "") || null;
        const achievedOn =
          normalizeDateOnly(
            firstNonEmpty(row, ["achieved_on", "date", "textbox22"], ""),
          ) || null;

        await connection.query(
          `INSERT INTO swimmer_best_times
             (swimmer_id, stroke, distance_meters, course, best_time_seconds, best_time_text, achieved_on)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             best_time_seconds = LEAST(best_time_seconds, VALUES(best_time_seconds)),
             best_time_text = IF(VALUES(best_time_seconds) <= best_time_seconds, VALUES(best_time_text), best_time_text),
             achieved_on = IF(VALUES(best_time_seconds) <= best_time_seconds, VALUES(achieved_on), achieved_on),
             updated_at = CURRENT_TIMESTAMP`,
          [
            swimmerId,
            stroke,
            distanceMeters,
            course,
            bestTimeSeconds,
            formatSeconds(bestTimeSeconds),
            achievedOn,
          ],
        );
        imported += 1;
      }

      await connection.commit();

      return res.status(201).json({
        message: "Times import complete",
        imported,
        skipped,
      });
    } catch (error) {
      await connection.rollback();
      return res.status(500).json({
        message: "Failed to import swimmer times",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  },
);

/* ── catch-all: unknown routes return JSON instead of Express HTML 404 ── */
app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    hint: "Make sure you are accessing the app through the Node server (npm start), not by opening the HTML file directly.",
  });
});

/* ── global error handler ── */
app.use((err, req, res, _next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      message:
        "Uploaded file is too large. Try a smaller PDF or a CSV export for meet import.",
    });
  }

  console.error("Unhandled error:", err);
  res
    .status(500)
    .json({ message: "Internal server error", error: err.message });
});

async function start() {
  console.log("[hello-db] Starting…");
  console.log(`[hello-db] DB host : ${dbConfig.host}:${dbConfig.port}`);
  console.log(`[hello-db] DB name : ${dbConfig.database}`);
  console.log(`[hello-db] DB user : ${dbConfig.user}`);

  if (!process.env.MYSQL_PASSWORD) {
    console.warn(
      "[hello-db] WARNING: MYSQL_PASSWORD is not set. Copy .env.example to .env and fill in your password.",
    );
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
