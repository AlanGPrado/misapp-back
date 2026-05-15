import pool from './index.js';

async function setupBadges() {
  console.log('🔄 Iniciando migracion de la base de datos de insignias...');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_badges (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          badge_id VARCHAR(50) NOT NULL,
          unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, badge_id)
      );
    `);
    console.log('✅ Tabla user_badges creada correctamente.');
  } catch (err) {
    console.error('❌ Error configurando la base de datos:', err.message);
  } finally {
    await pool.end();
  }
}

setupBadges();
