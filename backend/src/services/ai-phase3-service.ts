// backend/src/services/ai-phase3-service.ts
import { pool, query } from './db';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { publishEvent } from './redis-publisher';
import { Job } from 'bullmq';

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "HTTP-Referer": "https://ai-assessor-agent.com", "X-Title": "AI Assessor Agent" }
});

// --- HELPER: JSON Output Cleaner ---
function cleanJsonOutput(text: string): string {
  // Remove markdown code blocks
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  // Find the first '{' and last '}'
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  return clean;
}

// --- HELPER: Cancellation Check (Same as Phase 2) ---
async function checkCancellation(reportId: string, userId: string, currentJobId?: string) {
  const res = await query("SELECT status, active_job_id FROM reports WHERE id = $1", [reportId]);
  if (res.rows.length === 0) throw new Error("CANCELLED_BY_USER");
  const { status, active_job_id } = res.rows[0];

  if (status !== 'PROCESSING') {
    throw new Error("CANCELLED_BY_USER");
  }
  if (currentJobId && active_job_id && String(active_job_id) !== String(currentJobId)) {
    throw new Error("CANCELLED_BY_USER");
  }
}

// --- HELPER: Smart Request ---
async function smartAIRequest(payload: any, reportId: string, userId: string, jobId: string) {
  const controller = new AbortController();
  const poller = setInterval(async () => {
    try { await checkCancellation(reportId, userId, jobId); } 
    catch (e) { controller.abort(); clearInterval(poller); }
  }, 1500);

  try {
    const response = await openai.chat.completions.create({ ...payload }, { signal: controller.signal });
    clearInterval(poller);
    return response;
  } catch (error: any) {
    clearInterval(poller);
    if (error.name === 'AbortError') throw new Error("CANCELLED_BY_USER");
    throw error;
  }
}

// --- OUTPUT SCHEMA ---
const SummarySchema = z.object({
  overview: z.string().describe("A narrative story combining strengths and weaknesses interacting with each other."),
  strengths: z.string().describe("Bulleted list or paragraphs of strengths."),
  weaknesses: z.string().describe("Bulleted list or paragraphs of areas for improvement."),
  recommendations: z.string().describe("Actionable development steps.")
});

