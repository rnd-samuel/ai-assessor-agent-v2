// backend/src/services/db.ts
import 'dotenv/config';
import { Pool } from 'pg';

const dbUrlString = process.env.DATABASE_URL;

if (!dbUrlString) {
  throw new Error("DATABASE_URL is not set in .env file");
}

console.log(`[DB] Initializing connection pool...`);

// FIX: Use 'connectionString' directly. 
// This allows 'pg' to automatically handle the '?host=' query param 
// needed for Cloud Run Unix Sockets.
export const pool = new Pool({
  connectionString: dbUrlString,
  ssl: {
    // We allow self-signed certs (common in cloud environments)
    // Note: For Unix sockets (Cloud Run), SSL is often skipped automatically by pg,
    // but this setting is safe to keep for compatibility.
    rejectUnauthorized: false
  }
});

// Test the connection logic
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] 🚨 Connection Error:', err.message);
    // We don't crash the process here, so the logs can be read in Cloud Run
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