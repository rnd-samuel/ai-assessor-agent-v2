// backend/src/test-db.ts
import dotenv from 'dotenv';
import { Pool } from 'pg';

// 1. Load the .env file
// This loads from the 'backend/.env' file
dotenv.config({ path: '.env' }); 

// 2. Check if the variable is loaded
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("\n🚨 ERROR: DATABASE_URL is NOT LOADED!");
  console.log("   Please check your 'backend/.env' file.");
  console.log("   Make sure it exists and 'DATABASE_URL' is spelled correctly.\n");
} else {
  console.log("\n✅ DATABASE_URL loaded successfully.");
  // We'll hide the password for security
  console.log("--- FULL URL BEING PARSED ---");
  console.log(dbUrl); // This will print the full, exact string
  console.log("-------------------------------");

  try {
    const parsedDbUrl = new URL(dbUrl);

    const pool = new Pool({
        host: parsedDbUrl.hostname,
        port: parseInt(parsedDbUrl.port, 10),
        user: parsedDbUrl.username,
        password: parsedDbUrl.password,
        database: parsedDbUrl.pathname.substring(1),
        ssl: {
            rejectUnauthorized: false
        }
    });

    console.log("Attempting to connect to PostgreSQL...");

    pool.connect((err, client, release) => {
        if (err) {
        console.error("\n🚨 CONNECTION FAILED:", err.message);
        console.log("\n--- Debugging Tips ---");
        console.log("1. Is your Cloud SQL instance running?");
        console.log("2. Is your computer's IP address added to the 'Authorized networks' list in Cloud SQL?");
        console.log("3. Is your USER:PASSWORD or HOST_IP correct in the URL?");
        } else {
        if ( client ) {
            console.log("\n✅✅✅ SUCCESS! Connected to PostgreSQL.");
            client.release();
        } else {
            console.error("\n🚨 CONNECTION FAILED: Unknown error, client is undefined.");
        }
        
        }
        pool.end(); // Close the pool
    });
    
  } catch (e) {
    // This will catch the "Invalid URL" error
    if (e instanceof Error) {
        console.error("\n🚨 FAILED TO PARSE URL:", e.message);
    } else {
        console.error("\n🚨 FAILED TO PARSE URL:", "An unknown error occurred");
    }
    console.log("\n--- Debugging Tips ---");
    console.log("1. Does the URL above start with 'postgresql://' ?");
    console.log("2. Are there any spaces in the URL?");
    console.log("3. If your password has special characters (like @, #, $), they might need to be URL-encoded.");
  }
}