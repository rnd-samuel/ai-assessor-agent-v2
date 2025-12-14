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
  'google/gemini-2.5-pro': { in: 1.25, out: 10.00 }, // $ per 1M tokens (example)
  'google/gemini-2.5-flash-lite-preview-09-2025': { in: 0.10, out: 0.40 },
  'google/gemini-3-pro-preview': { in: 2.00, out: 12.00 },
  'openai/gpt-5.1': { in: 1.25, out: 10.00 },
  'default': { in: 1.0, out: 2.0 }
};

export async function logAIInteraction(entry: LogEntry) {
  try {
    const inputTokens = entry.inputTokens || 0;
    const outputTokens = entry.outputTokens || 0;
    
    // Calculate estimated cost
    // Normalized cost logic (handling various model names)
    let modelKey = 'default';
    for (const key of Object.keys(PRICING)) {
        if (entry.model.includes(key)) modelKey = key;
    }
    const rates = PRICING[modelKey];
    const cost = ((inputTokens * rates.in) + (outputTokens * rates.out)) / 1_000_000;

    await query(
      `INSERT INTO ai_logs 
       (user_id, project_id, report_id, action, model, prompt_snapshot, ai_response_snapshot, 
        input_tokens, output_tokens, cost_usd, duration_ms, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        entry.userId, entry.projectId, entry.reportId, entry.action, entry.model, 
        entry.prompt, entry.response, 
        inputTokens, outputTokens, cost, entry.durationMs, entry.status, entry.errorMessage
      ]
    );
  } catch (error) {
    console.error("FAILED TO SAVE AI LOG:", error);
    // Don't throw. Logging failure shouldn't stop the app.
  }
}