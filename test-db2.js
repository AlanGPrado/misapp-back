import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

let url = process.env.DATABASE_URL;
if (url && url.includes('?')) {
  url = url.split('?')[0]; // strip query parameters
}

console.log("Connecting to:", url);

const { Pool } = pg;
const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000 // fail fast
});

pool.connect()
  .then(client => {
    console.log("Connected successfully!");
    client.release();
    process.exit(0);
  })
  .catch(err => {
    console.error("Connection error:", err);
    process.exit(1);
  });
