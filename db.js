const mysql = require("mysql2/promise");

async function createAdminConnection(config) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password
  });
}

async function initDatabase(config) {
  const admin = await createAdminConnection(config);

  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
  await admin.query(`USE \`${config.database}\``);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [rows] = await admin.query("SELECT COUNT(*) AS count FROM users");
  if (rows[0].count === 0) {
    await admin.query(
      `INSERT INTO users (name, email) VALUES
       (?, ?),
       (?, ?),
       (?, ?)` ,
      [
        "Liam Waters", "liam@example.com",
        "Maya Lane", "maya@example.com",
        "Noah Brooks", "noah@example.com"
      ]
    );
  }

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
