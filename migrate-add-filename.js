const mysql = require('mysql2/promise');

async function migrate() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'swimsync',
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0,
  });

  try {
    const connection = await pool.getConnection();
    
    console.log('Running migration: Adding import_filename column...');
    await connection.query(
      `ALTER TABLE meets ADD COLUMN IF NOT EXISTS import_filename VARCHAR(255) NULL`
    );
    console.log('✓ Migration completed successfully');
    
    connection.release();
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