export async function runPhase3Generation(reportId: string, userId: string, job: Job) {
  const currentJobId = job.id || "unknown";
  
  // Retry Logic Setup
  const attemptsMade = job.attemptsMade;
  const isBackupTry = attemptsMade >= 3;
  const providerLabel = isBackupTry ? "Backup LLM" : "Main LLM";

  console.log(`[Worker] Starting Phase 3 (Executive Summary). Attempt ${attemptsMade + 1}/6 using ${providerLabel}.`);
  
  await publishEvent(userId, 'ai-stream', { 
    reportId, 
    chunk: `\n🚀 Starting Executive Summary Generation (Attempt ${attemptsMade + 1}/6 using ${providerLabel})...\n`
  });

  if (isBackupTry && attemptsMade === 3) {
    await publishEvent(userId, 'ai-stream', { 
      reportId, 
      chunk: `⚠️ Main LLM failed 3 times. Switching to Backup LLM...\n` 
    });
  }

  const client = await pool.connect();

  try {
    const settingsRes = await query("SELECT value FROM system_settings WHERE key = 'ai_config'");
    const aiConfig = settingsRes.rows[0]?.value || {};

    // Model Selection Logic
    let narrativeModel, temperature;

    if (isBackupTry) {
      narrativeModel = aiConfig.backupLLM || "google/gemini-2.5-flash-lite-preview-09-2025";
      temperature = aiConfig.backupTemp ?? 0.5;
    } else {
      narrativeModel = aiConfig.narrativeLLM || "google/gemini-2.5-pro";
      // Use a slightly lower temp for the critic/editor role if desired, or standard
      temperature = 0.5; 
    }

    // 1. Fetch Data
    const reportRes = await query(`SELECT project_id FROM reports WHERE id = $1`, [reportId]);
    const projectId = reportRes.rows[0].project_id;

    const projectRes = await query(
      `SELECT pp.summary_prompt, pp.summary_critique_prompt, pp.persona_prompt 
       FROM project_prompts pp WHERE pp.project_id = $1`,
      [projectId]
    );
    const { summary_prompt, summary_critique_prompt, persona_prompt } = projectRes.rows[0];

    // Fetch Phase 2 Results
    const analysisRes = await query(
      `SELECT competency, level_achieved, explanation, development_recommendations 
       FROM competency_analysis WHERE report_id = $1`,
      [reportId]
    );
    
    const analysisText = analysisRes.rows.map(r => 
      `## ${r.competency} (Level ${r.level_achieved})\n${r.explanation}\nDev Recs: ${r.development_recommendations}`
    ).join('\n\n');

    // --- STEP 1: DRAFTING AGENT ---
    await publishEvent(userId, 'ai-stream', { reportId, chunk: "\n✍️ **Step 1:** Drafting summary content...\n" });

    const draftPrompt = `
    ${persona_prompt}
    ${summary_prompt || "Summarize the candidate."}

    === COMPETENCY ANALYSIS DATA ===
    ${analysisText}

    *** OUTPUT REQUIREMENT ***
    Return a JSON object:
    {
      "overview": "Narrative blending strengths and weaknesses to show uniqueness.",
      "strengths": "Overall strengths.",
      "weaknesses": "Overall weaknesses.",
      "recommendations": "Overall recommendations."
    }
    `;

    const draftRes = await smartAIRequest({
        model: narrativeModel, // High reasoning for synthesis
        messages: [{ role: "user", content: draftPrompt }],
        response_format: { type: "json_object" },
        temperature: temperature
    }, reportId, userId, currentJobId);

    const draftContent = draftRes.choices[0].message.content || "{}";
    const draftJson = JSON.parse(cleanJsonOutput(draftContent));

    // --- STEP 2: CRITIC AGENT ---
    await publishEvent(userId, 'ai-stream', { reportId, chunk: "\n🧐 **Step 2:** Reviewing for consistency and flow...\n" });

    const critiquePrompt = `
    ${persona_prompt}
    ${summary_critique_prompt || "Check for conflicts."}

    === DRAFT CONTENT ===
    Overview: ${draftJson.overview || draftJson.Overview || ""}
    Strengths: ${draftJson.strengths || draftJson.Strengths || ""}
    Weaknesses: ${draftJson.weaknesses || draftJson.Weaknesses || ""}
    Recommendations: ${draftJson.recommendations || draftJson.Recommendations || ""}

    *** TASK ***
    1. Check if 'Overview' contradicts 'Strengths' or 'Weaknesses'.
    2. Ensure 'Overview' flows as a narrative story describing the INTERACTION between traits, not just a list.
    3. Output the FINAL REFINED JSON (same structure).

    *** OUTPUT FORMAT (STRICT JSON) ***
    You MUST use these exact lowercase keys:
    {
      "overview": "...",
      "strengths": "...",
      "weaknesses": "...",
      "recommendations": "..."
    }
    `;

    const finalRes = await smartAIRequest({
        model: narrativeModel,
        messages: [{ role: "user", content: critiquePrompt }],
        response_format: { type: "json_object" },
        temperature: isBackupTry ? temperature : 0.4
    }, reportId, userId, currentJobId);

    const finalContent = finalRes.choices[0].message.content || "{}";

    let finalJson;
    try {
      finalJson = JSON.parse(cleanJsonOutput(finalContent));
    } catch (e) {
      throw new Error("Failed to parse AI JSON response.");
    }

    // --- NORMALIZATION FALLBACK ---
    // If AI used capitalized keys despite instructions, map them to lowercase
    const normalizedJson = {
        overview: finalJson.overview || finalJson.Overview || "",
        strengths: finalJson.strengths || finalJson.Strengths || "",
        weaknesses: finalJson.weaknesses || finalJson.Weaknesses || "",
        recommendations: finalJson.recommendations || finalJson.Recommendations || ""
    };

    const result = SummarySchema.parse(normalizedJson);

    // 3. Save to DB
    await client.query('BEGIN');
    await client.query('DELETE FROM executive_summary WHERE report_id = $1', [reportId]);
    await client.query(
      `INSERT INTO executive_summary (report_id, overview, strengths, areas_for_improvement, recommendations)
       VALUES ($1, $2, $3, $4, $5)`,
      [reportId, result.overview, result.strengths, result.weaknesses, result.recommendations]
    );
    await client.query("UPDATE reports SET status = 'COMPLETED', active_phase = NULL WHERE id = $1", [reportId]);
    await client.query('COMMIT');

    await publishEvent(userId, 'generation-complete', { 
        reportId, status: 'COMPLETED', message: "Executive Summary Created." 
    });

    return { status: 'COMPLETED' };

  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.message === "CANCELLED_BY_USER") {
        await publishEvent(userId, 'generation-cancelled', { reportId, message: "Generation stopped." });
        return { status: 'CANCELLED' };
    }
    await query("UPDATE reports SET status = 'FAILED', active_phase = NULL WHERE id = $1", [reportId]);
    await publishEvent(userId, 'generation-failed', { reportId, message: error.message });
    throw error;
  } finally {
    client.release();
  }
}