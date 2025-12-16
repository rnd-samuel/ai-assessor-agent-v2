// backend/src/services/db.ts
import 'dotenv/config';
import { Pool } from 'pg';

const dbUrlString = process.env.DATABASE_URL;

if (!dbUrlString) {
  throw new Error("DATABASE_URL is not set in .env file");
}

console.log(`[DB] Initializing connection pool...`);

// We check if the URL implies a Unix Socket (Cloud Run)
const isSocket = dbUrlString.includes('host=/cloudsql');

export const pool = new Pool({
  connectionString: dbUrlString,
  // Only enforce SSL if we are NOT using a socket (e.g. local dev with Public IP)
  // For Cloud Run sockets, we explicitly disable the SSL config object to avoid the "not supported" error
  ssl: isSocket ? undefined : { rejectUnauthorized: false }
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] 🚨 Connection Error:', err.message);
  } else {
    if (client) {
      console.log('[DB] ✅ Connected successfully.');
      client.release();
    }
  }
});

// Export a query function
export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};