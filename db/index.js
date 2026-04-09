import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// You can use a connection string or individual parameters
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
}) : null;

export const query = (text, params) => {
  if (!pool) {
    console.error("❌ Error: No se puede ejecutar consulta. Base de Datos NO configurada.");
    throw new Error("Base de datos no configurada");
  }
  return pool.query(text, params);
};

export default pool;
