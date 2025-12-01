// backend/src/services/ai-phase1-service.ts
import 'dotenv/config';
import { query, pool } from './db';
import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming'; 
import { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { z } from 'zod';
import { publishEvent } from './redis-publisher';
import { Job } from 'bullmq';
import { report } from 'process';

// Initialize OpenAI client (Base configuration)
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://ai-assessor-agent.com",
    "X-Title": "AI Assessor Agent",
  }
});

// Helper to wait/delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. ADD THIS HELPER FUNCTION ---
// Removes leading numbers, dots, and whitespace to create a "clean" signature for comparison
// e.g. "1. Memahami..." -> "memahami..."
// e.g. "KB 1.1: Identifikasi..." -> "identifikasi..."
const normalizeKb = (str: string) => {
  // Remove leading "KB", numbers, dots, dashes, and whitespace
  return str
    .replace(/^(kb|key\s*behavior)?[\d\w\.\-\s]+/i, '') 
    .trim()
    .toLowerCase();
};

// Check Cancellation
async function checkCancellation(reportId: string, userId: string, currentJobId?: string) {
    const res = await query("SELECT status, active_job_id FROM reports WHERE id = $1", [reportId]);
    
    // 1. Report Deleted or Missing
    if (res.rows.length === 0) throw new Error("CANCELLED_BY_USER");
    
    const { status, active_job_id } = res.rows[0];

    // 2. Status Check (Must be PROCESSING)
    if (status !== 'PROCESSING') {
        await publishEvent(userId, 'ai-stream', { 
            reportId, 
            chunk: `\n⛔ Process stopped (Status: ${status}). Aborting job.\n` 
        });
        throw new Error("CANCELLED_BY_USER");
    }

    // 3. Identity Check (Zombie Protection)
    // If the DB has a different active Job ID than us, we are obsolete.
    if (currentJobId && active_job_id && String(active_job_id) !== String(currentJobId)) {
        console.warn(`[Worker] Job ${currentJobId} aborted. New job ${active_job_id} has taken over.`);
        throw new Error("CANCELLED_BY_USER");
    }
}

// Define the Output Schema (Zod) for validation
const EvidenceItemSchema = z.object({
  competency: z.string(),
  level: z.string(),
  kb: z.string(),
  quote: z.string(),
  source: z.string(),
  reasoning: z.string(),
});

// We expect a list of evidence items for the *current* level/file
const ResultSchema = z.object({
  evidence: z.array(EvidenceItemSchema)
});

