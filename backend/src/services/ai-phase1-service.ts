// backend/src/services/ai-phase1-service.ts
import 'dotenv/config';
import { query, pool } from './db';
import { 
  VectorStoreIndex, 
  ContextChatEngine,
  storageContextFromDefaults
} from 'llamaindex'; // We'll keep these for future RAG implementation
import { OpenAI } from '@llamaindex/openAI';
import { PGVectorStore } from '@llamaindex/postgres';
import { z } from 'zod';
// import { getIO } from './socket';

// 1. Define the AI's output structure (FRD 2.3, Test-AI-02)
const EvidenceSchema = z.object({
  competency: z.string(),
  level: z.string(),
  kb: z.string(),
  quote: z.string(),
  source: z.string(), // e.g., "Case Study"
  reasoning: z.string(),
});
const EvidenceArraySchema = z.object({
  evidence: z.array(EvidenceSchema)
});

// This is the main function our worker will call
export async function runPhase1Generation(reportId: string, userId: string) {
  console.log(`[Worker] Starting Phase 1 (Evidence) for Report: ${reportId}`);

  // 1. Check out a client from existing connection pool
  // We'll use this for our transactions
  const poolClient = await pool.connect();
  console.log('[Worker] Acquired DB client from pool.');

  try {
    
    // --- START: MOCK DATA IMPLEMENTATION ---

    console.log('[Worker] Bypassing AI call and generating mock data...');

    // This is a 5-second delay to simulate the AI "thinking"
    // This gives you time to see your loading spinner on the frontend!
    await new Promise(resolve => setTimeout(resolve, 5000));

    // This mock object *matches* the Zod schema
    const mockOutput = {
      evidence: [
        {
          competency: "Problem Solving",
          level: "3",
          kb: "Identifies and analyzes complex problems",
          quote: "Based on the conflicting stakeholder feedback, I first mapped out the dependencies.",
          source: "Case Study",
          reasoning: "The user identified a conflict (complex problem) and took a structured step to analyze it (mapped dependencies)."
        },
        {
          competency: "Problem Solving",
          level: "2",
          kb: "Categorizes issues to find the core problem",
          quote: "The user feedback was varied. My initial step was to categorize it to find the core issue.",
          source: "Case Study",
          reasoning: "The quote directly matches the key behavior of categorization."
        },
        {
          competency: "Communication",
          level: "1",
          kb: "Speaks clearly and concisely",
          quote: "I am taking personal responsibility for this and am contacting the warehouse manager directly.",
          source: "Roleplay",
          reasoning: "This is a clear, direct, and concise statement of action."
        }
      ]
    };
    
    // We can skip validation because we *know* our mock data is correct
    const validatedOutput = mockOutput;

    // --- END: MOCK DATA IMPLEMENTATION ---


    // --- 5. VALIDATE & SAVE (FR-AI-VAL-001) ---
    console.log('[Worker] Saving mock output...');
    
    // --- START DATABASE TRANSACTION ---
    await poolClient.query('BEGIN');

    // Save each piece of evidence to our new 'evidence' table
    for (const ev of validatedOutput.evidence) {
      console.log(`[Worker] Saving evidence for: ${ev.competency}`);
      await poolClient.query(
        `INSERT INTO evidence (report_id, competency, level, kb, quote, source, reasoning)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [reportId, ev.competency, ev.level, ev.kb, ev.quote, ev.source, ev.reasoning]
      );
    }

    // Update the report status to 'COMPLETED'
    await poolClient.query(
      "UPDATE reports SET status = 'COMPLETED' WHERE id = $1",
      [reportId]
    );
    
    // --- COMMIT TRANSACTION ---
    await poolClient.query('COMMIT');

    // --- 6. NOTIFY (U31) ---
    console.log(`[Worker] Phase 1 complete for Report: ${reportId}`);

    return { userId, reportId, status: 'COMPLETED' };
    
    // --- FIX FOR "Socket.io not initialized!" ---
    // The worker (a separate process) does not have the io instance.
    // We will emit the event from the *main server* process.
    // We can do this by using a separate queue or, for now, just
    // rely on the frontend to reload on its own.
    
    // Let's modify the queue service to handle notifications
    // For now, let's just log it. We can fix the socket later.
    // getIO().to(userId).emit('generation-complete', {
    //   reportId: reportId,
    //   phase: 1,
    //   status: 'COMPLETED', // Send the new status
    //   message: 'Evidence list has finished generating.'
    // });
    
    // NOTE: The "Socket.io not initialized!" error you saw before was in the CATCH block.
    // Because this mock data will *succeed*, it will not hit the catch block,
    // so you won't get that error. The notification will silently fail,
    // but the database *will* be updated.

  } catch (error: any) {
    // --- ROLLBACK TRANSACTION ON ERROR ---
    await poolClient.query('ROLLBACK');
    console.error(`[Worker] 🚨 Phase 1 FAILED for Report: ${reportId}`, error);

    // Update report status to 'FAILED' in the database
    await query(
      "UPDATE reports SET status = 'FAILED' WHERE id = $1",
      [reportId]
    );

    return { userId, reportId, status: 'FAILED', message: error.message };

    // This part will still fail, but we won't hit it with mock data
    // getIO().to(userId).emit('generation-failed', {
    //   reportId: reportId,
    //   phase: 1,
    //   status: 'FAILED', // Send the new status
    //   message: error.message || 'Evidence generation failed.'
    // });
  } finally {
    // --- ALWAYS release the client back to the pool ---
    poolClient.release();
    console.log('[Worker] Released DB client back to pool.');
  }
}