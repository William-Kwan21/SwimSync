CREATE DATABASE IF NOT EXISTS hello_db;
USE hello_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email)
SELECT * FROM (
  SELECT 'Liam Waters', 'liam@example.com' UNION ALL
  SELECT 'Maya Lane', 'maya@example.com' UNION ALL
  SELECT 'Noah Brooks', 'noah@example.com'
) AS temp
WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1);
