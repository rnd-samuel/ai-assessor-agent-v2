// backend/src/services/ai-phase1-service.ts
import 'dotenv/config';
import { query, pool } from './db';
import { 
  VectorStoreIndex, 
  ContextChatEngine,
  storageContextFromDefaults
} from 'llamaindex';
import { OpenAI } from '@llamaindex/openAI';
import { PGVectorStore } from '@llamaindex/postgres';
import { z } from 'zod';
import { getIO } from './socket';

// 1. Define the AI's output structure (FRD 2.3, Test-AI-02)
// This uses Zod to validate the LLM's JSON output.
const EvidenceSchema = z.object({
  competency: z.string(),
  level: z.string(),
  kb: z.string(),
  quote: z.string(),
  source: z.string(),
  reasoning: z.string(),
});
const EvidenceArraySchema = z.object({
  evidence: z.array(EvidenceSchema)
});

// This is the main function our worker will call
export async function runPhase1Generation(reportId: string, userId: string) {
  console.log(`[Worker] Starting Phase 1 (Evidence) for Report: ${reportId}`);

  // 1. Check out a client from existing connection pool
  const poolClient = await pool.connect();
  console.log('[Worker] Acquired DB client from pool for vector operations.')

  try {
    // --- 2. RETRIEVE (The 4-Layer RAG) ---
    // This is a placeholder. In a real app, you'd get these from 'reportId'
    const projectId = 'PROJECT_ID_FROM_REPORT'; 

    // Layer 1: Global General Knowledge (A12)
    // (We'll implement the RAG pipeline for this later)
    const globalContext = "You are a professional assessment expert. Your writing style is formal and analytical.";

    // Layer 2 & 3: Project-specific Vector Data (P9, P11)
    const vectorStore = new PGVectorStore({ client: poolClient });

    // This is a placeholder query. We'll refine this.
    // const projectSimData = await vectorStore.query(...);
    // const projectKb = await vectorStore.query(...);
    const vectorContext = "Placeholder for vector data (simulations, project KB)";

    // Layer 4: Assessee's Raw Text (U23)
    // (We'll implement file uploading and this RAG layer later)
    const assesseeData = `
      Based on the conflicting stakeholder feedback, I first mapped out 
      the dependencies before proposing a phased rollout to mitigate risks. 
      My analysis showed that the risk of a full launch was too high.
    `;

    // --- 3. AUGMENT (Build the Prompt) ---
    // Get the custom prompt for this project (P12)
    // This is a placeholder SQL query
    // const promptResult = await query("SELECT kb_evidence_prompt FROM projects WHERE id = $1", [projectId]);
    // const customPrompt = promptResult.rows[0].kb_evidence_prompt;
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
    // Configure LlamaIndex to use OpenRouter (as per FRD 2.2)
    // IMPORTANT: You must set OPENROUTER_API_KEY in your .env file
    const llm = new OpenAI({
      model: 'openrouter/anthropic/claude-3-haiku', // Cheaper/faster for testing
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });

    console.log('[Worker] Calling LLM...');
    const response = await llm.chat({
      messages: [{ role: 'user', content: fullPrompt }],
      responseFormat: { type: 'json_object' }, // Request JSON output
    });

    const messageContent = response.message.content;
    let jsonString: string;

    // Handle both possible 'MessageContent' types
    if (typeof messageContent === 'string') {
      // Simple case: It's already a string
      jsonString = messageContent;
    } else if (Array.isArray(messageContent) && messageContent[0]?.type === 'text') {
      // Complex case: It's an array, get the text from the first part
      jsonString = messageContent[0].text;
    } else {
      // Handle any other unexpected format
      throw new Error("AI response was not in the expected JSON text format.");
    }

    // Now, this line will work correctly
    const jsonResponse = JSON.parse(jsonString || "{}");

    // --- 5. VALIDATE & SAVE (FR-AI-VAL-001) ---
    console.log('[Worker] Validating AI output...');
    const validatedOutput = EvidenceArraySchema.parse(jsonResponse);

    // Save each piece of evidence to our Postgres DB
    for (const ev of validatedOutput.evidence) {
      console.log(`[Worker] Saving evidence for: ${ev.competency}`);
      // This is a placeholder SQL query
      // await query(
      //   "INSERT INTO evidence (report_id, competency, level, kb, quote, source, reasoning) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      //   [reportId, ev.competency, ev.level, ev.kb, ev.quote, ev.source, ev.reasoning]
      // );
    }

    // --- 6. NOTIFY (U31) ---
    console.log(`[Worker] Phase 1 complete for Report: ${reportId}`);
    getIO().to(userId).emit('generation-complete', {
      reportId: reportId,
      phase: 1,
      message: 'Evidence list has finished generating.'
    });

  } catch (error) {
    console.error(`[Worker] 🚨 Phase 1 FAILED for Report: ${reportId}`, error);
    // Notify user of the failure
    getIO().to(userId).emit('generation-failed', {
      reportId: reportId,
      phase: 1,
      message: 'Evidence generation failed.'
    });
  }
}