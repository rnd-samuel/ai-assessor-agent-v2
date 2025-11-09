// backend/src/services/queue.ts
import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { getIO } from './socket';

// --- START: NEW CODE ---
if (!process.env.UPSTASH_REDIS_URL) {
  throw new Error("UPSTASH_REDIS_URL is not set in .env file");
}

const upstashUrl = new URL(process.env.UPSTASH_REDIS_URL);

// This connection object correctly parses the Upstash URL
const connection = {
  host: upstashUrl.hostname,
  port: parseInt(upstashUrl.port, 10), // This will be a valid number
  password: upstashUrl.password,
  tls: { servername: upstashUrl.hostname } // Required for Upstash's rediss://
};
// --- END: NEW CODE ---

// Define Queues (FRD 2.1)
export let aiGenerationQueue: Queue;
export let fileIngestionQueue: Queue;

export const setupQueue = () => {
  // This part stays the same
  aiGenerationQueue = new Queue('ai-generation', { connection });
  fileIngestionQueue = new Queue('file-ingestion', { connection });

  console.log('BullMQ Queues initialized and connected to Redis.');


};