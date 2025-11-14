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
import { getIO } from './socket';

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
    // --- 2. RETRIEVE (The 4-Layer RAG) ---
    // This is still a placeholder. In a real app, you'd fetch this
    // data based on the reportId and its associated projectId.
    const globalContext = "You are a professional assessment expert. Your writing style is formal and analytical.";
    const vectorContext = "Placeholder for vector data (simulations, project KB)";
    
    // TODO: Fetch the *actual* uploaded assessment results for this reportId
    const assesseeData = `
      Based on the conflicting stakeholder feedback, I first mapped out 
      the dependencies before proposing a phased rollout to mitigate risks. 
      My analysis showed that the risk of a full launch was too high.
      The user feedback was varied. My initial step was to categorize it 
      to find the core issue before developing a solution.
    `;

    // --- 3. AUGMENT (Build the Prompt) ---
    // TODO: Fetch the custom prompt for this report's project
    const customPrompt = `
      Scan the "Assessee Results" text. Find quotes that match the Key Behaviors (KBs).
      For each quote, provide your reasoning.
      Return your answer as a JSON object matching this schema:
      { "evidence": [ { "competency": "string", "level": "string", "kb": "string", "quote": "string", "source": "string", "reasoning": "string" } ] }
    `;

    const fullPrompt = `
      ${customPrompt}

      --- Global Rules ---
      ${globalContext}

      --- Vector Context (Simulations, Project KB) ---
      ${vectorContext}

      --- Assessee Results (to analyze) ---
      ${assesseeData}
    `;

    // --- 4. GENERATE (Call the LLM) ---
    const llm = new OpenAI({
      model: 'openrouter/anthropic/claude-3-haiku',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });

    console.log('[Worker] Calling LLM...');
    const response = await llm.chat({
      messages: [{ role: 'user', content: fullPrompt }],
      responseFormat: { type: 'json_object' },
    });

    const messageContent = response.message.content;
    let jsonString: string;

    if (typeof messageContent === 'string') {
      jsonString = messageContent;
    } else if (Array.isArray(messageContent) && messageContent[0]?.type === 'text') {
      jsonString = messageContent[0].text;
    } else {
      throw new Error("AI response was not in the expected JSON text format.");
    }

    const jsonResponse = JSON.parse(jsonString || "{}");

    // --- 5. VALIDATE & SAVE (FR-AI-VAL-001) ---
    console.log('[Worker] Validating AI output...');
    const validatedOutput = EvidenceArraySchema.parse(jsonResponse);

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
    getIO().to(userId).emit('generation-complete', {
      reportId: reportId,
      phase: 1,
      status: 'COMPLETED', // Send the new status
      message: 'Evidence list has finished generating.'
    });

  } catch (error: any) {
    // --- ROLLBACK TRANSACTION ON ERROR ---
    await poolClient.query('ROLLBACK');
    console.error(`[Worker] 🚨 Phase 1 FAILED for Report: ${reportId}`, error);

    // Update report status to 'FAILED' in the database
    await query(
      "UPDATE reports SET status = 'FAILED' WHERE id = $1",
      [reportId]
    );

    // Notify user of the failure
    getIO().to(userId).emit('generation-failed', {
      reportId: reportId,
      phase: 1,
      status: 'FAILED', // Send the new status
      message: error.message || 'Evidence generation failed.'
    });
  } finally {
    // --- ALWAYS release the client back to the pool ---
    poolClient.release();
    console.log('[Worker] Released DB client back to pool.');
  }
}