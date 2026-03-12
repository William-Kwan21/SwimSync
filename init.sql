CREATE DATABASE IF NOT EXISTS hello_db;
USE hello_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  role ENUM('admin','coach','swimmer','parent') NOT NULL DEFAULT 'swimmer',
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

-- Seed data is inserted by the Node app on first boot so passwords can be bcrypt-hashed.
