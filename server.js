require("dotenv").config();

const bcrypt = require("bcryptjs");
const express = require("express");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const { initDatabase } = require("./db");

const uploadsDir = path.join(__dirname, "uploads", "meets");
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (error) {
  console.warn("Warning: Could not create uploads directory:", error.message);
}

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || "swimsync-dev-secret";

const dbConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "password",
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
  const raw = String(gender || "")
    .trim()
    .toLowerCase();
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

function calculateAgeOnDate(dateOfBirth, onDate) {
  const dob = normalizeDateOnly(dateOfBirth);
  const ref = normalizeDateOnly(onDate);
  if (!dob || !ref) return null;

  const dobDate = new Date(`${dob}T00:00:00`);
  const refDate = new Date(`${ref}T00:00:00`);
  if (Number.isNaN(dobDate.getTime()) || Number.isNaN(refDate.getTime())) {
    return null;
  }

  let age = refDate.getFullYear() - dobDate.getFullYear();
  const monthDiff = refDate.getMonth() - dobDate.getMonth();
  const dayDiff = refDate.getDate() - dobDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return Number.isFinite(age) ? age : null;
}

function parseAgeGroupRange(ageGroupText) {
  const ranges = parseAgeGroupRanges(ageGroupText);
  return ranges.length ? ranges[0] : null;
}

function parseAgeGroupRanges(ageGroupText) {
  const raw = String(ageGroupText || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!raw || raw === "open" || raw === "mixed") {
    return [];
  }

  const ranges = [];
  const seen = new Set();
  const addRange = (minValue, maxValue) => {
    const min = Number(minValue);
    const max = Number(maxValue);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return;
    }

    const normalized = {
      min: Math.min(min, max),
      max: Math.max(min, max),
    };
    const key = `${normalized.min}-${normalized.max}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    ranges.push(normalized);
  };

  const rangeRegex = /(\d{1,2})\s*(?:-|to|\/)\s*(\d{1,2})/gi;
  let match;
  while ((match = rangeRegex.exec(raw)) !== null) {
    addRange(match[1], match[2]);
  }

  const underRegex = /(\d{1,2})\s*(?:&|and)?\s*(?:under|u)\b/gi;
  while ((match = underRegex.exec(raw)) !== null) {
    addRange(0, match[1]);
  }

  const overRegex = /(\d{1,2})\s*(?:&|and)?\s*over\b/gi;
  while ((match = overRegex.exec(raw)) !== null) {
    addRange(match[1], 120);
  }

  if (raw.includes("senior")) {
    addRange(15, 120);
  }
  if (raw.includes("junior")) {
    addRange(0, 14);
  }

  return ranges;
}

function ageMatches(eventAgeGroup, swimmerDob, referenceDate) {
  const ranges = parseAgeGroupRanges(eventAgeGroup);
  if (!ranges.length) return true;

  const age = calculateAgeOnDate(swimmerDob, referenceDate);
  if (age == null) return true;

  return ranges.some((range) => age >= range.min && age <= range.max);
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

  const rows = parseCsvToObjects(candidateLines.join("\n"));
  if (!rows.length) return [];
  const knownFields = [
    "event_name",
    "event",
    "name",
    "stroke",
    "distance",
    "distance_meters",
    "age_group",
    "gender",
    "meet_day",
    "day",
    "session",
    "qualifying_time",
    "time_standard",
    "cut_time",
    "is_selected",
    "selected",
  ];
  const headers = Object.keys(rows[0]).map((h) => h.toLowerCase().trim());
  if (!headers.some((h) => knownFields.includes(h))) return [];
  return rows;
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
        fileSize: 500 * 1024 * 1024,
        fieldSize: 100 * 1024 * 1024,
        fields: 100,
        files: 10,
        parts: 1000,
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
          new Error(
            "Uploaded file is too large. Try a smaller PDF or CSV export.",
          ),
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

  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) {
      throw new Error("content is required");
    }
    return text;
  }

  const rawContent = payload && payload.content ? String(payload.content) : "";
  const rawType = payload && payload.file_type ? String(payload.file_type) : "";
  const rawName = payload && payload.file_name ? String(payload.file_name) : "";
  const rawEncoding =
    payload && payload.encoding ? String(payload.encoding) : "utf8";

  const lowerType = rawType.trim().toLowerCase();
  const lowerName = rawName.trim().toLowerCase();
  const isExplicitlyText =
    lowerType === "text/plain" || lowerType === "text" || !lowerType;
  const isPdf =
    lowerType === "pdf" ||
    lowerType === "application/pdf" ||
    (lowerName.endsWith(".pdf") && !isExplicitlyText);

  if (!rawContent.trim()) {
    throw new Error("content is required");
  }

  if (!isPdf) {
    return rawContent;
  }

  if (rawEncoding === "base64") {
    return extractTextFromPdfBase64(rawContent);
  }

  throw new Error(
    "PDF uploads must be sent as a raw PDF file or base64 content",
  );
}

async function extractImportPayload(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const multipart = await parseMultipartUpload(req);
    const fileBuffer = multipart.file;
    const fileName =
      multipart.fileName ||
      multipart.fields.file_name ||
      multipart.fields.filename ||
      "";
    const defaultSwimmerId = multipart.fields.default_swimmer_id
      ? Number(multipart.fields.default_swimmer_id)
      : 0;

    if (fileBuffer && fileBuffer.length) {
      if (
        fileName.toLowerCase().endsWith(".pdf") ||
        multipart.fileMimeType === "application/pdf"
      ) {
        const content = await getImportedTextFromPayload(fileBuffer);
        return {
          content,
          file_name: fileName,
          file_buffer: fileBuffer,
          is_pdf: true,
          default_swimmer_id: defaultSwimmerId,
        };
      }

      return {
        content: fileBuffer.toString("utf8"),
        file_name: fileName,
        file_buffer: fileBuffer,
        is_pdf: false,
        default_swimmer_id: defaultSwimmerId,
      };
    }

    return {
      content: multipart.fields.content || "",
      file_name: fileName,
      file_buffer: null,
      is_pdf: false,
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

function normalizeSessionLabel(value) {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return raw.slice(0, 40);
}

function normalizeMeetDayEntries(days, fallbackDate) {
  const items = Array.isArray(days) ? days : [];
  const normalized = [];
  const seen = new Set();

  const push = (entry) => {
    const key = `${entry.meet_day}|${entry.session_label || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(entry);
  };

  items.forEach((day) => {
    if (typeof day === "string") {
      const meetDay = normalizeDateOnly(day);
      if (!meetDay) return;
      push({
        meet_day: meetDay,
        session_label: "",
        age_group: null,
        gender: null,
      });
      return;
    }

    const meetDay = normalizeDateOnly(
      day && day.meet_day ? day.meet_day : day && day.day ? day.day : null,
    );
    if (!meetDay) return;

    push({
      meet_day: meetDay,
      session_label: normalizeSessionLabel(
        day && day.session_label
          ? day.session_label
          : day && day.session
            ? day.session
            : "",
      ),
      age_group: day && day.age_group ? String(day.age_group).trim() : null,
      gender: day && day.gender ? normalizeGender(day.gender) : null,
    });
  });

  if (!normalized.length) {
    push({
      meet_day:
        normalizeDateOnly(fallbackDate) ||
        normalizeDateOnly(new Date().toISOString().slice(0, 10)),
      session_label: "",
      age_group: null,
      gender: null,
    });
  }

  return normalized.sort((a, b) => {
    const dayCmp = String(a.meet_day).localeCompare(String(b.meet_day));
    if (dayCmp !== 0) return dayCmp;
    return String(a.session_label || "").localeCompare(
      String(b.session_label || ""),
    );
  });
}

function cleanImportedFileName(fileName) {
  return String(fileName || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\b(final|rev(?:ision)?\s*\d*|draft|copy)\b/gi, "")
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectReferenceYear(text, fileName = "") {
  const source = `${String(text || "")} ${String(fileName || "")}`;
  const match = source.match(/\b(20\d{2})\b/);
  if (!match) {
    return new Date().getFullYear();
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
}

function parseMonthDayCandidate(raw, referenceYear) {
  const monthMap = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  // Match date ranges like "May 1-3" or "May 1 to 3" or "May 1, 2026"
  const match = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:\s*(?:-|to|through)\s*(\d{1,2}))?(?:,?\s+(\d{4}))?\b/i,
  );
  if (!match) return null;

  const month = monthMap[String(match[1] || "").toLowerCase()];
  const startDay = Number(match[2]);
  const endDay = match[3] ? Number(match[3]) : null;
  const year = match[4] ? Number(match[4]) : Number(referenceYear);

  if (
    !month ||
    !Number.isFinite(startDay) ||
    startDay < 1 ||
    startDay > 31 ||
    !Number.isFinite(year)
  ) {
    return null;
  }

  const startDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;

  // If end date is specified, return range object; otherwise just start date
  if (endDay && Number.isFinite(endDay) && endDay > startDay && endDay <= 31) {
    const endDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    return { start: startDate, end: endDate };
  }

  return startDate;
}

function detectMeetDateFromText(text, options = {}) {
  const rawText = String(text || "");
  const fileName = String(options.file_name || "");
  const referenceYear = detectReferenceYear(rawText, fileName);

  const lines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 120);

  const prioritized = lines.find(
    (line) =>
      /\b(meet|invite|invitational|championship|classic|open)\b/i.test(line) &&
      /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)/i.test(
        line,
      ),
  );
  if (prioritized) {
    const parsed = parseMonthDayCandidate(prioritized, referenceYear);
    if (parsed) {
      console.log("🔍 Detected meet date from prioritized line:", parsed);
      return parsed;
    }
  }

  const monthRangeRegex =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:\s*(?:-|to|through)\s*\d{1,2})?(?:,?\s+\d{4})?\b/gi;
  let monthMatch;
  while ((monthMatch = monthRangeRegex.exec(rawText)) !== null) {
    const parsed = parseMonthDayCandidate(monthMatch[0], referenceYear);
    if (parsed) {
      console.log("🔍 Detected meet date from month range regex:", parsed);
      return parsed;
    }
  }

  const isoLike = rawText.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoLike) {
    const parsed = normalizeDateOnly(isoLike[0]);
    if (parsed) {
      console.log("🔍 Detected meet date from ISO format:", parsed);
      return parsed;
    }
  }

  const slashLike = rawText.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
  if (slashLike) {
    const parsed = normalizeDateOnly(slashLike[0]);
    if (parsed) {
      console.log("🔍 Detected meet date from slash format:", parsed);
      return parsed;
    }
  }

  return null;
}

function detectMeetNameFromText(text, options = {}) {
  const rawText = String(text || "");
  const rawFileName = String(options.file_name || "").trim();
  const fileName = cleanImportedFileName(rawFileName);
  const isPdfFileName = /\.pdf$/i.test(rawFileName);

  if (isPdfFileName && fileName) {
    return fileName.slice(0, 150);
  }

  const lines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 120);

  const banned =
    /\b(order of events|session\s*\d+|qualifying|time standards|warm[ -]?up|entry deadline|hy[- ]?tek|sanction|psych sheet|results?)\b/i;
  const preferred = lines.find(
    (line) =>
      !banned.test(line) &&
      /\b(meet|invite|invitational|championship|classic|open|trials)\b/i.test(
        line,
      ) &&
      line.length >= 8,
  );

  const candidate = preferred || fileName || "Imported Meet";
  return String(candidate)
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

