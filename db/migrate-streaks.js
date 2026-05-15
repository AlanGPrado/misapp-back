import pool from './index.js';

async function setupStreaks() {
  console.log('🔄 Iniciando migracion de la base de datos...');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_checkins (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          checkin_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, checkin_date)
      );
    `);
    console.log('✅ Tablas y esquema creados correctamente.');
  } catch (err) {
    console.error('❌ Error configurando la base de datos:', err.message);
  } finally {
    await pool.end();
  }
}

setupStreaks();
