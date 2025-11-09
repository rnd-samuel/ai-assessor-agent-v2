// backend/src/services/db.ts
import 'dotenv/config';
import { Pool } from 'pg';

const dbUrlString = process.env.DATABASE_URL;

if (!dbUrlString) {
  throw new Error("DATABASE_URL is not set in .env file");
}

// Parse the URL to get the components
const parsedDbUrl = new URL(dbUrlString);

// Create the pool with the individual properties AND the SSL config
export const pool = new Pool({
  host: parsedDbUrl.hostname,
  port: parseInt(parsedDbUrl.port, 10),
  user: parsedDbUrl.username,
  password: parsedDbUrl.password,
  database: parsedDbUrl.pathname.substring(1), // Removes the leading '/'
  ssl: {
    rejectUnauthorized: false
  }
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client', err.stack);
    console.log('🚨 Failed to connect to PostgreSQL. Check DATABASE_URL and GCP firewall rules.');
  } else {
    if (client) {
      console.log('Connected to PostgreSQL database successfully. 🎉');
      client.release();
    }
  }
});

// Export a query function
export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};