function extractEventNumberFromText(text) {
  const raw = String(text || "");
  const match =
    raw.match(/\bevent\s*#?\s*(\d{1,3})\b/i) ||
    raw.match(/^\s*(\d{1,3})\s*[-:.\s]/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractAgeGroupFromText(text) {
  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;

  const patterns = [
    /\b(\d{1,2}\s*(?:-|to|\/|\s)\s*\d{1,2})\b/i, // "13-14", "13 - 14", "13 to 14", "13 14"
    /\b(\d{1,2}\s*(?:&|and)\s*under)\b/i, // "12 & Under", "12 & under"
    /\b(\d{1,2}\s*(?:&|and)\s*over)\b/i, // "13 & Over", "13 & over"
    /\b(\d{1,2}\s*U(?:nder)?)\b/i, // "12U", "12Under"
    /\b(open|senior|junior)\b/i, // "Open", "Senior", "Junior"
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match && match[1]) {
      return String(match[1]).replace(/\s+/g, " ").trim();
    }
  }

  return null;
}

function detectSessionAgeGroupFromText(text) {
  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;

  const tokens = [];
  const seen = new Set();
  const pushToken = (value) => {
    const clean = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tokens.push(clean);
  };

  let match;
  const rangeRegex = /(\d{1,2})\s*(?:-|to|\/)\s*(\d{1,2})/gi;
  while ((match = rangeRegex.exec(raw)) !== null) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      pushToken(`${Math.min(min, max)}-${Math.max(min, max)}`);
    }
  }

  const underRegex = /(\d{1,2})\s*(?:&|and)?\s*(?:under|u)\b/gi;
  while ((match = underRegex.exec(raw)) !== null) {
    pushToken(`${Number(match[1])} & Under`);
  }

  const overRegex = /(\d{1,2})\s*(?:&|and)?\s*(?:over|o)\b/gi;
  while ((match = overRegex.exec(raw)) !== null) {
    pushToken(`${Number(match[1])} & Over`);
  }

  if (!tokens.length) {
    if (/\bsenior\b/i.test(raw)) pushToken("Senior");
    if (/\bjunior\b/i.test(raw)) pushToken("Junior");
    if (/\bopen\b/i.test(raw)) pushToken("Open");
  }

  return tokens.length ? tokens.join(" and ") : null;
}

function extractGenderFromText(text) {
  const raw = String(text || "").toLowerCase();
  if (!raw) return null;

  if (/\b(girls?|female|women|woman|f\/?g)\b/i.test(raw)) {
    return "female";
  }
  if (/\b(boys?|male|men|man|m\/?b)\b/i.test(raw)) {
    return "male";
  }
  if (/\b(mixed|coed|co-ed|open)\b/i.test(raw)) {
    return "mixed";
  }

  return null;
}

function buildEventName(eventNumber, nameText) {
  const clean = String(nameText || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  if (!eventNumber) return clean;
  if (/^event\s*#?\s*\d{1,3}\b/i.test(clean)) {
    return clean;
  }
  return `Event ${eventNumber} ${clean}`;
}

function limitTextLength(value, maxLength) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return text;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength).trim();
}

