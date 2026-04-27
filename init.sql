CREATE DATABASE IF NOT EXISTS hello_db;
USE hello_db;

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
);

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
);

CREATE TABLE IF NOT EXISTS parents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  emergency_contact VARCHAR(150) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_parents_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS coaches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  certification VARCHAR(120) NULL,
  years_experience INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coaches_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS practice_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_name VARCHAR(120) NOT NULL,
  coach_id INT NULL,
  level VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_practice_groups_coach
    FOREIGN KEY (coach_id) REFERENCES coaches(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

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
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS meet_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  meet_id INT NOT NULL,
  event_name VARCHAR(150) NOT NULL,
  stroke VARCHAR(40) NULL,
  distance_meters INT NULL,
  age_group VARCHAR(40) NULL,
  gender VARCHAR(20) NULL,
  is_selected TINYINT(1) NOT NULL DEFAULT 0,
  qualifying_time_seconds DECIMAL(8,2) NULL,
  qualifying_time_text VARCHAR(20) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_meet_events_meet
    FOREIGN KEY (meet_id) REFERENCES meets(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS meet_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  meet_id INT NOT NULL,
  meet_day DATE NOT NULL,
  session_label VARCHAR(40) NOT NULL DEFAULT '',
  age_group VARCHAR(40) NULL,
  gender VARCHAR(20) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_meet_days UNIQUE (meet_id, meet_day, session_label),
  CONSTRAINT fk_meet_days_meet
    FOREIGN KEY (meet_id) REFERENCES meets(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS meet_declarations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  meet_id INT NOT NULL,
  swimmer_id INT NOT NULL,
  meet_day DATE NOT NULL,
  session_label VARCHAR(40) NOT NULL DEFAULT '',
  status ENUM('yes', 'no', 'maybe') NOT NULL DEFAULT 'maybe',
  note VARCHAR(255) NULL,
  declared_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_meet_declaration UNIQUE (meet_id, swimmer_id, meet_day, session_label),
  CONSTRAINT fk_meet_declarations_meet
    FOREIGN KEY (meet_id) REFERENCES meets(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_meet_declarations_swimmer
    FOREIGN KEY (swimmer_id) REFERENCES swimmers(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_meet_declarations_user
    FOREIGN KEY (declared_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

  INSERT INTO practice_groups (group_name, level, coach_id)
  SELECT 'Junior 1', 'Junior', NULL
  WHERE NOT EXISTS (SELECT 1 FROM practice_groups WHERE group_name = 'Junior 1' LIMIT 1);

  INSERT INTO practice_groups (group_name, level, coach_id)
  SELECT 'Junior 2', 'Junior', NULL
  WHERE NOT EXISTS (SELECT 1 FROM practice_groups WHERE group_name = 'Junior 2' LIMIT 1);

  INSERT INTO practice_groups (group_name, level, coach_id)
  SELECT 'Senior 1', 'Senior', NULL
  WHERE NOT EXISTS (SELECT 1 FROM practice_groups WHERE group_name = 'Senior 1' LIMIT 1);

  INSERT INTO practice_groups (group_name, level, coach_id)
  SELECT 'Senior 2', 'Senior', NULL
  WHERE NOT EXISTS (SELECT 1 FROM practice_groups WHERE group_name = 'Senior 2' LIMIT 1);

  INSERT INTO swimmer_groups (swimmer_id, group_id)
  SELECT s.id, pg.id
  FROM swimmers s
  JOIN users u ON s.user_id = u.id
  JOIN practice_groups pg ON pg.group_name = 'Junior 1'
  WHERE u.email = 'swimmer@swimsync.com'
  ON DUPLICATE KEY UPDATE group_id = VALUES(group_id);

-- Seed data is inserted by the Node app on first boot so passwords can be bcrypt-hashed.