export async function runPhase1Generation(reportId: string, userId: string, job: Job) {
  const currentJobId = job.id;
  if (!currentJobId) throw new Error("Job ID missing");
  try {
    await checkCancellation(reportId, userId, currentJobId);
  } catch (e: any) {
    if (e.message === "CANCELLED_BY_USER") {
      console.log(`[Worker] Retry aborted for ${reportId}: Job was cancelled.`);
      return { status: 'CANCELLED' };
    }
    throw e;
  }

  const attemptsMade = job.attemptsMade;
  const isBackupTry = attemptsMade >= 3;
  const providerLabel = isBackupTry ? "Backup LLM" : "Main LLM";

  console.log(`[Worker] Starting Phase 1. Attempt ${attemptsMade + 1}/6 using ${providerLabel}.`);

  // Notify Frontend of attempt start
  await publishEvent(userId, 'ai-stream', { 
    reportId, 
    chunk: `\n\n--- Attempt ${attemptsMade + 1}/6: Starting comprehensive analysis using ${providerLabel}... ---\n`
  });

  const poolClient = await pool.connect();

  try {
    // --- 1. FETCH CONTEXT & CONFIG ---
    // Get AI Config from DB
    const settingsRes = await query("SELECT value FROM system_settings WHERE key = 'ai_config'");
    const aiConfig = settingsRes.rows[0]?.value || {};

    let model, temperature;
    if (isBackupTry) {
      model = aiConfig.backupLLM || "google/gemini-2.5-flash-lite-preview-09-2025";
      temperature = aiConfig.backupTemp ?? 0.3;
      if (attemptsMade === 3) {
        await publishEvent(userId, 'ai-stream', { reportId, chunk: `⚠️ Main LLM failed 3 times. Switching to Backup LLM setup...\n` });
      }
    } else {
      model = aiConfig.mainLLM || "google/gemini-2.5-flash-lite-preview-09-2025";
      temperature = aiConfig.mainTemp ?? 0.3;
    }
    
    // Get Report Details
    const reportRes = await query('SELECT title, project_id FROM reports WHERE id = $1', [reportId]);
    const report = reportRes.rows[0];
    if (!report) throw new Error("Report not found");

    // Get Competency Dictionary & Prompts
    const projectRes = await query(
      `SELECT 
         cd.content as dictionary, 
         pp.persona_prompt, 
         pp.evidence_prompt,
         pp.general_context as project_brief
       FROM projects p
       JOIN competency_dictionaries cd ON p.dictionary_id = cd.id
       JOIN project_prompts pp ON p.id = pp.project_id
       WHERE p.id = $1`,
      [report.project_id]
    );
    const { dictionary, project_knowledge_context, persona_prompt, evidence_prompt, project_brief } = projectRes.rows[0];

    const simContextsRes = await query(
        `SELECT gsm.name as method_name, gsf.context_guide
         FROM projects_to_simulation_files ptsf
         JOIN global_simulation_files gsf ON ptsf.file_id = gsf.id
         JOIN global_simulation_methods gsm ON gsf.method_id = gsm.id
         WHERE ptsf.project_id = $1 AND gsf.context_guide IS NOT NULL`,
        [report.project_id]
    );

    // Map: Method Name -> Combined Context
    const methodContextMap: Record<string, string> = {};
    simContextsRes.rows.forEach(row => {
        const existing = methodContextMap[row.method_name] || "";
        // Append if multiple files exist for same method (e.g., 2 different Case Studies)
        methodContextMap[row.method_name] = existing + `\n\n*** GUIDE (${row.method_name}) ***\n${row.context_guide}`;
    });

    // Validate Dictionary Structure
    if (!dictionary.kompetensi || !Array.isArray(dictionary.kompetensi)) {
        throw new Error("Invalid Competency Dictionary format.");
    }

    // Get Report Files & Their Chunks
    // We fetch ALL text chunks associated with this report's files.
    // We assume "source_truth" strategy (feed full text) instead of RAG search for higher accuracy.
    const filesRes = await query(
      `SELECT file_name, simulation_method_tag, extracted_text 
       FROM report_files 
       WHERE report_id = $1`,
      [reportId]
    );

    if (filesRes.rows.length === 0) throw new Error("No files found.");

    // RESUME LOGIC START (in the event of failure)
    // Check which competencies already generated evidence
    const existingRes = await query(
      `SELECT competency, level, source 
        FROM evidence 
        WHERE report_id = $1 AND is_ai_generated = true`,
      [reportId]
    );

    // Create a Set of "signatures" for fast lookup
    // Format: "CompetencyName|Level|SourceTag"
    const completedUnits = new Set(
      existingRes.rows.map(r => `${r.competency}|${r.level}|${r.source}`)
    );

    if (completedUnits.size > 0) {
      console.log(`[Worker] Found ${completedUnits.size} completed evidence units. Resuming...`);
      await publishEvent(userId, 'ai-stream', {
          reportId,
          chunk: `\n⏩ Resuming: Found ${completedUnits.size} completed evidence blocks.\n`
      });
    }

    // We now process ALL competencies, but we will skip specific parts inside the loop
    const competenciesToProcess = dictionary.kompetensi;

    let totalEvidenceCount = 0;

    // // 2. Prepare DB
    // await poolClient.query('BEGIN');
    // await poolClient.query('DELETE FROM evidence WHERE report_id = $1 AND is_ai_generated = true', [reportId]);
    // await poolClient.query('COMMIT');

    // 3. Iterative Generation Loop
    // Loop 1: Competency
    for (const comp of competenciesToProcess) {
      // Check cancellation before starting a new competency
      try {
        await checkCancellation(reportId, userId, currentJobId);
      } catch (e: any) {
        if (e.message === "CANCELLED_BY_USER") return { status: 'CANCELLED' };
        throw e;
      }

      const compName = comp.name || comp.namaKompetensi || "Unknown Competency";

      // Loop 2: File (Source)
      for (const file of filesRes.rows) {
        const sourceTag = file.simulation_method_tag || "Unknown Source";

        const methodContext = methodContextMap[sourceTag] || "";

        // Loop 3: Level
        for (const levelObj of comp.level) {
          const levelNum = String(levelObj.nomor);

          // If this exact unit is in our "completedUnits" set, skip it entirely.
          const unitSignature = `${compName}|${levelNum}|${sourceTag}`;

          if (completedUnits.has(unitSignature)) {
            continue; 
          }

          // (Check before starting the expensive database delete or AI call)
          await checkCancellation(reportId, userId, currentJobId);

          // We delete ONLY this specific unit to ensure we don't have partial duplicates from a previous crash.
          await poolClient.query('BEGIN');
          await poolClient.query(
            `DELETE FROM evidence 
             WHERE report_id = $1 AND competency = $2 AND level = $3 AND source = $4 AND is_ai_generated = true`,
            [reportId, compName, levelNum, sourceTag]
          );
          await poolClient.query('COMMIT');

          // Notify User
          await publishEvent(userId, 'ai-stream', {
            reportId,
            chunk: `\n🔍 Analyzing: ${compName} | Level ${levelNum} | Source: ${sourceTag}...\n`
          });

          // Prompt Construction
          const systemPrompt = `${persona_prompt}
            === PROJECT CONTEXT ===
            ${project_brief || "N/A"}

            === MASTER ASSESSMENT GUIDE (PROJECT KNOWLEDGE) ===
            ${project_knowledge_context || "No specific project knowledge guide available."}

            You are strictly analyzing the candidate's performance based on the data provided.
          `;

          const userPrompt = `
            ${evidence_prompt}
            === TASK SCOPE ===
            **Competency:** ${compName}
            **Definition:** ${comp.definisiKompetensi}
            **Target Level:** ${levelNum}
            **Level Description:** ${levelObj.penjelasan}
            **Key Behaviors to Find:**
            ${levelObj.keyBehavior.map((kb: string) => `- ${kb}`).join('\n')}

            === DATA SOURCE (${sourceTag}) ===
            ${methodContext ? `**SIMULATION GUIDES:**\n${methodContext}\n` : ""}

            **TRANSCRIPT / CONTENT:**
            ${file.extracted_text}

            === INSTRUCTIONS ===
            1. Search the TRANSCRIPT above for evidence that matches the Key Behaviors for Level ${levelNum} ONLY.
            2. Extract exact quotes.
            3. Explain your reasoning using the Master Guide or Method Guide if applicable.
            4. If no evidence is found for this specific level in this specific file, return an empty list.

            **OUTPUT FORMAT (JSON):**
            {
              "evidence": [
                {
                  "kb": "Full text of the Key Behavior matched (should include the number, e.g. "1. Memahami keterkaitan produk..")",
                  "quote": "Exact quote from text",
                  "reasoning": "Explanation"
                }
              ]
            }
            `;

            // Call AI
            const options: any = { temperature };
            if (model.includes('gpt')) delete options.temperature;

            // Instant Cancellation Setup
            const controller = new AbortController();

            // Set up a periodic check *during* the stream (The Heartbeat)
            const checkInterval = setInterval(async () => {
              try {
                // Silently check DB status. If failed, it throws.
                await checkCancellation(reportId, userId, currentJobId);
              } catch (err) {
                // If cancelled, kill the OpenAI connection immediately
                controller.abort();
                clearInterval(checkInterval);
              }
            }, 1500);

            let fullResponse = "";

            try {
              const stream = await openai.chat.completions.create({
                model: model,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
                response_format: { type: "json_object" },
                stream: true,
                strict: true,
                ...options
              }, { signal: controller.signal }) as unknown as Stream<ChatCompletionChunk>;

              for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) {
                  fullResponse += content;
                  await publishEvent(userId, 'ai-stream', { reportId, chunk: content });
                }
              }

              clearInterval(checkInterval);

            } catch (err: any) {
              clearInterval(checkInterval);

              // If it was an abort error, throw the specific cancellation message
              if (err.name === 'AbortError' || err.message === "CANCELLED_BY_USER") {
                  throw new Error("CANCELLED_BY_USER");
              }
              throw err;
            }

            // --- PARSE & SAVE ---
            try {
              let cleanResponse = fullResponse.replace(/```json/g, '').replace(/```/g, '').trim();
              const firstBrace = cleanResponse.indexOf('{');
              const lastBrace = cleanResponse.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1) cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);

              const rawJson = JSON.parse(cleanResponse);
              const rawList = Array.isArray(rawJson.evidence) ? rawJson.evidence : [];

              if (rawList.length > 0) {
                await poolClient.query('BEGIN');
                for (const item of rawList) {
                  const quote = item.quote || item.Quote || item.evidence || "";
                  if (!quote) continue;

                  let kbText = item.kb || item.KB || "General Evidence";

                  // Try to find the official matching string from the dictionary
                  if (levelObj.keyBehavior && Array.isArray(levelObj.keyBehavior)) {
                      const aiClean = normalizeKb(kbText);
                      
                      // Find match in the official list
                      const match = levelObj.keyBehavior.find((canonical: string) => {
                          const canonicalClean = normalizeKb(canonical);
                          // Check for exact match of text content OR if one contains the other
                          // (e.g. AI truncated end or Dictionary has extra context)
                          return canonicalClean === aiClean || 
                                 (aiClean.length > 10 && canonicalClean.includes(aiClean));
                      });

                      if (match) {
                          kbText = match; // Swap AI text for the Official Dictionary Text
                      }
                  }

                  await poolClient.query(
                    `INSERT INTO evidence (report_id, competency, level, kb, quote, source, reasoning, is_ai_generated)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                      reportId,
                      compName,
                      String(levelNum),
                      kbText,
                      quote,
                      sourceTag,
                      item.reasoning || "",
                      true
                    ]
                  );
                }
                await poolClient.query('COMMIT');

                totalEvidenceCount += rawList.length;

                // Notify frontend to refresh
                await publishEvent(userId, 'evidence-batch-saved', {
                  reportId,
                  count: rawList.length,
                  competency: compName
                });
              }
            } catch (e) {
              console.error(`Failed to parse batch for ${compName} L${levelNum}`, e);
            }
          } // End level loop
        } // End file loop
      } // End competency loop

      // --- FINALIZE ---
      await query("UPDATE reports SET status = 'COMPLETED' WHERE id = $1", [reportId]);

      await publishEvent(userId, 'generation-complete', {
        reportId: reportId,
        phase: 1,
        status: 'COMPLETED',
        message: `Analysis complete. Total ${totalEvidenceCount} items.`
      });

      return { status: 'COMPLETED', count: totalEvidenceCount };

  } catch (error: any) {
    await poolClient.query('ROLLBACK');

    // 1. Handle Cancellation Gracefully
    if (error.message === "CANCELLED_BY_USER" || error.name === 'AbortError') {
      console.log(`[Worker] Job ${currentJobId} cancelled by user.`);
      
      await publishEvent(userId, 'generation-cancelled', {
        reportId,
        message: "AI Generation stopped safely."
      });

      return { status: 'CANCELLED' };
    }
    console.error(`[Worker] 🚨 Global Error:`, error.message);

    if (attemptsMade >= 5) {
      await query("UPDATE reports SET status = 'FAILED' WHERE id = $1", [reportId]);
      await publishEvent(userId, 'generation-failed', {
          reportId, phase: 1, status: 'FAILED', message: "AI unavailable."
      });
    } else {
        try {
          await checkCancellation(reportId, userId, currentJobId);
        } catch (e: any) {
          if (e.message === "CANCELLED_BY_USER") 
            return { status: 'CANCELLED' }; 
        }

        const nextDelay = Math.pow(2, attemptsMade) * 2;
        await publishEvent(userId, 'ai-stream', { 
          reportId, 
          chunk: `\n❌ Error: ${error.message}. Retrying in ~${nextDelay}s...\n` 
        });
        throw error;
    }
    return { status: 'FAILED' };
  } finally {
    poolClient.release();
  }
}