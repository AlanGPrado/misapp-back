import pg from 'pg';

const testURL = 'postgresql://neondb_owner:npg_D0ThkW2ufebv@ep-sweet-math-anuli5t0.us-east-1.aws.neon.tech/neondb?sslmode=require';

console.log("Connecting to:", testURL);

const { Pool } = pg;
const pool = new Pool({
  connectionString: testURL,
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
