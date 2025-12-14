import { query } from './db';

interface LogEntry {
  userId: string;
  projectId: string;
  reportId: string;
  action: string;
  model: string;
  prompt: string;
  response: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
}

// Simple cost estimation (approximate for display)
const PRICING: Record<string, { in: number, out: number }> = {
  'google/gemini-2.5-pro': { in: 1.25, out: 10.00 },
  'google/gemini-2.5-flash-lite-preview-09-2025': { in: 0.10, out: 0.40 },
  'google/gemini-3-pro-preview': { in: 2.00, out: 12.00 },
  'openai/gpt-5.1': { in: 1.25, out: 10.00 },
  'default': { in: 1.0, out: 2.0 }
};

// CHANGE 1: Update signature to return Promise<string | null>
export async function logAIInteraction(entry: LogEntry): Promise<string | null> {
  try {
    const inputTokens = entry.inputTokens || 0;
    const outputTokens = entry.outputTokens || 0;
    
    // Calculate estimated cost
    let modelKey = 'default';
    for (const key of Object.keys(PRICING)) {
        if (entry.model.includes(key)) modelKey = key;
    }
    const rates = PRICING[modelKey];
    const cost = ((inputTokens * rates.in) + (outputTokens * rates.out)) / 1_000_000;

    // CHANGE 2: Add RETURNING id to the query
    const result = await query(
      `INSERT INTO ai_logs 
       (user_id, project_id, report_id, action, model, prompt_snapshot, ai_response_snapshot, 
        input_tokens, output_tokens, cost_usd, duration_ms, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`, 
      [
        entry.userId, entry.projectId, entry.reportId, entry.action, entry.model, 
        entry.prompt, entry.response, 
        inputTokens, outputTokens, cost, entry.durationMs, entry.status, entry.errorMessage
      ]
    );

    // CHANGE 3: Return the ID
    return result.rows[0].id; 

  } catch (error) {
    console.error("FAILED TO SAVE AI LOG:", error);
    // CHANGE 4: MUST return null here to satisfy the type definition
    return null; 
  }
}