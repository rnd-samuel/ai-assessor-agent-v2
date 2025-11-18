// backend/src/worker.ts
import 'dotenv/config';
import { Worker } from 'bullmq';
import { URL } from 'url';
import { runPhase1Generation } from './services/ai-phase1-service';
import { runPhase2Generation } from './services/ai-phase2-service';
import { runPhase3Generation } from './services/ai-phase3-service';

// 1. Get Upstash Connection Details
if (!process.env.UPSTASH_REDIS_URL) {
  throw new Error("UPSTASH_REDIS_URL is not set in .env file");
}
const upstashUrl = new URL(process.env.UPSTASH_REDIS_URL);
const connection = {
  host: upstashUrl.hostname,
  port: parseInt(upstashUrl.port, 10),
  password: upstashUrl.password,
  tls: { servername: upstashUrl.hostname }
};

// 2. Create the Worker
console.log('🤖 AI Worker is starting...');

const worker = new Worker('ai-generation', async (job) => {

  const userId = job.data.userId || 'unknown-user';

  if (job.name === 'generate-phase-1') {
    return runPhase1Generation(job.data.reportId, userId);
  }

  if (job.name === 'generate-phase-2') {
    return runPhase2Generation(job.data.reportId, userId);
  }

  if (job.name === 'generate-phase-3') {
    return runPhase3Generation(job.data.reportId, userId);
  }

}, { connection });

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} (Name: ${job.name}) has completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`🚨 Job ${job?.id} (Name: ${job?.name}) failed with error:`, err.message);
});

console.log('🤖 AI Worker is listening for jobs...');