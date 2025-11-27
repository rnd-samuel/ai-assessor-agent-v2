// backend/src/worker.ts
import 'dotenv/config';
import { Worker } from 'bullmq';
import { URL } from 'url';
import { runPhase1Generation } from './services/ai-phase1-service';
import { runPhase2Generation } from './services/ai-phase2-service';
import { runPhase3Generation } from './services/ai-phase3-service';
import { processProjectFile, processReportFile } from './services/file-ingestion-service';
import { generateKnowledgeContext, generateSimulationContext } from './services/ai-context-service';
import { query } from './services/db';

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
  const data = job.data;
  const userId = job.data.userId || 'unknown-user';

  if (job.name === 'update-global-context') {
    console.log('[Context] Updating Global Guide...');
    const currentRes = await query("SELECT value FROM system_settings WHERE key = 'global_context_guide'");
    const currentContext = currentRes.rows[0]?.value?.text || null;

    const newContext = await generateKnowledgeContext(currentContext, data.gcsPath, 'GLOBAL');

    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('global_context_guide', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
       [{ text: newContext }]
    );
    console.log('[Context] Global Guide Updated.');
    return { status: 'COMPLETED' };
  }

  if (job.name === 'init-project-context') {
    console.log(`[Context] Initializing Project ${data.projectId}...`);

    // Start with Global Context
    const globalRes = await query("SELECT value FROM system_settings WHERE key = 'global_context_guide'");
    let currentContext = globalRes.rows[0]?.value?.text || "";

    // Iterate through all uploaded KB files
    // We assume 'files' is an array of { gcs_path: string }
    if (data.files && Array.isArray(data.files)) {
      for (const file of data.files) {
        currentContext = await generateKnowledgeContext(currentContext, file.gcs_path, 'PROJECT');
      }
    }

    await query("UPDATE projects SET context_guide = $1, status = 'READY' WHERE id = $2", [currentContext, data.projectId]);
    console.log(`[Context] Project ${data.projectId} is READY.`);
    return { status: 'COMPLETED' };
  }

  if (job.name === 'update-sim-context') {
    const { fileId, methodId, gcsPath } = data;
    console.log(`[Context] Updating Simulation File ${fileId}...`);
    const methodRes = await query("SELECT name, description FROM global_simulation_methods WHERE id = $1", [methodId]);
    if (methodRes.rows.length === 0) throw new Error("Method not found");
    const method = methodRes.rows[0];

    const context = await generateSimulationContext(method.name, method.description, gcsPath);

    await query("UPDATE global_simulation_files SET context_guide = $1 WHERE id = $2", [context, fileId]);
    console.log(`[Context] Simulation File ${fileId} Context Updated.`);
    return { status: 'COMPLETED' };
  }

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