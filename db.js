const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

async function createAdminConnection(config) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password
  });
}

async function ensureUsersTable(admin) {
  await admin.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NULL,
      role ENUM('admin','coach','swimmer','parent') NOT NULL DEFAULT 'swimmer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await admin.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

  try {
    await admin.query("ALTER TABLE users ADD COLUMN role ENUM('admin','coach','swimmer','parent') NOT NULL DEFAULT 'swimmer' AFTER password_hash");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }
}

async function seedUsers(admin) {
  const [rows] = await admin.query("SELECT COUNT(*) AS count FROM users");
  if (rows[0].count > 0) {
    return;
  }

  const demoUsers = [
    { name: "Alex Admin", email: "admin@swimsync.com", password: "Admin123!", role: "admin" },
    { name: "Casey Coach", email: "coach@swimsync.com", password: "Coach123!", role: "coach" },
    { name: "Sam Swimmer", email: "swimmer@swimsync.com", password: "Swimmer123!", role: "swimmer" },
    { name: "Pat Parent", email: "parent@swimsync.com", password: "Parent123!", role: "parent" }
  ];

  for (const user of demoUsers) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await admin.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [user.name, user.email, passwordHash, user.role]
    );
  }
}

async function seedRoleTables(admin) {
  const [allUsers] = await admin.query("SELECT id, role FROM users ORDER BY id ASC");

  for (const user of allUsers) {
    if (user.role === "swimmer") {
      await admin.query(
        `INSERT IGNORE INTO swimmers (user_id, date_of_birth, gender, skill_level)
         VALUES (?, ?, ?, ?)`,
        [user.id, "2011-06-14", "Female", "Intermediate"]
      );
    }

    if (user.role === "parent") {
      await admin.query(
        `INSERT IGNORE INTO parents (user_id, phone, emergency_contact)
         VALUES (?, ?, ?)`,
        [user.id, "555-0101", "Jamie Parent"]
      );
    }

    if (user.role === "coach" || user.role === "admin") {
      await admin.query(
        `INSERT IGNORE INTO coaches (user_id, certification, years_experience)
         VALUES (?, ?, ?)`,
        [user.id, "USA Swimming Level 2", 5]
      );
    }
  }
}

async function initDatabase(config) {
  const admin = await createAdminConnection(config);

  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
  await admin.query(`USE \`${config.database}\``);

  await ensureUsersTable(admin);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS swimmers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      date_of_birth DATE NULL,
      gender VARCHAR(20) NULL,
      skill_level VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_swimmers_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS parents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      phone VARCHAR(30) NULL,
      emergency_contact VARCHAR(150) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_parents_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS coaches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      certification VARCHAR(120) NULL,
      years_experience INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_coaches_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS practice_groups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_name VARCHAR(120) NOT NULL,
      coach_id INT NULL,
      level VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_practice_groups_coach
        FOREIGN KEY (coach_id) REFERENCES coaches(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS practice_schedule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      practice_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      location VARCHAR(150) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_practice_schedule_group
        FOREIGN KEY (group_id) REFERENCES practice_groups(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      swimmer_id INT NOT NULL,
      schedule_id INT NOT NULL,
      status ENUM('present', 'absent', 'late', 'excused') NOT NULL DEFAULT 'present',
      note VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_attendance_swimmer_schedule UNIQUE (swimmer_id, schedule_id),
      CONSTRAINT fk_attendance_swimmer
        FOREIGN KEY (swimmer_id) REFERENCES swimmers(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_attendance_schedule
        FOREIGN KEY (schedule_id) REFERENCES practice_schedule(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS meets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meet_name VARCHAR(150) NOT NULL,
      meet_date DATE NOT NULL,
      location VARCHAR(150) NULL,
      host_team VARCHAR(120) NULL,
      created_by_coach_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_meets_created_by_coach
        FOREIGN KEY (created_by_coach_id) REFERENCES coaches(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS meet_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meet_id INT NOT NULL,
      event_name VARCHAR(150) NOT NULL,
      stroke VARCHAR(40) NULL,
      distance_meters INT NULL,
      age_group VARCHAR(40) NULL,
      gender VARCHAR(20) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_meet_events_meet
        FOREIGN KEY (meet_id) REFERENCES meets(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS meet_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meet_event_id INT NOT NULL,
      swimmer_id INT NOT NULL,
      seed_time VARCHAR(20) NULL,
      result_time VARCHAR(20) NULL,
      place_finished INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_meet_entries_event_swimmer UNIQUE (meet_event_id, swimmer_id),
      CONSTRAINT fk_meet_entries_event
        FOREIGN KEY (meet_event_id) REFERENCES meet_events(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_meet_entries_swimmer
        FOREIGN KEY (swimmer_id) REFERENCES swimmers(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await seedUsers(admin);
  await seedRoleTables(admin);

  await admin.end();

  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10
  });
}

module.exports = { initDatabase };