function normalizeInviteSessionPeriod(value) {
  const raw = String(value || "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .toUpperCase();
  if (raw.startsWith("MID")) return "MID";
  if (raw === "AM" || raw === "PM") return raw;
  if (raw === "MORNING") return "AM";
  if (raw === "AFTERNOON") return "PM";
  // Double-check for "Afternoon" string format
  const lowerVal = String(value || "").toLowerCase();
  if (lowerVal.includes("afternoon")) return "PM";
  if (lowerVal.includes("morning")) return "AM";
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function addDaysToDateOnly(value, days) {
  const base = normalizeDateOnly(value);
  if (!base) return null;

  const date = new Date(`${base}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function getDayOffsetFromDate(dateOnly, dayName) {
  const base = normalizeDateOnly(dateOnly);
  if (!base) return 0;

  const dayIndexMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const target =
    dayIndexMap[
      String(dayName || "")
        .trim()
        .toLowerCase()
    ];
  if (target == null) return 0;

  const date = new Date(`${base}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 0;

  return (target - date.getDay() + 7) % 7;
}

function splitInviteSessionBlocks(content) {
  const text = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ");

  const matches = [];
  const addMatch = (index, dayName, length, sessionLabelRaw) => {
    matches.push({
      index,
      dayName,
      length,
      sessionLabel: normalizeInviteSessionPeriod(sessionLabelRaw),
    });
  };

  console.log(
    "🔍 splitInviteSessionBlocks input (first 500 chars):",
    text.slice(0, 500),
  );

  // Pattern 1: "Friday AM Session" or "Friday AM" or "Friday Afternoon" or "Friday PM Session" or "Saturday PM Session"
  // Updated: removed trailing \b to handle more variations
  const headingRegex =
    /\b(Friday|Saturday|Sunday)\s+(AM|PM|MID(?:-?DAY)?|AFTERNOON|MORNING)(?:\s+Session)?/gi;
  let match;
  let pattern1Count = 0;
  while ((match = headingRegex.exec(text))) {
    pattern1Count++;
    console.log("🔍 Pattern 1 (heading):", match[0], "at index", match.index);
    addMatch(match.index, match[1], match[0].length, match[2]);
  }

  // Pattern 2: "Session 3: Saturday MID" or "Session 1: Friday Afternoon"
  const summaryRegex =
    /\bSession\s*\d+\s*:\s*(Friday|Saturday|Sunday)\s*(AM|PM|MID(?:-?DAY)?|AFTERNOON|MORNING)?/gi;
  let pattern2Count = 0;
  while ((match = summaryRegex.exec(text))) {
    pattern2Count++;
    console.log("🔍 Pattern 2 (summary):", match[0], "at index", match.index);
    addMatch(match.index, match[1], match[0].length, match[2] || "");
  }

  // Pattern 2b: "Friday" or "Saturday" or "Sunday" standing alone as session headers
  const dayHeaderRegex = /(?:^|\n)\s*(Friday|Saturday|Sunday)\s*(?:\n|$)/gi;
  let pattern2bCount = 0;
  while ((match = dayHeaderRegex.exec(text))) {
    pattern2bCount++;
    console.log(
      "🔍 Pattern 2b (day header):",
      match[1],
      "at index",
      match.index,
    );
    // For day-only headers, we'll treat as default "PM" or try to infer from context
    addMatch(
      match.index + match[0].indexOf(match[1]),
      match[1],
      match[1].length,
      "",
    );
  }

  // Pattern 3: "Warm-Up 7:15 AM" or "Warm-up: 7:15 AM" (detect period from warmup times)
  const warmupRegex = /\bWarm[\s-]?[Uu]p\s*:?\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
  let pattern3Count = 0;
  const dayMentions = [];
  const dayRegexGlobal = /(Friday|Saturday|Sunday)/gi;
  while ((match = dayRegexGlobal.exec(text))) {
    dayMentions.push({ index: match.index, dayName: match[1] });
  }

  const resolveDayAtIndex = (idx) => {
    let day = dayMentions.length ? dayMentions[0].dayName : "Saturday";
    for (const mention of dayMentions) {
      if (mention.index <= idx) {
        day = mention.dayName;
      } else {
        break;
      }
    }
    return day;
  };

  while ((match = warmupRegex.exec(text))) {
    pattern3Count++;
    const dayName = resolveDayAtIndex(match.index);
    console.log(
      "🔍 Pattern 3 (warmup):",
      match[0],
      "-> day:",
      dayName,
      "time:",
      match[3],
    );
    addMatch(match.index, dayName, match[0].length, match[3]);
  }

  // Pattern 4: "Start: HH:MM AM/PM" (fallback)
  const startRegex = /\bStart\s*:\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
  let pattern4Count = 0;
  while ((match = startRegex.exec(text))) {
    pattern4Count++;
    const dayName = resolveDayAtIndex(match.index);
    console.log(
      "🔍 Pattern 4 (start time):",
      match[0],
      "-> day:",
      dayName,
      "time:",
      match[3],
    );
    addMatch(match.index, dayName, match[0].length, match[3]);
  }
  const concatenatedRegex =
    /\b(Friday|Saturday|Sunday)(AM|PM|MID(?:-?DAY)?|AFTERNOON|MORNING)/gi;
  let pattern5Count = 0;
  while ((match = concatenatedRegex.exec(text))) {
    const charBefore = match.index > 0 ? text[match.index - 1] : "\n";
    const charAfter = text[match.index + match[0].length] || "\n";
    if (!/\s/.test(charAfter) || !/\s/.test(charBefore)) {
      pattern5Count++;
      addMatch(match.index, match[1], match[0].length, match[2]);
    }
  }
  console.log("🔍 Pattern matches found:", {
    pattern1: pattern1Count,
    pattern2: pattern2Count,
    pattern2b: pattern2bCount,
    pattern3: pattern3Count,
    pattern4: pattern4Count,
    totalMatches: matches.length,
  });

  if (matches.length > 1) {
    matches.sort((a, b) => a.index - b.index);
  }

  const deduped = [];
  for (const item of matches) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.index === item.index &&
      prev.dayName === item.dayName &&
      prev.sessionLabel === item.sessionLabel
    ) {
      continue;
    }
    deduped.push(item);
  }

  console.log("🔍 After dedup:", deduped.length, "unique sessions");

  // FALLBACK: If no sessions detected, try to find day names in the text as fallback
  if (!deduped.length) {
    console.log(
      "🔍 No sessions detected with main patterns. Trying fallback...",
    );

    // Try to find at least one day mention as a fallback
    const dayFallbackMatch = /\b(Friday|Saturday|Sunday)\b/i.exec(text);
    if (dayFallbackMatch) {
      console.log("🔍 Found fallback day:", dayFallbackMatch[1]);
      deduped.push({
        index: 0,
        dayName: dayFallbackMatch[1],
        sessionLabel: "Session",
        length: 0,
      });
    } else {
      // Last resort: assume Saturday PM
      console.log("🔍 No day found, defaulting to Saturday PM");
      deduped.push({
        index: 0,
        dayName: "Saturday",
        sessionLabel: "PM",
        length: 0,
      });
    }
  }

  if (!deduped.length) {
    return [];
  }

  const result = deduped.map((current, index) => {
    const next = deduped[index + 1];
    const sessionBlock = {
      dayName: current.dayName,
      sessionLabel: current.sessionLabel,
      text: text
        .slice(current.index + current.length, next ? next.index : text.length)
        .trim(),
    };
    console.log("🔍 Session block", index, ":", {
      dayName: sessionBlock.dayName,
      sessionLabel: sessionBlock.sessionLabel,
      textLength: sessionBlock.text.length,
    });
    return sessionBlock;
  });

  return result;
}

function extractInviteSessionDaysFromText(content, meetDate) {
  const text = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const matches = [];
  const seen = new Set();

  const addMatch = (index, dayName, sessionRaw) => {
    const normalizedSession = normalizeInviteSessionPeriod(sessionRaw || "PM");
    const sessionDate = meetDate
      ? addDaysToDateOnly(meetDate, getDayOffsetFromDate(meetDate, dayName))
      : null;
    if (!sessionDate) return;

    const key = `${sessionDate}|${dayName}|${normalizedSession}`;
    if (seen.has(key)) return;
    seen.add(key);

    matches.push({
      index,
      meet_day: sessionDate,
      session_label: `${dayName} ${normalizedSession}`.trim(),
      age_group: null,
      gender: null,
    });
  };

  const headingRegex =
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(AM|PM|MID(?:-?DAY)?|AFTERNOON|MORNING|SESSION)(?:\s+Session)?\b/gi;
  let match;
  while ((match = headingRegex.exec(text)) !== null) {
    addMatch(match.index, match[1], match[2]);
  }

  const summaryRegex =
    /\bSession\s*\d+\s*:\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*(AM|PM|MID(?:-?DAY)?|AFTERNOON|MORNING)?/gi;
  while ((match = summaryRegex.exec(text)) !== null) {
    addMatch(match.index, match[1], match[2] || "PM");
  }

  matches.sort((a, b) => a.index - b.index);
  return matches.map(({ index, ...day }) => day);
}

function extractWarmupTimeFromBlock(blockText) {
  const warmupMatch = String(blockText || "").match(
    /\bwarm[- ]?up[:\s]+([^\n]*)/i,
  );
  if (warmupMatch && warmupMatch[1]) {
    const warmupText = warmupMatch[1].trim();
    if (warmupText) {
      return warmupText.slice(0, 100);
    }
  }
  return null;
}

function parseInviteEventRowsFromBlock(blockText) {
  const rawText = String(blockText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const normalized = rawText
    .replace(/\bGirls\s+Event\s+Boys\b/gi, " ")
    .replace(/\bGirls\s+Event\b|\bBoys\b/gi, " ")
    .replace(/\bwarm[- ]?up\s*:?.*$/gim, " ")
    .replace(/\bstart\s*:?\s*\d{1,2}:\d{2}\s*(am|pm).*$/gim, " ")
    .replace(/\b15\s*minute\s*break\b/gi, " ")
    .replace(
      /\b\d{4,}\s*(?:meet|session|times?\s+may\s+be|limited|provided|heats?).*$/gim,
      " ",
    )
    .replace(/\*+/g, " ")
    .replace(/[\u2022•·]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter(Boolean);
  const distanceSet = new Set([
    "25",
    "50",
    "100",
    "200",
    "400",
    "500",
    "800",
    "1000",
    "1500",
  ]);
  const isStandaloneNumber = (token) => /^\d{1,3}$/.test(token);
  const isDistance = (token) => distanceSet.has(token);
  const events = [];
  const seen = new Set();

  const pushEvent = (eventNumber, descriptor, gender) => {
    const cleanDescriptor = String(descriptor || "")
      .replace(/^event\s*#?\s*\d{1,3}\s*[-:.]?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!Number.isFinite(eventNumber) || eventNumber <= 0 || !cleanDescriptor) {
      return;
    }

    // Filter out metadata/instruction lines
    if (
      /\b(emailed|hy-tek|deck|entries|allowed|mail|payment|entry\s+fee|surcharge|original\s+email|contact|questions|information|officials|heats)\b/i.test(
        cleanDescriptor,
      )
    ) {
      return;
    }

    const dedupeKey = `${eventNumber}|${gender}|${cleanDescriptor.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    // Remove only duplicated leading gender words; keep age/range tokens intact.
    const descriptorNoGender = cleanDescriptor
      .replace(/^(?:girls?|boys?|women|men|female|male)\s+/i, "")
      .trim();

    // Some OCR lines begin with "& Over" after removing gender. Treat that as Open.
    const descriptorForParsing = descriptorNoGender.replace(
      /^&\s*over\b/i,
      "Open",
    );

    const distanceWithUnits = descriptorForParsing.match(
      /\b(\d{2,4})\s*(?:m|meter|meters|yd|yard|yards)\b/i,
    );
    const distanceNoUnits = descriptorForParsing.match(
      /\b(25|50|100|200|400|500|800|1000|1500)\b\s*(?=(?:freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual\s+medley|im|relay)\b)/i,
    );
    const distanceMeters = distanceWithUnits
      ? Number(distanceWithUnits[1])
      : distanceNoUnits
        ? Number(distanceNoUnits[1])
        : null;

    // Ignore malformed OCR rows that do not contain a recognizable event distance.
    if (!Number.isFinite(distanceMeters)) {
      return;
    }

    let stroke = null;
    if (/\bindividual\s+medley\b|\bim\b/i.test(descriptorForParsing)) {
      stroke = "individual medley";
    } else if (/\bfreestyle\b|\bfree\b/i.test(descriptorForParsing)) {
      stroke = "freestyle";
    } else if (/\bbackstroke\b|\bback\b/i.test(descriptorForParsing)) {
      stroke = "backstroke";
    } else if (/\bbreaststroke\b|\bbreast\b/i.test(descriptorForParsing)) {
      stroke = "breaststroke";
    } else if (/\bbutterfly\b|\bfly\b/i.test(descriptorForParsing)) {
      stroke = "butterfly";
    } else if (/\brelay\b/i.test(descriptorForParsing)) {
      stroke = "relay";
    }

    let ageGroup = extractAgeGroupFromText(descriptorForParsing) || null;
    if (!ageGroup) {
      const ageHintMatch = descriptorForParsing.match(
        /\b(\d{1,2}\s*(?:-|to|\/)\s*\d{1,2}|\d{1,2}\s*(?:&|and)?\s*(?:under|over|u|o)|open|senior|junior)\b/i,
      );
      if (ageHintMatch) {
        ageGroup =
          extractAgeGroupFromText(ageHintMatch[1]) ||
          String(ageHintMatch[1]).trim();
      }
    }
    const normalizedGender = normalizeGender(gender);
    const genderCapitalized = normalizedGender
      ? normalizedGender.charAt(0).toUpperCase() + normalizedGender.slice(1)
      : "";

    // Build event name: gender + age_group + distance + stroke
    const eventNameParts = [];
    if (genderCapitalized) eventNameParts.push(genderCapitalized);
    if (ageGroup) eventNameParts.push(ageGroup);
    if (distanceMeters) eventNameParts.push(`${distanceMeters}m`);
    if (stroke)
      eventNameParts.push(stroke.charAt(0).toUpperCase() + stroke.slice(1));
    const eventNameBuilt =
      eventNameParts.length > 0
        ? eventNameParts.join(" ")
        : descriptorForParsing;

    console.log("🔍 Built event:", {
      descriptor: descriptorForParsing.slice(0, 60),
      ageGroup,
      distanceMeters,
      stroke,
      genderCapitalized,
      eventNameBuilt,
    });

    events.push({
      event_name: limitTextLength(eventNameBuilt, 150),
      stroke: stroke ? normalizeStroke(stroke) : null,
      distance_meters: Number.isFinite(distanceMeters) ? distanceMeters : null,
      course: "SCY", // Default to Short Course Yards
      age_group: ageGroup,
      gender: normalizedGender,
      qualifying_time_seconds: null,
      qualifying_time_text: null,
      is_selected: events.length < 4,
    });
  };

  // First pass: parse line-oriented rows from table text.
  const lines = rawText
    .split("\n")
    .map((line) =>
      String(line || "")
        .replace(/\*+/g, " ")
        .replace(/[\u2022•·]/g, " ")
        .replace(/[–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  for (const line of lines) {
    if (
      /\b(girls\s+event\s+boys|order\s+of\s+events|session\s*\d+|warm[- ]?up|start:)\b/i.test(
        line,
      )
    ) {
      continue;
    }

    const rowMatch = line.match(/^(\d{1,3})\s+(.+?)\s+(\d{1,3})$/);
    if (rowMatch) {
      const girlsEventNum = Number(rowMatch[1]);
      const descriptor = String(rowMatch[2] || "").trim();
      const boysEventNum = Number(rowMatch[3]);
      pushEvent(girlsEventNum, descriptor, "female");
      pushEvent(boysEventNum, descriptor, "male");
      continue;
    }

    const explicitEventRowMatch = line.match(
      /^event\s*#?\s*(\d{1,3})\s+(.+?)\s+event\s*#?\s*(\d{1,3})$/i,
    );
    if (explicitEventRowMatch) {
      const firstNum = Number(explicitEventRowMatch[1]);
      const descriptor = String(explicitEventRowMatch[2] || "").trim();
      const secondNum = Number(explicitEventRowMatch[3]);
      if (firstNum % 2 === 1) {
        pushEvent(firstNum, descriptor, "female");
        pushEvent(secondNum, descriptor, "male");
      } else {
        pushEvent(firstNum, descriptor, "male");
        pushEvent(secondNum, descriptor, "female");
      }
      continue;
    }

    const looseEventRegex =
      /(?:^|\s)(?:(girls?|boys?|female|male)\s+)?((?:\d{1,2}\s*(?:&\s*under|&\s*over|-|to|\/)?\s*\d{0,2}|open|senior|junior)\b)?\s*(\d{2,4})\s*(?:m|meter|meters|yd|yard|yards)?\s*(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual\s+medley|im|relay)\b/gi;
    let looseMatch;
    while ((looseMatch = looseEventRegex.exec(line)) !== null) {
      const gender = looseMatch[1] || null;
      const ageGroup = looseMatch[2]
        ? extractAgeGroupFromText(looseMatch[2]) || String(looseMatch[2]).trim()
        : null;
      const distanceMeters = Number(looseMatch[3]);
      const strokeRaw = String(looseMatch[4] || "").trim();
      const normalizedGender = gender ? normalizeGender(gender) : null;
      const genderCapitalized = normalizedGender
        ? normalizedGender.charAt(0).toUpperCase() + normalizedGender.slice(1)
        : "";
      const eventNameParts = [];

      if (genderCapitalized) eventNameParts.push(genderCapitalized);
      if (ageGroup) eventNameParts.push(ageGroup);
      if (Number.isFinite(distanceMeters))
        eventNameParts.push(`${distanceMeters}m`);
      if (strokeRaw)
        eventNameParts.push(
          strokeRaw.charAt(0).toUpperCase() + strokeRaw.slice(1),
        );

      const eventName = eventNameParts.length
        ? eventNameParts.join(" ")
        : String(line || "").trim();
      const dedupeKey = `${eventName.toLowerCase()}|${normalizedGender || ""}|${ageGroup || ""}|${Number.isFinite(distanceMeters) ? distanceMeters : ""}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      events.push({
        event_name: limitTextLength(eventName, 150),
        stroke: strokeRaw ? normalizeStroke(strokeRaw) : null,
        distance_meters: Number.isFinite(distanceMeters)
          ? distanceMeters
          : null,
        course: "SCY", // Default to Short Course Yards
        age_group: ageGroup,
        gender: normalizedGender,
        qualifying_time_seconds: null,
        qualifying_time_text: null,
        is_selected: events.length < 4,
      });
    }
  }

  if (events.length) {
    return events;
  }

  let index = 0;
  while (index < tokens.length) {
    if (!isStandaloneNumber(tokens[index])) {
      index += 1;
      continue;
    }

    const oddNumber = Number(tokens[index]);

    // Find next non-distance number (the other gender's event number)
    let nextNumberIndex = -1;
    for (let i = index + 1; i < tokens.length; i++) {
      if (isStandaloneNumber(tokens[i]) && !isDistance(tokens[i])) {
        nextNumberIndex = i - index - 1;
        break;
      }
    }

    if (nextNumberIndex < 0) {
      break;
    }

    const evenNumber = Number(tokens[index + nextNumberIndex + 1]);
    const middleTokens = tokens.slice(index + 1, index + nextNumberIndex + 1);
    const descriptor = middleTokens.join(" ").trim();

    if (oddNumber % 2 === 1) {
      pushEvent(oddNumber, descriptor, "female");
      pushEvent(evenNumber, descriptor, "male");
    } else {
      pushEvent(evenNumber, descriptor, "male");
      pushEvent(oddNumber, descriptor, "female");
    }

    index += nextNumberIndex + 2;
  }

  if (events.length) {
    return events;
  }

  // Final fallback: parse looser event lines such as "Girls 13-14 50 Freestyle"
  for (const line of lines) {
    const looseEventRegex =
      /(?:^|\s)(?:(girls?|boys?|female|male)\s+)?((?:\d{1,2}\s*(?:&\s*under|&\s*over|-|to|\/)?\s*\d{0,2}|open|senior|junior)\b)?\s*(\d{2,4})\s*(?:m|meter|meters|yd|yard|yards)?\s*(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual\s+medley|im|relay)\b/gi;
    let looseMatch;
    while ((looseMatch = looseEventRegex.exec(line)) !== null) {
      const gender = looseMatch[1] || null;
      const ageGroup = looseMatch[2]
        ? extractAgeGroupFromText(looseMatch[2]) || String(looseMatch[2]).trim()
        : null;
      const distanceMeters = Number(looseMatch[3]);
      const strokeRaw = String(looseMatch[4] || "").trim();
      const normalizedGender = gender ? normalizeGender(gender) : null;
      const genderCapitalized = normalizedGender
        ? normalizedGender.charAt(0).toUpperCase() + normalizedGender.slice(1)
        : "";
      const eventNameParts = [];

      if (genderCapitalized) eventNameParts.push(genderCapitalized);
      if (ageGroup) eventNameParts.push(ageGroup);
      if (Number.isFinite(distanceMeters))
        eventNameParts.push(`${distanceMeters}m`);
      if (strokeRaw)
        eventNameParts.push(
          strokeRaw.charAt(0).toUpperCase() + strokeRaw.slice(1),
        );

      const eventName = eventNameParts.length
        ? eventNameParts.join(" ")
        : String(line || "").trim();
      const dedupeKey = `${eventName.toLowerCase()}|${normalizedGender || ""}|${ageGroup || ""}|${Number.isFinite(distanceMeters) ? distanceMeters : ""}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      events.push({
        event_name: limitTextLength(eventName, 150),
        stroke: strokeRaw ? normalizeStroke(strokeRaw) : null,
        distance_meters: Number.isFinite(distanceMeters)
          ? distanceMeters
          : null,
        age_group: ageGroup,
        gender: normalizedGender,
        qualifying_time_seconds: null,
        qualifying_time_text: null,
        is_selected: events.length < 4,
      });
    }
  }

  return events;
}

function parseInviteSessionEventsFromText(content, options = {}) {
  let meetDate = options.meet_date
    ? options.meet_date
    : detectMeetDateFromText(content, options);

  // Handle date range objects (e.g., { start: "2026-05-01", end: "2026-05-03" })
  if (meetDate && typeof meetDate === "object" && meetDate.start) {
    meetDate = meetDate.start;
    console.log("🔍 Using start date from range:", meetDate);
  }

  meetDate = normalizeDateOnly(meetDate);

  const text = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const allSessions = extractInviteSessionDaysFromText(content, meetDate);
  console.log(
    "🔍 extractInviteSessionDaysFromText found",
    allSessions.length,
    "sessions:",
    allSessions.map((s) => ({
      meet_day: s.meet_day,
      session_label: s.session_label,
    })),
  );

  if (!allSessions.length) {
    return { days: [], events: [] };
  }

  const events = [];

  // Now split the text into blocks using these 7 session markers
  const sessionMarkers = [];
  const headingRegex =
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(AM|PM|MID(?:-?DAY)?|AFTERNOON|MORNING|SESSION)(?:\s+Session)?\b/gi;
  let match;
  while ((match = headingRegex.exec(text)) !== null) {
    const dayName = match[1];
    const sessionRaw = match[2];
    const normalizedSession = normalizeInviteSessionPeriod(sessionRaw);
    const key = `${dayName} ${normalizedSession}`.trim();
    sessionMarkers.push({
      index: match.index,
      key,
      match: match[0],
    });
  }

  console.log("🔍 Found", sessionMarkers.length, "session markers in text");

  // For each session from allSessions, extract events from nearby text
  allSessions.forEach((session) => {
    const sessionLabel = session.session_label;
    const matchingMarker = sessionMarkers.find((m) => {
      if (m.key === sessionLabel) return true;
      if (m.key.toLowerCase() === sessionLabel.toLowerCase()) return true;
      const dayPartFromSession = sessionLabel.split(" ")[0];
      const dayPartFromMarker = m.key.split(" ")[0];
      if (
        dayPartFromSession &&
        dayPartFromMarker &&
        dayPartFromSession.toLowerCase() === dayPartFromMarker.toLowerCase()
      ) {
        return true;
      }
      return false;
    });

    if (matchingMarker) {
      const blockStart = matchingMarker.index + matchingMarker.match.length;
      const nextMarker = sessionMarkers.find(
        (m) => m.index > matchingMarker.index,
      );
      const blockEnd = nextMarker ? nextMarker.index : text.length;
      const blockText = text.slice(blockStart, blockEnd);

      console.log(
        "🔍 Extracting events for session:",
        sessionLabel,
        "block length:",
        blockText.length,
      );

      const sessionAgeGroup = detectSessionAgeGroupFromText(
        session.session_label || session.age_group || "",
      );

      const blockEvents = parseInviteEventRowsFromBlock(blockText).map(
        (event) => ({
          ...event,
          session_label: sessionLabel,
          meet_day: session.meet_day,
          course: event.course || "SCY", // Default to Short Course Yards
          age_group:
            event.age_group || session.age_group || sessionAgeGroup || null,
          gender: event.gender || null,
          event_name: limitTextLength(
            `[${sessionLabel}] ${event.event_name}`,
            500,
          ),
        }),
      );

      console.log(
        "🔍 Session",
        sessionLabel,
        "-> extracted",
        blockEvents.length,
        "events",
      );
      events.push(...blockEvents);
    } else {
      console.log(
        "🔍 No matching marker found for session:",
        sessionLabel,
        "- will attempt fallback extraction",
      );
    }
  });

  // Fallback: if we got very few events (less than 40% of what we expect),
  // try extracting all events from the entire text without session filtering
  if (events.length < 24) {
    console.log(
      "🔍 Only extracted",
      events.length,
      "events, trying fallback full-text extraction...",
    );
    const fallbackEvents = parseInviteEventRowsFromBlock(text);
    if (fallbackEvents.length > events.length) {
      console.log("🔍 Fallback found", fallbackEvents.length, "events");
      const defaultSession = allSessions.length > 0 ? allSessions[0] : null;
      if (defaultSession) {
        fallbackEvents.forEach((event) => {
          if (!events.some((e) => e.event_name === event.event_name)) {
            events.push({
              ...event,
              session_label: defaultSession.session_label,
              meet_day: defaultSession.meet_day,
              course: event.course || "SCY",
              age_group: event.age_group || defaultSession.age_group || null,
              gender: event.gender || null,
              event_name: limitTextLength(
                `[${defaultSession.session_label}] ${event.event_name}`,
                500,
              ),
            });
          }
        });
      }
    }
  }

  const normalizedDays = normalizeMeetDayEntries(allSessions, meetDate);

  console.log(
    "🔍 parseInviteSessionEventsFromText found",
    normalizedDays.length,
    "sessions,",
    events.length,
    "total events",
  );

  console.log(
    "🔍 Days returned:",
    normalizedDays.map((d) => ({
      meet_day: d.meet_day,
      session_label: d.session_label,
    })),
  );
  return { days: normalizedDays, events };
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPdfSessionHeadingPattern(sessionLabel) {
  const label = String(sessionLabel || "").trim();
  if (!label) return null;

  const [dayName, ...periodParts] = label.split(/\s+/);
  if (!dayName || !periodParts.length) return null;

  const period = periodParts.join(" ").toUpperCase();
  const dayPattern = escapeRegExp(dayName);
  let periodPattern = escapeRegExp(period);

  if (period === "PM") {
    periodPattern = "(?:PM|AFTERNOON)";
  } else if (period === "AM") {
    periodPattern = "(?:AM|MORNING)";
  } else if (period.startsWith("MID")) {
    periodPattern = "(?:MID(?:[- ]?DAY)?|MIDDAY)";
  }

  return new RegExp(`${dayPattern}\\s+${periodPattern}(?:\\s+Session)?`, "i");
}

function parseInviteSessionEventsFromPdfText(content, options = {}) {
  let meetDate = options.meet_date
    ? options.meet_date
    : detectMeetDateFromText(content, options);

  if (meetDate && typeof meetDate === "object" && meetDate.start) {
    meetDate = meetDate.start;
    console.log("🔍 Using start date from range:", meetDate);
  }

  meetDate = normalizeDateOnly(meetDate);

  const text = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const sessions = extractInviteSessionDaysFromText(text, meetDate);
  if (!sessions.length) {
    return { days: [], events: [] };
  }

  const likelyTableHeader = (markerIndex, markerText) => {
    const lookAhead = text.slice(markerIndex, markerIndex + 700);
    const afterHeading = text.slice(
      markerIndex + String(markerText || "").length,
      markerIndex + String(markerText || "").length + 700,
    );

    if (/\bGirls\s+Event\s+Boys\b/i.test(lookAhead)) return true;
    if (/\bWarm-?up\b/i.test(lookAhead) && /\bStart\b/i.test(lookAhead)) {
      return true;
    }

    // Event tables contain lots of low 1-3 digit event numbers close together.
    const numberHits = afterHeading.match(/\b\d{1,3}\b/g);
    return Array.isArray(numberHits) && numberHits.length >= 8;
  };

  const markers = [];
  for (const session of sessions) {
    const pattern = buildPdfSessionHeadingPattern(session.session_label);
    if (!pattern) {
      continue;
    }

    // Find all occurrences; the first is usually in the "SESSIONS" summary,
    // while later ones are the actual table headings we need.
    const globalPattern = new RegExp(pattern.source, "gi");
    const candidates = [];
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      candidates.push({
        index: match.index,
        matchText: match[0],
      });
    }

    if (!candidates.length) {
      continue;
    }

    const tableCandidates = candidates.filter((candidate) =>
      likelyTableHeader(candidate.index, candidate.matchText),
    );
    const picked =
      tableCandidates.length > 0
        ? tableCandidates[tableCandidates.length - 1]
        : candidates[candidates.length - 1];

    markers.push({
      index: picked.index,
      label: session.session_label,
      matchText: picked.matchText,
    });
  }

  markers.sort((a, b) => a.index - b.index);

  if (!markers.length) {
    return {
      days: normalizeMeetDayEntries(sessions, meetDate),
      events: [],
    };
  }

  const events = [];
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const session = sessions.find((entry) => entry.session_label === marker.label);
    if (!session) continue;

    const nextMarker = i + 1 < markers.length ? markers[i + 1] : null;
    const blockStart = marker.index + marker.matchText.length;
    const blockEnd = nextMarker ? nextMarker.index : text.length;
    const blockText = text.slice(blockStart, blockEnd);
    const sessionAgeGroup = detectSessionAgeGroupFromText(
      session.session_label || session.age_group || "",
    );

    const blockEvents = parseInviteEventRowsFromBlock(blockText).map(
      (event) => ({
        ...event,
        session_label: session.session_label,
        meet_day: session.meet_day,
        course: event.course || "SCY",
        age_group:
          event.age_group || session.age_group || sessionAgeGroup || null,
        gender: event.gender || null,
        event_name: limitTextLength(
          `[${session.session_label}] ${event.event_name}`,
          500,
        ),
      }),
    );

    events.push(...blockEvents);
  }

  return {
    days: normalizeMeetDayEntries(sessions, meetDate),
    events,
  };
}

function parseMeetEventsFromPlainText(content) {
  const inviteParsed = parseInviteSessionEventsFromText(content);
  if (inviteParsed.events.length) {
    return inviteParsed.events;
  }

  const lines = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const events = [];
  const seen = new Set();

  const strokePatterns = [
    { re: /\bindividual\s+medley\b|\bim\b/i, stroke: "individual medley" },
    { re: /\bfreestyle\b|\bfree\b/i, stroke: "freestyle" },
    { re: /\bbackstroke\b|\bback\b/i, stroke: "backstroke" },
    { re: /\bbreaststroke\b|\bbreast\b/i, stroke: "breaststroke" },
    { re: /\bbutterfly\b|\bfly\b/i, stroke: "butterfly" },
    { re: /\brelay\b/i, stroke: "relay" },
  ];

  const eventLinePatterns = [
    /^\s*event\s*#?\s*(\d{1,3})\s*[-:.]?\s*(.+)$/i,
    /^\s*(\d{1,3})\s*[-:.]\s*(.+)$/i,
    /^\s*(\d{1,3})\s+(.+)$/i,
  ];

  function parseDistanceFromName(rawName) {
    const withUnits = rawName.match(
      /\b(\d{2,4})\s*(?:m|meter|meters|yd|yard|yards)\b/i,
    );
    if (withUnits) {
      const parsed = Number(withUnits[1]);
      return Number.isFinite(parsed) ? parsed : null;
    }

    const noUnits = rawName.match(
      /\b(25|50|100|200|400|500|800|1000|1500)\b\s*(?=(?:freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual\s+medley|im|relay)\b)/i,
    );
    if (noUnits) {
      const parsed = Number(noUnits[1]);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  function pushEvent(eventNumber, rawName) {
    const cleanName = String(rawName || "")
      .replace(/^event\s*#?\s*\d{1,3}\s*[-:.]?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!Number.isFinite(eventNumber) || eventNumber <= 0 || !cleanName) {
      return;
    }

    const hasStrokeKeyword = strokePatterns.some((item) =>
      item.re.test(cleanName),
    );
    const hasDistanceKeyword =
      /\b\d{2,4}\s*(?:m|meter|meters|yd|yard|yards)\b/i.test(cleanName) ||
      /\b(25|50|100|200|400|500|800|1000|1500)\b/i.test(cleanName);
    if (!hasStrokeKeyword && !hasDistanceKeyword) {
      return;
    }

    const dedupeKey = `${eventNumber}|${cleanName.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    const distanceMeters = parseDistanceFromName(cleanName);

    let stroke = null;
    for (const candidate of strokePatterns) {
      if (candidate.re.test(cleanName)) {
        stroke = candidate.stroke;
        break;
      }
    }

    const ageGroup = extractAgeGroupFromText(cleanName);
    const gender = extractGenderFromText(cleanName);

    events.push({
      event_name: buildEventName(eventNumber, cleanName),
      stroke: stroke ? normalizeStroke(stroke) : null,
      distance_meters: Number.isFinite(distanceMeters) ? distanceMeters : null,
      course: "SCY", // Default to Short Course Yards
      age_group: ageGroup || null,
      gender: gender ? normalizeGender(gender) : null,
      qualifying_time_seconds: null,
      qualifying_time_text: null,
      is_selected: events.length < 4,
    });
  }

  lines.forEach((line) => {
    let match = null;
    for (const pattern of eventLinePatterns) {
      match = line.match(pattern);
      if (match) break;
    }

    if (!match) return;

    const eventNumber = Number(match[1]);
    const rawName = String(match[2] || "").trim();
    pushEvent(eventNumber, rawName);
  });

  // Fallback for PDFs where event numbers and names are split across chunks.
  const compact = lines.join(" ");
  const markers = [];
  const markerRegex = /\b(?:event\s*#?\s*)?(\d{1,3})\b/gi;
  let markerMatch;
  while ((markerMatch = markerRegex.exec(compact)) !== null) {
    const n = Number(markerMatch[1]);
    if (!Number.isFinite(n) || n <= 0) {
      continue;
    }
    markers.push({
      number: n,
      start: markerMatch.index,
      end: markerRegex.lastIndex,
    });
  }

  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const nextStart =
      i + 1 < markers.length ? markers[i + 1].start : compact.length;
    const snippet = compact
      .slice(current.end, Math.min(nextStart, current.end + 220))
      .replace(/\s+/g, " ")
      .trim();
    if (!snippet) {
      continue;
    }
    pushEvent(current.number, snippet);
  }

  return events;
}

function parseMeetFileContent(content, options = {}) {
  const text = String(content || "").trim();
  if (!text) {
    throw new Error("Meet file content is empty");
  }

  let payloadRows = [];
  let meta = null;

  console.log("🔍 parseMeetFileContent: text starts with", text.slice(0, 50));

  if (text.startsWith("{") || text.startsWith("[")) {
    console.log("🔍 Using JSON parser");
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
    console.log("🔍 Trying CSV parser");
    payloadRows = parseCsvToObjects(text);
    if (!payloadRows.length) {
      console.log("🔍 CSV parser failed, trying CSV-from-text parser");
      payloadRows = parseCsvFromAnyText(text);
    }
  }

  if (!Array.isArray(payloadRows) || payloadRows.length === 0) {
    console.log("🔍 No CSV/JSON rows found, trying invite parser");
    let detectedDate =
      detectMeetDateFromText(text, options) ||
      normalizeDateOnly(new Date().toISOString().slice(0, 10));

    // Handle date range object (e.g., { start: "2026-05-01", end: "2026-05-03" })
    if (
      detectedDate &&
      typeof detectedDate === "object" &&
      detectedDate.start
    ) {
      console.log("🔍 Detected date range:", detectedDate);
      detectedDate = detectedDate.start;
    }

    const inviteParsed = parseInviteSessionEventsFromText(text, {
      ...options,
      meet_date: detectedDate,
    });
    if (inviteParsed.events.length) {
      const pdfSessionDays = extractInviteSessionDaysFromText(
        text,
        detectedDate,
      );
      const normalizedDaysSource = pdfSessionDays.length
        ? pdfSessionDays
        : inviteParsed.days;

      if (options && options.is_pdf) {
        const pdfParsed = parseInviteSessionEventsFromPdfText(text, {
          ...options,
          meet_date: detectedDate,
        });
        if (pdfParsed.events.length) {
          return {
            meet_name: detectMeetNameFromText(text, options),
            meet_date: detectedDate,
            location: null,
            host_team: null,
            days: normalizeMeetDayEntries(pdfParsed.days, detectedDate),
            events: pdfParsed.events,
          };
        }
      }

      console.log(
        "🔍 Invite parser succeeded with",
        inviteParsed.events.length,
        "events and",
        normalizedDaysSource.length,
        "days",
      );
      return {
        meet_name: detectMeetNameFromText(text, options),
        meet_date: detectedDate,
        location: null,
        host_team: null,
        days: normalizeMeetDayEntries(normalizedDaysSource, detectedDate),
        events: inviteParsed.events,
      };
    }

    console.log("🔍 Invite parser failed, trying plain text parser");
    const parsedEvents = parseMeetEventsFromPlainText(text);
    if (!parsedEvents.length) {
      throw new Error(
        "No meet rows found. Provide JSON with events/rows, a CSV with data rows, or a meet packet that includes event-numbered lines.",
      );
    }

    const meetName = detectMeetNameFromText(text, options);

    return {
      meet_name: meetName,
      meet_date: detectedDate,
      location: null,
      host_team: null,
      days: normalizeMeetDayEntries(
        extractInviteSessionDaysFromText(text, detectedDate).length
          ? extractInviteSessionDaysFromText(text, detectedDate)
          : [detectedDate],
        detectedDate,
      ),
      events: parsedEvents,
    };
  }

  const first = payloadRows[0];
  const meetName =
    (meta && firstNonEmpty(meta, ["meet_name", "meetName", "title"])) ||
    firstNonEmpty(first, ["meet_name", "meet", "meetname", "title"], "") ||
    detectMeetNameFromText(text, options) ||
    "Imported Meet";

  const meetDate =
    normalizeDateOnly(
      (meta && firstNonEmpty(meta, ["meet_date", "meetDate", "date"])) ||
        firstNonEmpty(first, ["meet_date", "date", "meet_day", "day"]),
    ) ||
    detectMeetDateFromText(text, options) ||
    normalizeDateOnly(new Date().toISOString().slice(0, 10));

  const location =
    (meta && firstNonEmpty(meta, ["location"])) ||
    firstNonEmpty(first, ["location", "pool", "venue"], "");

  const hostTeam =
    (meta && firstNonEmpty(meta, ["host_team", "hostTeam", "host"])) ||
    firstNonEmpty(first, ["host_team", "host"], "");

  const dayEntries = [];
  const events = [];

  const metaDays = meta && Array.isArray(meta.days) ? meta.days : [];
  metaDays.forEach((day) => dayEntries.push(day));

  payloadRows.forEach((row, index) => {
    const meetDay = normalizeDateOnly(
      firstNonEmpty(row, ["meet_day", "day", "day_date", "date"]),
    );
    if (meetDay) {
      dayEntries.push({
        meet_day: meetDay,
        session_label: firstNonEmpty(
          row,
          ["session_label", "session", "session_name"],
          "",
        ),
        age_group:
          firstNonEmpty(row, ["session_age_group", "day_age_group"], "") ||
          null,
        gender:
          firstNonEmpty(row, ["session_gender", "day_gender"], "") || null,
      });
    }

    const eventName = firstNonEmpty(row, ["event_name", "event", "name"], "");
    if (!eventName) {
      return;
    }

    const course =
      firstNonEmpty(row, ["course", "pool_type", "pool"], "") || "SCY"; // Default to Short Course Yards (most common in USA)

    const explicitEventNumber = Number(
      firstNonEmpty(
        row,
        ["event_number", "event_no", "eventnum", "evt_no"],
        "",
      ),
    );
    const inferredEventNumber = extractEventNumberFromText(eventName);
    const eventNumber =
      Number.isFinite(explicitEventNumber) && explicitEventNumber > 0
        ? explicitEventNumber
        : inferredEventNumber;

    const stroke =
      firstNonEmpty(row, ["stroke"], "") ||
      (() => {
        const matched = [
          { re: /\bindividual\s+medley\b|\bim\b/i, value: "individual medley" },
          { re: /\bfreestyle\b|\bfree\b/i, value: "freestyle" },
          { re: /\bbackstroke\b|\bback\b/i, value: "backstroke" },
          { re: /\bbreaststroke\b|\bbreast\b/i, value: "breaststroke" },
          { re: /\bbutterfly\b|\bfly\b/i, value: "butterfly" },
          { re: /\brelay\b/i, value: "relay" },
        ].find((candidate) => candidate.re.test(eventName));
        return matched ? matched.value : "";
      })();
    const distanceRaw = firstNonEmpty(
      row,
      ["distance_meters", "distance", "meters"],
      "",
    );
    const distanceWithUnits = eventName.match(
      /\b(\d{2,4})\s*(?:m|meter|meters|yd|yard|yards)\b/i,
    );
    const distanceNoUnits = eventName.match(
      /\b(25|50|100|200|400|500|800|1000|1500)\b\s*(?=(?:freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual\s+medley|im|relay)\b)/i,
    );
    const distanceFromName = distanceWithUnits
      ? Number(distanceWithUnits[1])
      : distanceNoUnits
        ? Number(distanceNoUnits[1])
        : null;
    const distanceMeters = distanceRaw ? Number(distanceRaw) : distanceFromName;
    const ageGroup =
      firstNonEmpty(row, ["age_group", "age"], "") ||
      extractAgeGroupFromText(eventName) ||
      "";
    const gender =
      firstNonEmpty(row, ["gender", "sex"], "") ||
      extractGenderFromText(eventName) ||
      "";
    const qualifyingRaw = firstNonEmpty(
      row,
      ["qualifying_time", "time_standard", "cut_time", "standard"],
      "",
    );
    const qualifyingSeconds = parseTimeToSeconds(qualifyingRaw);
    const selectedRaw = firstNonEmpty(row, ["is_selected", "selected"], "");

    events.push({
      event_name: buildEventName(eventNumber, eventName),
      stroke: stroke || null,
      distance_meters: Number.isFinite(distanceMeters) ? distanceMeters : null,
      course: course || "SCY",
      age_group: ageGroup || null,
      gender: gender ? normalizeGender(gender) : null,
      qualifying_time_seconds: qualifyingSeconds,
      qualifying_time_text:
        qualifyingSeconds != null ? formatSeconds(qualifyingSeconds) : null,
      is_selected: selectedRaw ? parseTruthy(selectedRaw) : index < 4,
    });
  });

  if (!events.length) {
    const meetName = detectMeetNameFromText(text, options);
    let detectedDate =
      detectMeetDateFromText(text, options) ||
      normalizeDateOnly(new Date().toISOString().slice(0, 10));
    if (
      detectedDate &&
      typeof detectedDate === "object" &&
      detectedDate.start
    ) {
      detectedDate = detectedDate.start;
    }
    const inviteParsed = parseInviteSessionEventsFromText(text, {
      ...options,
      meet_date: detectedDate,
    });
    if (!inviteParsed.events.length) {
      throw new Error("No valid events were found in the meet file");
    }
    return {
      meet_name: meetName,
      meet_date: detectedDate,
      location: null,
      host_team: null,
      days: normalizeMeetDayEntries(inviteParsed.days, detectedDate),
      events: inviteParsed.events,
    };
  }

  const normalizedDays = normalizeMeetDayEntries(dayEntries, meetDate);

  return {
    meet_name: meetName,
    meet_date: meetDate,
    location: location || null,
    host_team: hostTeam || null,
    days: normalizedDays,
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
    `SELECT s.id AS swimmer_id, u.name AS swimmer_name, s.gender, s.date_of_birth
     FROM swimmers s
     JOIN users u ON u.id = s.user_id
     WHERE s.id IN (${swimmerIds.map(() => "?").join(",")})
     ORDER BY u.name ASC`,
    swimmerIds,
  );

  return rows;
}

async function getMeetEligibilityForSwimmers(
  meetId,
  swimmerIds,
  meetDate = null,
) {
  const eventRows = await (async () => {
    const [rows] = await pool.query(
      `SELECT id, event_name, stroke, distance_meters, age_group, gender,
              is_selected, qualifying_time_seconds
       FROM meet_events
       WHERE meet_id = ?
       ORDER BY id ASC`,
      [meetId],
    );
    return rows;
  })();

  const selectedEvents = eventRows;

  const eligibilityBySwimmerId = new Map();

  if (
    !Array.isArray(swimmerIds) ||
    swimmerIds.length === 0 ||
    !selectedEvents.length
  ) {
    return {
      selectedEvents,
      eligibilityBySwimmerId,
      visibleSwimmerIds: [],
    };
  }

  const swimmers = await getSwimmerRowsByIds(swimmerIds);

  swimmers.forEach((swimmer) => {
    const swimmerId = Number(swimmer.swimmer_id);
    const eligibleEventIds = [];

    selectedEvents.forEach((event) => {
      const effectiveGender =
        event.gender || extractGenderFromText(event.event_name || "");
      const effectiveAgeGroup =
        event.age_group || extractAgeGroupFromText(event.event_name || "");

      if (!genderMatches(effectiveGender, swimmer.gender)) {
        return;
      }

      if (!ageMatches(effectiveAgeGroup, swimmer.date_of_birth, meetDate)) {
        return;
      }

      eligibleEventIds.push(Number(event.id));
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
app.use(express.urlencoded({ limit: "100mb", extended: true }));
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
  const { name, email, password, role, gender, date_of_birth, address } =
    req.body;

  if (
    !name ||
    !email ||
    !password ||
    !role ||
    !gender ||
    !date_of_birth ||
    !address
  ) {
    return res.status(400).json({
      message:
        "name, email, password, role, gender, date_of_birth, and address are required",
    });
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
      message:
        "name, email, gender, date_of_birth, and address must be valid and non-blank",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(
      "INSERT INTO users (name, email, password_hash, role, gender, date_of_birth, address) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        cleanName,
        cleanEmail,
        passwordHash,
        role,
        cleanGender,
        cleanDob,
        cleanAddress,
      ],
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
  const { name, email, password, role, gender, date_of_birth, address } =
    req.body;

  if (
    !name ||
    !email ||
    !password ||
    !role ||
    !gender ||
    !date_of_birth ||
    !address
  ) {
    return res.status(400).json({
      message:
        "name, email, password, role, gender, date_of_birth, and address are required",
    });
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
      message:
        "name, email, gender, date_of_birth, and address must be valid and non-blank",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(
      "INSERT INTO users (name, email, password_hash, role, gender, date_of_birth, address) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        cleanName,
        cleanEmail,
        passwordHash,
        role,
        cleanGender,
        cleanDob,
        cleanAddress,
      ],
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
        const [allSwimmerRows] = await connection.query(
          "SELECT id FROM swimmers",
        );
        validFallbackSwimmerIds = new Set(
          allSwimmerRows.map((row) => Number(row.id)),
        );
      }

      await connection.beginTransaction();

      for (const entry of entries) {
        const swimmerId = Number(entry && entry.swimmer_id);
        const status = String(entry && entry.status ? entry.status : "").trim();
        const note =
          entry && typeof entry.note === "string" ? entry.note.trim() : null;

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
      content = await getImportedTextFromPayload(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    let parsedMeet;
    try {
      parsedMeet = parseMeetFileContent(content, {
        file_name: payload && payload.file_name ? payload.file_name : "",
        is_pdf: payload && payload.is_pdf ? true : false,
      });
      console.log("🔍 parseMeetFileContent result:", {
        meet_name: parsedMeet.meet_name,
        meet_date: parsedMeet.meet_date,
        days_count: (parsedMeet.days || []).length,
        days: (parsedMeet.days || []).map((d) => ({
          meet_day: d.meet_day,
          session_label: d.session_label,
          age_group: d.age_group,
          gender: d.gender,
        })),
        events_count: (parsedMeet.events || []).length,
        sample_events: (parsedMeet.events || []).slice(0, 3).map((e) => ({
          event_name: e.event_name,
          age_group: e.age_group,
          gender: e.gender,
        })),
      });
    } catch (error) {
      const contentLength = String(content || "").trim().length;
      return res.status(400).json({
        message: `Invalid meet file: ${error.message}`,
        details: {
          extracted_text_length: contentLength,
        },
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const coachId = await getCoachIdForUser(req.user.sub);

      // Calculate date range from all meet days
      const meetDays = (parsedMeet.days || [])
        .map((d) => normalizeDateOnly(d && d.meet_day))
        .filter(Boolean)
        .sort();
      const startDate =
        meetDays.length > 0
          ? meetDays[0]
          : normalizeDateOnly(parsedMeet.meet_date);
      const endDate =
        meetDays.length > 0
          ? meetDays[meetDays.length - 1]
          : normalizeDateOnly(parsedMeet.meet_date);

      console.log(
        "🔍 IMPORT DEBUG - parsedMeet.days:",
        parsedMeet.days.length,
        "days",
      );
      console.log(
        "🔍 IMPORT DEBUG - parsedMeet.days details:",
        parsedMeet.days.map((d) => ({
          meet_day: d.meet_day,
          session_label: d.session_label,
          age_group: d.age_group,
          gender: d.gender,
        })),
      );
      console.log("🔍 IMPORT DEBUG - meetDays (unique dates):", meetDays);
      console.log(
        "🔍 IMPORT DEBUG - startDate:",
        startDate,
        "endDate:",
        endDate,
      );

      const [meetResult] = await connection.query(
        `INSERT INTO meets (meet_name, meet_date, location, host_team, import_filename, start_date, end_date, created_by_coach_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parsedMeet.meet_name,
          parsedMeet.meet_date,
          parsedMeet.location,
          parsedMeet.host_team,
          payload && payload.file_name
            ? String(payload.file_name).slice(0, 255)
            : null,
          startDate,
          endDate,
          coachId,
        ],
      );

      const meetId = meetResult.insertId;

      if (parsedMeet.days.length) {
        const normalizedImportDays = normalizeMeetDayEntries(
          parsedMeet.days,
          parsedMeet.meet_date,
        ).filter((day) => normalizeDateOnly(day && day.meet_day));

        // Extra deduplication: ensure no duplicate (meet_day, session_label) pairs
        const deduplicatedDays = [];
        const seenKeys = new Set();
        for (const day of normalizedImportDays) {
          const key = `${day.meet_day}|${day.session_label || ""}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            deduplicatedDays.push(day);
          }
        }
        const finalImportDays = deduplicatedDays;

        console.log(
          "🔍 normalizedImportDays to be inserted:",
          finalImportDays.map((d) => ({
            meet_day: d.meet_day,
            session_label: d.session_label,
            warmup_time: d.warmup_time,
          })),
        );

        if (!finalImportDays.length) {
          throw new Error(
            "No valid meet days could be derived from the imported file",
          );
        }

        const [warmupColumnRows] = await connection.query(
          "SHOW COLUMNS FROM meet_days LIKE 'warmup_time'",
        );
        const hasWarmupTimeColumn =
          Array.isArray(warmupColumnRows) && warmupColumnRows.length > 0;

        if (hasWarmupTimeColumn) {
          const dayValuesWithSession = finalImportDays
            .map(() => "(?, ?, ?, ?, ?, ?)")
            .join(", ");
          const dayParams = finalImportDays.flatMap((day) => [
            meetId,
            normalizeDateOnly(day.meet_day),
            normalizeSessionLabel(day.session_label),
            day.age_group || null,
            day.gender || null,
            day.warmup_time || null,
          ]);

          await connection.query(
            `INSERT IGNORE INTO meet_days (meet_id, meet_day, session_label, age_group, gender, warmup_time) VALUES ${dayValuesWithSession}`,
            dayParams,
          );
        } else {
          const dayValuesWithSession = finalImportDays
            .map(() => "(?, ?, ?, ?, ?)")
            .join(", ");
          const dayParams = finalImportDays.flatMap((day) => [
            meetId,
            normalizeDateOnly(day.meet_day),
            normalizeSessionLabel(day.session_label),
            day.age_group || null,
            day.gender || null,
          ]);

          await connection.query(
            `INSERT IGNORE INTO meet_days (meet_id, meet_day, session_label, age_group, gender) VALUES ${dayValuesWithSession}`,
            dayParams,
          );
        }
      }

      if (parsedMeet.events.length) {
        const eventValues = parsedMeet.events
          .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .join(", ");

        const eventParams = parsedMeet.events.flatMap((event) => [
          meetId,
          event.event_name,
          event.stroke,
          event.distance_meters,
          event.course || "SCY",
          event.age_group,
          event.gender,
          event.is_selected ? 1 : 0,
          event.qualifying_time_seconds,
          event.qualifying_time_text,
        ]);

        await connection.query(
          `INSERT INTO meet_events
             (meet_id, event_name, stroke, distance_meters, course, age_group, gender, is_selected, qualifying_time_seconds, qualifying_time_text)
           VALUES ${eventValues}`,
          eventParams,
        );
      }

      await connection.commit();

      // Save the original file if it's a PDF
      if (
        payload &&
        payload.file_buffer &&
        payload.is_pdf &&
        payload.file_name
      ) {
        try {
          const fileExtension = path.extname(payload.file_name) || ".pdf";
          const safeFileName = `${meetId}${fileExtension}`;
          const filePath = path.join(uploadsDir, safeFileName);
          fs.writeFileSync(filePath, payload.file_buffer);
          console.log(`✓ Saved PDF for meet ${meetId}:`, filePath);
        } catch (error) {
          console.warn(
            `Warning: Could not save PDF file for meet ${meetId}:`,
            error.message,
          );
        }
      }

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
      const errorText = String(
        error && error.message ? error.message : "Unknown import error",
      ).trim();
      return res.status(500).json({
        message: `Failed to import meet: ${errorText}`,
        error: errorText,
      });
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
    const meetName = String(
      req.body && req.body.meet_name ? req.body.meet_name : "",
    ).trim();
    const meetDate = normalizeDateOnly(req.body && req.body.meet_date);
    const location = String(
      req.body && req.body.location ? req.body.location : "",
    ).trim();
    const hostTeam = String(
      req.body && req.body.host_team ? req.body.host_team : "",
    ).trim();

    if (!meetName || !meetDate) {
      return res
        .status(400)
        .json({ message: "meet_name and meet_date are required" });
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

app.delete(
  "/api/meets/:id",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const meetId = Number(req.params.id);
    if (!Number.isInteger(meetId) || meetId <= 0) {
      return res.status(400).json({ message: "Invalid meet id" });
    }

    try {
      const [result] = await pool.query("DELETE FROM meets WHERE id = ?", [
        meetId,
      ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Meet not found" });
      }
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({
        message: "Failed to delete meet",
        error: error.message,
      });
    }
  },
);

app.post(
  "/api/meets/:id/delete",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const meetId = Number(req.params.id);
    if (!Number.isInteger(meetId) || meetId <= 0) {
      return res.status(400).json({ message: "Invalid meet id" });
    }

    try {
      const [result] = await pool.query("DELETE FROM meets WHERE id = ?", [
        meetId,
      ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Meet not found" });
      }
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({
        message: "Failed to delete meet",
        error: error.message,
      });
    }
  },
);

app.put(
  "/api/meets/:id",
  authenticate,
  requireRole("admin", "coach"),
  async (req, res) => {
    const meetId = Number(req.params.id);
    if (!Number.isInteger(meetId) || meetId <= 0) {
      return res.status(400).json({ message: "Invalid meet id" });
    }

    const meetName = String(
      req.body && req.body.meet_name ? req.body.meet_name : "",
    ).trim();
    const startDate = normalizeDateOnly(req.body && req.body.start_date);
    const endDate = normalizeDateOnly(req.body && req.body.end_date);
    const location = String(
      req.body && req.body.location ? req.body.location : "",
    ).trim();
    const hostTeam = String(
      req.body && req.body.host_team ? req.body.host_team : "",
    ).trim();

    if (!meetName || !startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "meet_name, start_date, and end_date are required" });
    }

    if (startDate > endDate) {
      return res
        .status(400)
        .json({ message: "start_date must be before or equal to end_date" });
    }

    try {
      // Generate all dates in range
      const allDates = [];
      const current = new Date(startDate + "T00:00:00Z");
      const end = new Date(endDate + "T00:00:00Z");

      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        allDates.push(dateStr);
        current.setUTCDate(current.getUTCDate() + 1);
      }

      // Update meet with first date as meet_date (for backward compatibility)
      const [result] = await pool.query(
        `UPDATE meets
         SET meet_name = ?,
             meet_date = ?,
             location = ?,
             host_team = ?
         WHERE id = ?`,
        [meetName, startDate, location || null, hostTeam || null, meetId],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Meet not found" });
      }

      // Delete existing meet_days and recreate from date range
      await pool.query("DELETE FROM meet_days WHERE meet_id = ?", [meetId]);

      if (allDates.length > 0) {
        const dayValues = allDates.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const dayParams = allDates.flatMap((date) => [
          meetId,
          date,
          "",
          null,
          null,
        ]);

        await pool.query(
          `INSERT INTO meet_days (meet_id, meet_day, session_label, age_group, gender)
           VALUES ${dayValues}
           ON DUPLICATE KEY UPDATE meet_day = VALUES(meet_day)`,
          dayParams,
        );
      }

      const [rows] = await pool.query(
        `SELECT id, meet_name, meet_date, location, host_team, created_at
         FROM meets
         WHERE id = ?
         LIMIT 1`,
        [meetId],
      );

      return res.json({
        message: "Meet info updated",
        meet: rows[0],
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to update meet",
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
      const eligibility = await getMeetEligibilityForSwimmers(
        meet.id,
        swimmerIds,
        meet.meet_date,
      );
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
      `SELECT id, meet_name, meet_date, location, host_team, import_filename, start_date, end_date, created_at
       FROM meets
       WHERE id = ?
       LIMIT 1`,
      [meetId],
    );

    if (!meetRows.length) {
      return res.status(404).json({ message: "Meet not found" });
    }

    const [days] = await pool.query(
      `SELECT meet_day, session_label, age_group, gender
       FROM meet_days
       WHERE meet_id = ?
       ORDER BY meet_day ASC, session_label ASC`,
      [meetId],
    );
    const [events] = await pool.query(
      `SELECT id, event_name, stroke, distance_meters, course, age_group, gender,
              is_selected, qualifying_time_seconds, qualifying_time_text
       FROM meet_events
       WHERE meet_id = ?
       ORDER BY id ASC`,
      [meetId],
    );

    // Fallback: if meet_days are missing or only one generic day, try to reconstruct
    // session-level meet_days from event_name session prefixes like "[Friday PM] ..."
    let returnedDays = Array.isArray(days) ? days : [];
    try {
      if (returnedDays.length <= 1 && Array.isArray(events) && events.length) {
        const sessionLabels = new Map();
        events.forEach((ev) => {
          const m = String(ev.event_name || "").match(/^\[([^\]]+)\]/);
          if (m && m[1]) sessionLabels.set(m[1].trim(), true);
        });

        if (sessionLabels.size > 0) {
          const baseDate =
            meetRows[0] && (meetRows[0].start_date || meetRows[0].meet_date)
              ? meetRows[0].start_date || meetRows[0].meet_date
              : null;
          const reconstructed = [];
          for (const label of sessionLabels.keys()) {
            // Expect labels like "Friday PM" or "Saturday MID"
            const parts = String(label).split(/\s+/).filter(Boolean);
            const dayName = parts.length ? parts[0] : null;
            const periodRaw = parts.length > 1 ? parts.slice(1).join(" ") : "";
            if (!dayName) continue;
            const normalizedPeriod = normalizeInviteSessionPeriod(periodRaw);
            const meet_day = baseDate
              ? addDaysToDateOnly(
                  baseDate,
                  getDayOffsetFromDate(baseDate, dayName),
                )
              : null;
            if (!meet_day) continue;
            reconstructed.push({
              meet_day,
              session_label: `${dayName} ${normalizedPeriod}`.trim(),
              age_group: null,
              gender: null,
            });
          }
          if (reconstructed.length) {
            returnedDays = normalizeMeetDayEntries(
              reconstructed,
              meetRows[0] && (meetRows[0].start_date || meetRows[0].meet_date),
            );
            console.log(
              "🔍 Reconstructed meet_days from events:",
              returnedDays.map((d) => ({
                meet_day: d.meet_day,
                session_label: d.session_label,
              })),
            );
          }
        }
      }
    } catch (reconErr) {
      console.log(
        "⚠️ Failed to reconstruct meet_days from events:",
        reconErr && reconErr.message ? reconErr.message : reconErr,
      );
    }

    let swimmerIds = [];
    if (req.user.role === "admin" || req.user.role === "coach") {
      const [swimmerRows] = await pool.query(
        "SELECT id FROM swimmers ORDER BY id ASC",
      );
      swimmerIds = swimmerRows.map((row) => Number(row.id));
    } else {
      swimmerIds = await getAccessibleSwimmerIdsForUser(req.user);
    }

    const accessibleSwimmerIds = [
      ...new Set(
        swimmerIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    const eligibility = await getMeetEligibilityForSwimmers(
      meetId,
      accessibleSwimmerIds,
      meetRows[0].meet_date,
    );

    if (
      (req.user.role === "swimmer" || req.user.role === "parent") &&
      accessibleSwimmerIds.length === 0
    ) {
      return res.status(404).json({ message: "Meet not found" });
    }

    const visibleSwimmerIds = eligibility.visibleSwimmerIds;
    const declarationSwimmerIds = accessibleSwimmerIds;

    const swimmerRows = await getSwimmerRowsByIds(declarationSwimmerIds);

    // Fetch best times for declaration swimmers so UI can show entry times
    let bestTimesRows = [];
    if (declarationSwimmerIds && declarationSwimmerIds.length) {
      try {
        const [btRows] = await pool.query(
          `SELECT sbt.swimmer_id, sbt.stroke, sbt.distance_meters, sbt.course, sbt.best_time_seconds, sbt.best_time_text
           FROM swimmer_best_times sbt
           WHERE sbt.swimmer_id IN (${declarationSwimmerIds.map(() => "?").join(",")})`,
          declarationSwimmerIds,
        );
        bestTimesRows = btRows;
      } catch (btErr) {
        console.warn(
          "Failed to fetch swimmer best times:",
          btErr && btErr.message ? btErr.message : btErr,
        );
        bestTimesRows = [];
      }
    }

    let declarations = [];
    if (declarationSwimmerIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT md.meet_day, md.session_label, md.age_group, md.gender,
                d.swimmer_id, d.status, d.note, u.name AS swimmer_name
         FROM meet_declarations d
         JOIN meet_days md
           ON md.meet_id = d.meet_id
          AND md.meet_day = d.meet_day
          AND md.session_label <=> d.session_label
         JOIN swimmers s ON s.id = d.swimmer_id
         JOIN users u ON u.id = s.user_id
         WHERE d.meet_id = ?
           AND d.swimmer_id IN (${declarationSwimmerIds.map(() => "?").join(",")})
         ORDER BY md.meet_day ASC, md.session_label ASC, u.name ASC`,
        [meetId, ...declarationSwimmerIds],
      );
      declarations = rows;
    }

    let entries = [];
    if (declarationSwimmerIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT me.swimmer_id, me.meet_event_id
         FROM meet_entries me
         JOIN meet_events e ON e.id = me.meet_event_id
         WHERE e.meet_id = ?
           AND me.swimmer_id IN (${declarationSwimmerIds.map(() => "?").join(",")})`,
        [meetId, ...declarationSwimmerIds],
      );
      entries = rows;
    }

    const declarationEligibility = [];
    const swimmerById = new Map(
      swimmerRows.map((row) => [Number(row.swimmer_id), row]),
    );

    // Group events by session for easier lookup
    const eventsBySession = new Map();
    events.forEach((event) => {
      // Extract session label from event_name or use parsed session_label if available
      let sessionLabel = "";
      const parsed = String(event.event_name || "").match(/^\[([^\]]+)\]/);
      if (parsed) {
        sessionLabel = parsed[1];
      }

      const key = `${sessionLabel}`;
      if (!eventsBySession.has(key)) {
        eventsBySession.set(key, []);
      }
      eventsBySession.get(key).push(event);
    });

    console.log(
      "🔍 Events by session:",
      Array.from(eventsBySession.entries()).map(([label, evts]) => ({
        session_label: label,
        event_count: evts.length,
      })),
    );

    for (const swimmerId of declarationSwimmerIds) {
      const swimmer = swimmerById.get(Number(swimmerId));
      if (!swimmer) continue;

      for (const day of days) {
        // Check if swimmer is eligible for this session by checking events in the session
        const sessionKey = String(day.session_label || "").trim();
        const sessionEvents = eventsBySession.get(sessionKey) || [];

        let allowed = false;
        if (sessionEvents.length > 0) {
          // Check if any event in this session is eligible for the swimmer
          allowed = sessionEvents.some((event) => {
            const effectiveGender =
              event.gender || extractGenderFromText(event.event_name || "");
            const effectiveAgeGroup =
              event.age_group ||
              extractAgeGroupFromText(event.event_name || "");

            return (
              genderMatches(effectiveGender, swimmer.gender) &&
              ageMatches(effectiveAgeGroup, swimmer.date_of_birth, day.meet_day)
            );
          });
        } else if (day.age_group || day.gender) {
          // Fallback: if no events in session, check session constraints
          allowed =
            genderMatches(day.gender, swimmer.gender) &&
            ageMatches(day.age_group, swimmer.date_of_birth, day.meet_day);
        } else {
          // No events and no session constraints = open to everyone
          allowed = true;
        }

        declarationEligibility.push({
          swimmer_id: Number(swimmerId),
          meet_day: day.meet_day,
          session_label: day.session_label || "",
          allowed,
        });
      }
    }

    return res.json({
      meet: meetRows[0],
      days: returnedDays,
      events,
      swimmers: swimmerRows,
      best_times: bestTimesRows,
      eligibility: Array.from(eligibility.eligibilityBySwimmerId.values()),
      declaration_eligibility: declarationEligibility,
      declarations,
      entries,
      can_select_events: req.user.role === "admin" || req.user.role === "coach",
      can_declare:
        req.user.role === "swimmer" ||
        req.user.role === "parent" ||
        req.user.role === "coach" ||
        req.user.role === "admin",
      can_manage_entries:
        req.user.role === "admin" || req.user.role === "coach",
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
    const eventIdsInput = Array.isArray(req.body.event_ids)
      ? req.body.event_ids
      : [];
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

      await connection.query(
        "UPDATE meet_events SET is_selected = 0 WHERE meet_id = ?",
        [meetId],
      );

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
  requireRole("swimmer", "parent", "coach", "admin"),
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
      let accessibleSwimmerIds = [];
      if (req.user.role === "coach" || req.user.role === "admin") {
        const [swimmerRows] = await pool.query(
          "SELECT id FROM swimmers ORDER BY id ASC",
        );
        accessibleSwimmerIds = swimmerRows.map((row) => Number(row.id));
      } else {
        accessibleSwimmerIds = await getAccessibleSwimmerIdsForUser(req.user);
      }
      if (
        !Array.isArray(accessibleSwimmerIds) ||
        accessibleSwimmerIds.length === 0
      ) {
        return res
          .status(403)
          .json({ message: "No swimmers available for declarations" });
      }

      const [meetDayRows] = await pool.query(
        "SELECT meet_day, session_label, age_group, gender FROM meet_days WHERE meet_id = ?",
        [meetId],
      );
      const meetDayMap = new Map(
        meetDayRows.map((row) => [
          `${normalizeDateOnly(row.meet_day)}|${normalizeSessionLabel(row.session_label)}`,
          row,
        ]),
      );

      if (!meetDayMap.size) {
        return res
          .status(400)
          .json({ message: "No meet days configured for this meet" });
      }

      const eligibility = await getMeetEligibilityForSwimmers(
        meetId,
        accessibleSwimmerIds,
        meetDayRows.length ? meetDayRows[0].meet_day : null,
      );

      if (!eligibility.visibleSwimmerIds.length) {
        return res
          .status(403)
          .json({ message: "No qualified swimmers for this meet" });
      }

      const swimmerRows = await getSwimmerRowsByIds(accessibleSwimmerIds);
      const swimmerById = new Map(
        swimmerRows.map((row) => [Number(row.swimmer_id), row]),
      );

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

          const meetDay = normalizeDateOnly(entry.meet_day || entry.day);
          const sessionLabel = normalizeSessionLabel(entry.session_label || "");

          let sessionRowsForEntry = [];
          if (meetDay && sessionLabel) {
            const sessionKey = `${meetDay}|${sessionLabel}`;
            const sessionRow = meetDayMap.get(sessionKey);
            if (sessionRow) {
              sessionRowsForEntry = [sessionRow];
            }
          } else if (meetDay) {
            sessionRowsForEntry = meetDayRows.filter(
              (row) => normalizeDateOnly(row.meet_day) === meetDay,
            );
          }

          if (!meetDay || !sessionRowsForEntry.length) {
            await connection.rollback();
            return res.status(400).json({
              message: `Invalid meet day/session: ${entry.meet_day || entry.day || ""} ${sessionLabel}`,
            });
          }

          const status = String(entry.status || "")
            .trim()
            .toLowerCase();
          if (!validStatuses.has(status)) {
            await connection.rollback();
            return res
              .status(400)
              .json({ message: `Invalid status: ${entry.status}` });
          }

          const note =
            typeof entry.note === "string" ? entry.note.trim() : null;

          const swimmer = swimmerById.get(swimmerId);
          for (const sessionRow of sessionRowsForEntry) {
            const resolvedSessionLabel = normalizeSessionLabel(
              sessionRow.session_label || "",
            );
            const allowedForSession =
              swimmer &&
              genderMatches(sessionRow.gender, swimmer.gender) &&
              ageMatches(sessionRow.age_group, swimmer.date_of_birth, meetDay);

            if (status === "yes" && !allowedForSession) {
              await connection.rollback();
              return res.status(400).json({
                message: `Swimmer is not eligible for session declaration: ${entry.swimmer_id}`,
              });
            }

            await connection.query(
              `INSERT INTO meet_declarations
                 (meet_id, swimmer_id, meet_day, session_label, status, note, declared_by_user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 status = VALUES(status),
                 note = VALUES(note),
                 declared_by_user_id = VALUES(declared_by_user_id),
                 updated_at = CURRENT_TIMESTAMP`,
              [
                meetId,
                swimmerId,
                meetDay,
                resolvedSessionLabel,
                status,
                note || null,
                req.user.sub,
              ],
            );
          }
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

app.put(
  "/api/meets/:id/entries",
  authenticate,
  requireRole("coach", "admin"),
  async (req, res) => {
    const meetId = Number(req.params.id);
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

    if (Number.isNaN(meetId)) {
      return res.status(400).json({ message: "Invalid meet id" });
    }

    if (!entries.length) {
      return res.status(400).json({ message: "entries are required" });
    }

    try {
      const [swimmerRows] = await pool.query(
        "SELECT id FROM swimmers ORDER BY id ASC",
      );
      const swimmerIds = swimmerRows.map((row) => Number(row.id));

      const [meetRows] = await pool.query(
        "SELECT meet_date FROM meets WHERE id = ? LIMIT 1",
        [meetId],
      );
      if (!meetRows.length) {
        return res.status(404).json({ message: "Meet not found" });
      }

      const [eventRows] = await pool.query(
        "SELECT id FROM meet_events WHERE meet_id = ?",
        [meetId],
      );
      const meetEventIds = new Set(eventRows.map((row) => Number(row.id)));

      const [declaredRows] = await pool.query(
        `SELECT DISTINCT swimmer_id
         FROM meet_declarations
         WHERE meet_id = ? AND status = 'yes'`,
        [meetId],
      );
      const declaredYesSet = new Set(
        declaredRows.map((row) => Number(row.swimmer_id)),
      );

      const eligibility = await getMeetEligibilityForSwimmers(
        meetId,
        swimmerIds,
        meetRows[0].meet_date,
      );
      const eligibleBySwimmerId = new Map(
        Array.from(eligibility.eligibilityBySwimmerId.values()).map((row) => [
          Number(row.swimmer_id),
          new Set((row.eligible_event_ids || []).map((id) => Number(id))),
        ]),
      );

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        for (const entry of entries) {
          const swimmerId = Number(entry && entry.swimmer_id);
          const eventIds = Array.isArray(entry && entry.event_ids)
            ? [
                ...new Set(
                  entry.event_ids
                    .map((id) => Number(id))
                    .filter((id) => Number.isInteger(id) && id > 0),
                ),
              ]
            : [];

          if (!Number.isInteger(swimmerId) || !declaredYesSet.has(swimmerId)) {
            await connection.rollback();
            return res.status(400).json({
              message: `Swimmer must declare yes before event sign-up: ${entry && entry.swimmer_id}`,
            });
          }

          const eligibleSet = eligibleBySwimmerId.get(swimmerId) || new Set();
          for (const eventId of eventIds) {
            if (!meetEventIds.has(eventId)) {
              await connection.rollback();
              return res.status(400).json({
                message: `Event does not belong to this meet: ${eventId}`,
              });
            }
            if (!eligibleSet.has(eventId)) {
              await connection.rollback();
              return res.status(400).json({
                message: `Swimmer is not eligible for event ${eventId}: ${swimmerId}`,
              });
            }
          }

          await connection.query(
            `DELETE me
             FROM meet_entries me
             JOIN meet_events e ON e.id = me.meet_event_id
             WHERE e.meet_id = ? AND me.swimmer_id = ?`,
            [meetId, swimmerId],
          );

          for (const eventId of eventIds) {
            await connection.query(
              `INSERT INTO meet_entries (meet_event_id, swimmer_id)
               VALUES (?, ?)
               ON DUPLICATE KEY UPDATE meet_event_id = VALUES(meet_event_id)`,
              [eventId, swimmerId],
            );
          }
        }

        await connection.commit();
        return res.json({ message: "Event sign-ups saved" });
      } finally {
        connection.release();
      }
    } catch (error) {
      return res.status(500).json({
        message: "Failed to save event sign-ups",
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
      return res
        .status(400)
        .json({ message: "Valid distance_meters is required" });
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
      content = await getImportedTextFromPayload(payload);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    let rows;
    try {
      const text = content.trim();
      if (text.startsWith("[") || text.startsWith("{")) {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.rows)
            ? parsed.rows
            : [];
      } else {
        rows = parseCsvToObjects(text);
      }
    } catch (error) {
      return res
        .status(400)
        .json({ message: `Invalid file: ${error.message}` });
    }

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ message: "No time rows found" });
    }

    const importFileName = String(
      payload && payload.file_name
        ? payload.file_name
        : req.headers["x-file-name"] || "",
    );
    const requestedDefaultSwimmerId = Number(
      payload && payload.default_swimmer_id
        ? payload.default_swimmer_id
        : req.headers["x-default-swimmer-id"] || 0,
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
        const swimmerName = firstNonEmpty(
          row,
          ["swimmer_name", "swimmer", "name", "athlete"],
          "",
        );
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

        if (
          !swimmerId ||
          !stroke ||
          !distanceMeters ||
          bestTimeSeconds == null
        ) {
          skipped.push({
            row: i + 1,
            reason: "Missing swimmer/stroke/distance/time",
          });
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
