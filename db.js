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
      gender VARCHAR(20) NULL,
      date_of_birth DATE NULL,
      address VARCHAR(255) NULL,
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

  try {
    await admin.query("ALTER TABLE users ADD COLUMN gender VARCHAR(20) NULL AFTER role");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

  try {
    await admin.query("ALTER TABLE users ADD COLUMN date_of_birth DATE NULL AFTER gender");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

  try {
    await admin.query("ALTER TABLE users ADD COLUMN address VARCHAR(255) NULL AFTER date_of_birth");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }
}

async function seedUsers(admin) {
  const demoUsers = [
    { name: "Alex Admin", email: "admin@swimsync.com", password: "Admin123!", role: "admin", gender: "male", date_of_birth: "1990-02-01", address: "123 Admin Way" },
    { name: "Casey Coach", email: "coach@swimsync.com", password: "Coach123!", role: "coach", gender: "female", date_of_birth: "1992-05-12", address: "456 Coach Ave" },
    { name: "Sam Swimmer", email: "swimmer@swimsync.com", password: "Swimmer123!", role: "swimmer", gender: "female", date_of_birth: "2011-06-14", address: "789 Swim Ln" },
    { name: "Pat Parent", email: "parent@swimsync.com", password: "Parent123!", role: "parent", gender: "male", date_of_birth: "1985-10-20", address: "321 Parent St" }
  ];

  for (const user of demoUsers) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await admin.query(
      `INSERT INTO users (name, email, password_hash, role, gender, date_of_birth, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         password_hash = VALUES(password_hash),
         role = VALUES(role),
         gender = VALUES(gender),
         date_of_birth = VALUES(date_of_birth),
         address = VALUES(address)`,
      [
        user.name,
        user.email,
        passwordHash,
        user.role,
        user.gender,
        user.date_of_birth,
        user.address,
      ]
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

async function seedParentSwimmerLinks(admin) {
  const [parents] = await admin.query(
    `SELECT p.id, u.email
     FROM parents p
     JOIN users u ON p.user_id = u.id`
  );

  const [swimmers] = await admin.query(
    `SELECT s.id, u.email
     FROM swimmers s
     JOIN users u ON s.user_id = u.id`
  );

  const parentByEmail = new Map(parents.map((parent) => [parent.email, parent.id]));
  const swimmerByEmail = new Map(swimmers.map((swimmer) => [swimmer.email, swimmer.id]));

  const demoParentId = parentByEmail.get("parent@swimsync.com");
  const demoSwimmerId = swimmerByEmail.get("swimmer@swimsync.com");

  if (demoParentId && demoSwimmerId) {
    await admin.query(
      `INSERT IGNORE INTO parent_swimmers (parent_id, swimmer_id, relationship, is_primary)
       VALUES (?, ?, ?, ?)`,
      [demoParentId, demoSwimmerId, "guardian", 1]
    );
  }
}

async function seedPracticeGroups(admin) {
  const defaultGroups = [
    { group_name: "Junior 1", level: "Junior" },
    { group_name: "Junior 2", level: "Junior" },
    { group_name: "Senior 1", level: "Senior" },
    { group_name: "Senior 2", level: "Senior" }
  ];

  for (const group of defaultGroups) {
    await admin.query(
      `INSERT INTO practice_groups (group_name, level, coach_id)
       SELECT ?, ?, NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM practice_groups WHERE group_name = ? LIMIT 1
       )`,
      [group.group_name, group.level, group.group_name]
    );
  }
}

async function seedSwimmerGroups(admin) {
  const [groupRows] = await admin.query(
    "SELECT id FROM practice_groups WHERE group_name = ? LIMIT 1",
    ["Junior 1"]
  );

  if (groupRows.length === 0) {
    return;
  }

  const [swimmerRows] = await admin.query(
    `SELECT s.id
     FROM swimmers s
     JOIN users u ON s.user_id = u.id
     WHERE u.email = ?
     LIMIT 1`,
    ["swimmer@swimsync.com"]
  );

  if (swimmerRows.length === 0) {
    return;
  }

  await admin.query(
    `INSERT INTO swimmer_groups (swimmer_id, group_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE group_id = VALUES(group_id)`,
    [swimmerRows[0].id, groupRows[0].id]
  );
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
    CREATE TABLE IF NOT EXISTS parent_swimmers (
      parent_id INT NOT NULL,
      swimmer_id INT NOT NULL,
      relationship VARCHAR(30) NULL,
      is_primary TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (parent_id, swimmer_id),
      CONSTRAINT fk_parent_swimmers_parent
        FOREIGN KEY (parent_id) REFERENCES parents(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_parent_swimmers_swimmer
        FOREIGN KEY (swimmer_id) REFERENCES swimmers(id)
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
    CREATE TABLE IF NOT EXISTS swimmer_groups (
      swimmer_id INT NOT NULL PRIMARY KEY,
      group_id INT NOT NULL,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_swimmer_groups_swimmer
        FOREIGN KEY (swimmer_id) REFERENCES swimmers(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_swimmer_groups_group
        FOREIGN KEY (group_id) REFERENCES practice_groups(id)
        ON DELETE CASCADE ON UPDATE CASCADE
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

  try {
    await admin.query(
      "ALTER TABLE meet_events ADD COLUMN is_selected TINYINT(1) NOT NULL DEFAULT 0 AFTER gender",
    );
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

  try {
    await admin.query(
      "ALTER TABLE meet_events ADD COLUMN qualifying_time_seconds DECIMAL(8,2) NULL AFTER is_selected",
    );
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

  try {
    await admin.query(
      "ALTER TABLE meet_events ADD COLUMN qualifying_time_text VARCHAR(20) NULL AFTER qualifying_time_seconds",
    );
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }

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

  await admin.query(`
    CREATE TABLE IF NOT EXISTS meet_days (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meet_id INT NOT NULL,
      meet_day DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_meet_days UNIQUE (meet_id, meet_day),
      CONSTRAINT fk_meet_days_meet
        FOREIGN KEY (meet_id) REFERENCES meets(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS swimmer_best_times (
      id INT AUTO_INCREMENT PRIMARY KEY,
      swimmer_id INT NOT NULL,
      stroke VARCHAR(40) NOT NULL,
      distance_meters INT NOT NULL,
      course VARCHAR(20) NULL,
      best_time_seconds DECIMAL(8,2) NOT NULL,
      best_time_text VARCHAR(20) NULL,
      achieved_on DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT uq_swimmer_best_times UNIQUE (swimmer_id, stroke, distance_meters, course),
      CONSTRAINT fk_swimmer_best_times_swimmer
        FOREIGN KEY (swimmer_id) REFERENCES swimmers(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS meet_declarations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      meet_id INT NOT NULL,
      swimmer_id INT NOT NULL,
      meet_day DATE NOT NULL,
      status ENUM('yes', 'no', 'maybe') NOT NULL DEFAULT 'maybe',
      note VARCHAR(255) NULL,
      declared_by_user_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT uq_meet_declaration UNIQUE (meet_id, swimmer_id, meet_day),
      CONSTRAINT fk_meet_declarations_meet
        FOREIGN KEY (meet_id) REFERENCES meets(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_meet_declarations_swimmer
        FOREIGN KEY (swimmer_id) REFERENCES swimmers(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_meet_declarations_user
        FOREIGN KEY (declared_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await seedUsers(admin);
  await seedRoleTables(admin);
  await seedParentSwimmerLinks(admin);
  await seedPracticeGroups(admin);
  await seedSwimmerGroups(admin);

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
