// backend/src/worker.ts
import 'dotenv/config';
import { Worker } from 'bullmq';
import { URL } from 'url';
import { runPhase1Generation } from './services/ai-phase1-service';
import { runPhase2Generation } from './services/ai-phase2-service';
import { runPhase3Generation } from './services/ai-phase3-service';
import { processProjectFile, processReportFile } from './services/file-ingestion-service';

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

console.log('🤖 AI Workers are starting...');

// --- Worker 1: AI Generation Queue ---
const aiWorker = new Worker('ai-generation', async (job) => {
  const userId = job.data.userId || 'unknown-user';

  if (job.name === 'generate-phase-1') {
    return runPhase1Generation(job.data.reportId, userId, job);
  }

  if (job.name === 'generate-phase-2') {
    return runPhase2Generation(job.data.reportId, userId);
  }

  if (job.name === 'generate-phase-3') {
    return runPhase3Generation(job.data.reportId, userId);
  }
}, { 
  connection,
  lockDuration: 60000
});

aiWorker.on('completed', (job) => {
  console.log(`✅ [AI] Job ${job.id} (${job.name}) completed.`);
});

aiWorker.on('failed', (job, err) => {
  console.error(`🚨 [AI] Job ${job?.id} (${job?.name}) failed:`, err.message);
});

// --- Worker 2: File Ingestion Queue ---
const ingestionWorker = new Worker('file-ingestion', async (job) => {
  
  if (job.name === 'process-project-file') {
    return processProjectFile(job.data);
  }
  
  // Add this block:
  if (job.name === 'process-report-file') {
    return processReportFile(job.data);
  }

}, { connection });

ingestionWorker.on('completed', (job) => {
  console.log(`✅ [Ingestion] Job ${job.id} (${job.name}) completed.`);
});

ingestionWorker.on('failed', (job, err) => {
  console.error(`🚨 [Ingestion] Job ${job?.id} (${job?.name}) failed:`, err.message);
});

console.log('🤖 AI Workers are listening for jobs...');