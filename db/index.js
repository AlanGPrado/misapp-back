import pg from 'pg';

const { Pool } = pg;

// You can use a connection string or individual parameters
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('neon.tech') 
    ? { rejectUnauthorized: false } 
    : false,
});

export const query = (text, params) => pool.query(text, params);

export default pool;
