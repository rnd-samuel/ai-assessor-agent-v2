// backend/src/services/ai-phase2-service.ts
import { pool, query } from './db';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { publishEvent } from './redis-publisher';
import { Job } from 'bullmq';
import { logAIInteraction } from './ai-log-service';

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "HTTP-Referer": "https://ai-assessor-agent.com", "X-Title": "AI Assessor Agent" }
});

// --- DEFAULTS (Fallback if DB is empty) ---
const DEFAULT_KB_PROMPT = "Evaluate if the candidate demonstrated the key behaviors based on the evidence.";
const DEFAULT_LEVEL_PROMPT = "Determine the final competency level and write a descriptive narrative.";
const DEFAULT_DEV_PROMPT = "Provide development recommendations based on the gaps.";

// --- HELPER: Cancellation Check ---
async function checkCancellation(reportId: string, userId: string, currentJobId?: string) {
  const res = await query("SELECT status, active_job_id FROM reports WHERE id = $1", [reportId]);
  if (res.rows.length === 0) throw new Error("CANCELLED_BY_USER");
    
  const { status, active_job_id } = res.rows[0];

  if (status !== 'PROCESSING') {
    await publishEvent(userId, 'ai-stream', { 
      reportId, 
      chunk: `\n⛔ Process stopped (Status: ${status}). Aborting job.\n` 
    });
    throw new Error("CANCELLED_BY_USER");
  }

  if (currentJobId && active_job_id && String(active_job_id) !== String(currentJobId)) {
    console.warn(`[Worker] Job ${currentJobId} aborted. New job ${active_job_id} has taken over.`);
    throw new Error("CANCELLED_BY_USER");
  }
}

// --- HELPER: Smart Request with Polling ---
async function smartAIRequest(
  payload: any, 
  reportId: string, 
  userId: string, 
  jobId: string,
  projectId: string,
  actionName: string
) {
  const startTime = Date.now();
  const controller = new AbortController();

  // Heartbeat: Check DB every 1.5s
  const poller = setInterval(async () => {
    try {
      await checkCancellation(reportId, userId, jobId);
    } catch (e) {
      console.log(`[SmartAI] Detected cancellation for job ${jobId}. Aborting OpenAI request.`);
      controller.abort(); 
      clearInterval(poller);
    }
  }, 1500);

  try {
    const response = await openai.chat.completions.create({ ...payload }, { signal: controller.signal });
    clearInterval(poller);

    // Log Success
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
    const aiLogId = await logAIInteraction({
      userId, reportId, projectId,
      action: actionName,
      model: payload.model,
      prompt: JSON.stringify(payload.messages),
      response: response.choices[0].message.content || "",
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      durationMs: Date.now() - startTime,
      status: 'SUCCESS'
    });

    return { response, aiLogId };
  } catch (error: any) {
    // Log Failure
    await logAIInteraction({
      userId, reportId, projectId,
      action: actionName,
      model: payload.model,
      prompt: JSON.stringify(payload.messages),
      response: "",
      durationMs: Date.now() - startTime,
      status: 'FAILED',
      errorMessage: error.message
    });

    clearInterval(poller);
    if (error.name === 'AbortError') {
      throw new Error("CANCELLED_BY_USER");
    }
    throw error;
  }
}

// --- OUTPUT SCHEMAS ---

const KB_STATUS = z.enum(['FULFILLED', 'NOT_OBSERVED', 'CONTRA_INDICATOR']);

// Task 1 Output
const KeyBehaviorEvaluationSchema = z.object({
  key_behaviors: z.array(z.object({
    kb_text_fragment: z.string(),
    status: KB_STATUS,
    reasoning: z.string(),
    evidence_quote_ids: z.array(z.string()).optional() 
  }))
});

// Task 2 Output
const LevelAndNarrativeSchema = z.object({
  final_level: z.number().int(),
  explanation: z.string()
});

// Task 3 Output
const RecommendationsSchema = z.object({
  individual: z.string(),
  assignment: z.string(),
  training: z.string()
});


export async function runPhase2Generation(reportId: string, userId: string, job: Job) {
  const currentJobId = job.id || "unknown";

  // Retry Logic Setup
  const attemptsMade = job.attemptsMade;
  const isBackupTry = attemptsMade >= 3;
  const providerLabel = isBackupTry ? "Backup LLM" : "Main LLM";

  console.log(`[Worker] Starting Senior Assessor Phase 2. Attempt ${attemptsMade + 1}/6 using ${providerLabel}.`);
  
  await publishEvent(userId, 'ai-stream', { 
      reportId, 
      chunk: `🧠 Initializing Senior Assessor Pipeline (Attempt ${attemptsMade + 1}/6 using ${providerLabel})...\n`
  });

  if (isBackupTry && attemptsMade === 3) {
    await publishEvent(userId, 'ai-stream', { 
      reportId, 
      chunk: `⚠️ Main LLM failed 3 times. Switching to Backup LLM...\n` 
    });
  }

  const client = await pool.connect();

  try {
    // --- 1. FETCH CONFIG & CONTEXT ---
    const settingsRes = await query("SELECT value FROM system_settings WHERE key = 'ai_config'");
    const aiConfig = settingsRes.rows[0]?.value || {};

    // Model Selection Logic
    let judgmentModel, narrativeModel, temperature;
    if (isBackupTry) {
      const backup = aiConfig.backupLLM || "google/gemini-2.5-flash-lite-preview-09-2025";
      judgmentModel = backup;
      narrativeModel = backup;
      temperature = aiConfig.backupTemp ?? 0.5;
    } else {
      judgmentModel = aiConfig.judgmentLLM || "google/gemini-2.5-flash-lite-preview-09-2025";
      narrativeModel = aiConfig.narrativeLLM || "google/gemini-2.5-pro";
      temperature = aiConfig.judgmentTemp ?? 0.2;
    }

    const reportRes = await query('SELECT project_id, target_levels, specific_context FROM reports WHERE id = $1', [reportId]);
    const report = reportRes.rows[0];
    const targetLevels = report.target_levels || {};
    const projectId = report.project_id;
    const specificContext = report.specific_context || "";

    // Global Knowledge Base
    const globalRes = await query("SELECT value FROM system_settings WHERE key = 'global_context_guide'");
    const globalKb = globalRes.rows[0]?.value?.text || "";

    const projectRes = await query(
      `SELECT 
         cd.content as dictionary, 
         pp.persona_prompt,
         pp.kb_fulfillment_prompt,
         pp.competency_level_prompt,
         pp.development_prompt,
         pp.general_context,
         p.context_guide as project_kb
       FROM projects p 
       JOIN competency_dictionaries cd ON p.dictionary_id = cd.id 
       JOIN project_prompts pp ON p.id = pp.project_id
       WHERE p.id = $1`, 
      [report.project_id]
    );
    const { dictionary, persona_prompt, general_context, project_kb } = projectRes.rows[0];

    // Fallbacks for prompts (Handle legacy projects or missing fields)
    const kbPrompt = projectRes.rows[0].kb_fulfillment_prompt || DEFAULT_KB_PROMPT;
    const levelPrompt = projectRes.rows[0].competency_level_prompt || DEFAULT_LEVEL_PROMPT;
    const devPrompt = projectRes.rows[0].development_prompt || DEFAULT_DEV_PROMPT;

    // Fetch Simulation Contexts (Source Info)
    const simContextsRes = await query(
        `SELECT gsm.name as method_name, gsf.context_guide
         FROM projects_to_simulation_files ptsf
         JOIN global_simulation_files gsf ON ptsf.file_id = gsf.id
         JOIN global_simulation_methods gsm ON gsf.method_id = gsm.id
         WHERE ptsf.project_id = $1 AND gsf.context_guide IS NOT NULL`,
        [report.project_id]
    );
    const simContextMap: Record<string, string> = {};
    simContextsRes.rows.forEach(row => {
        simContextMap[row.method_name] = row.context_guide;
    });

    const evidenceRes = await query(
      `SELECT id, competency, level, kb, quote, source, reasoning 
       FROM evidence WHERE report_id = $1 AND is_archived = false`,
      [reportId]
    );
    const allEvidence = evidenceRes.rows;

    // Resume Logic
    // 1. Check which competencies are already fully analzyed in DB
    const existingAnalysis = await query(
      `SELECT competency FROM competency_analysis WHERE report_id = $1`,
      [reportId]
    );

    // Create a Set for fast lookup of completed competencies
    const completedCompetencies = new Set(existingAnalysis.rows.map(r => r.competency));

    if (completedCompetencies.size > 0) {
      console.log(`[Worker] Found ${completedCompetencies.size} completed competencies. Resuming...`);
      await publishEvent(userId, 'ai-stream', {
        reportId,
        chunk: `\n⏩ Resuming: Found ${completedCompetencies.size} completed analysis sections.\n`
      });
    }

    // --- 2. ORCHESTRATOR LOOP ---
    for (const comp of dictionary.kompetensi) {
      try { await checkCancellation(reportId, userId, currentJobId); }
      catch (e: any) { if (e.message === "CANCELLED_BY_USER") return { status: 'CANCELLED' }; throw e; }

      const compName = comp.name || comp.namaKompetensi;

      // Skip Check: If already done, skip to next
      if (completedCompetencies.has(compName)) {
        continue;
      }

      const compId = comp.id || compName; 
      const targetLevel = parseInt(targetLevels[compId] || "3");

      const relevantEvidence = allEvidence.filter((e: any) =>
        e.competency.trim().toLowerCase() === compName.trim().toLowerCase()
      );

      await publishEvent(userId, 'ai-stream', { 
          reportId, 
          chunk: `\n🔍 Analyzing: **${compName}** (Target: ${targetLevel})\n` 
      });

      // --- STEP 1: KEY BEHAVIOR CHECK ---
      const maxDictLevel = comp.level.length; 
      const levelsToTest: number[] = [];

      if (targetLevel === 1) {
          levelsToTest.push(1, 2);
      } else if (targetLevel >= maxDictLevel) {
          levelsToTest.push(maxDictLevel - 1, maxDictLevel);
      } else {
          levelsToTest.push(targetLevel - 1, targetLevel, targetLevel + 1);
      }
      
      const initialLevels = levelsToTest.filter(l => l > 0 && l <= maxDictLevel);
      const levelResults: Record<number, any[]> = {};
      const levelLogIds: Record<number, string | null> = {};

      // Run Default Batch
      for (const levelNum of initialLevels) {
         await publishEvent(userId, 'ai-stream', { reportId, chunk: `> [Task 1/3] Checking KB Fulfillment for Level ${levelNum}...\n` });
         
         const { judgments, aiLogId } = await evaluateKeyBehaviors(
            comp, levelNum, relevantEvidence, judgmentModel, 
            persona_prompt, simContextMap, kbPrompt,
            general_context, specificContext,
            globalKb, project_kb,
            reportId, userId, currentJobId, projectId
         );
         levelResults[levelNum] = judgments;
         levelLogIds[levelNum] = aiLogId;
      }

      // Upward Expansion Rule
      // Rule: Move higher ONLY if ALL KBs of ALL tested levels so far are FULFILLED.
      let currentHigh = Math.max(...initialLevels);
      
      while (currentHigh < maxDictLevel) {
          // Flatten all results collected so far
          const allKBs = Object.values(levelResults).flat();
          const allFulfilled = allKBs.every((kb: any) => kb.status === 'FULFILLED');

        if (allFulfilled) {
          const nextLevel = currentHigh + 1;
          await publishEvent(userId, 'ai-stream', { reportId, chunk: `> [Task 1/3] 🟢 Perfect Performance. Expanding Upward to Level ${nextLevel}...\n` });
          
          const { judgments, aiLogId } = await evaluateKeyBehaviors(
            comp, nextLevel, relevantEvidence, judgmentModel, persona_prompt,
            simContextMap, kbPrompt, general_context, specificContext,
            globalKb, project_kb,
            reportId, userId, currentJobId, projectId
          );
          levelResults[nextLevel] = judgments;
          levelLogIds[nextLevel] = aiLogId;
          currentHigh = nextLevel;
        } else {
            break; // Stop if any imperfection found
        }
      }

      // Downward Expansion Rule
      // Rule: Move lower ONLY if ALL KBs of ALL tested levels so far are NOT FULFILLED (Missed).
      let currentLow = Math.min(...initialLevels);

      while (currentLow > 1) {
        const results = levelResults[currentLow];
        if (!results) break;

        // Flatten all results collected so far
        const allKBs = Object.values(levelResults).flat();
        // "Not Fulfilled" covers NOT_OBSERVED and CONTRA_INDICATOR
        const noneFulfilled = allKBs.every((kb: any) => kb.status !== 'FULFILLED');

        if (noneFulfilled) {
          const nextLevel = currentLow - 1;
          await publishEvent(userId, 'ai-stream', { reportId, chunk: `> [Task 1/3] 🔴 Zero Fulfillment. Expanding Downward to Level ${nextLevel}...\n` });

          const { judgments, aiLogId } = await evaluateKeyBehaviors(
            comp, nextLevel, relevantEvidence, judgmentModel, persona_prompt,
            simContextMap, kbPrompt, general_context, specificContext,
            globalKb, project_kb,
            reportId, userId, currentJobId, projectId
          );
          levelResults[nextLevel] = judgments;
          levelLogIds[nextLevel] = aiLogId;
          currentLow = nextLevel
        } else {
          break; // Stop if at least one KB is fulfilled
        }
      }

      // Collect all checked levels for Task 2
      const allCheckedLevels = Object.keys(levelResults).map(Number).sort((a,b) => a - b);

      // --- STEP 2: LEVEL ASSIGNMENT & NARRATIVE ---
      await publishEvent(userId, 'ai-stream', { reportId, chunk: `> [Task 2/3] Determining Final Level & Writing Narrative...\n` });

      const { finalLevel, explanation, aiLogId: narrativeLogId } = await determineLevelAndNarrative(
          compName, targetLevel, allCheckedLevels, levelResults, comp.level,
          narrativeModel, persona_prompt, levelPrompt, general_context, specificContext,
          globalKb, project_kb,
          reportId, userId, currentJobId, projectId
      );

      // --- STEP 3: DEVELOPMENT RECOMMENDATIONS ---
      await publishEvent(userId, 'ai-stream', { reportId, chunk: `> [Task 3/3] Generating Recommendations...\n` });

      const recommendations = await generateRecommendations(
          compName, finalLevel, levelResults,
          narrativeModel, persona_prompt, devPrompt, general_context,
          specificContext, globalKb, project_kb,
          reportId, userId, currentJobId, projectId
      );
      const recLogId = recommendations.aiLogId;

      // --- 4. SAVE TO DATABASE ---
      await client.query('BEGIN');

      // Double check cleanup for THIS SPECIFIC competency before inserting
      // (Handles cases where a previous run crashed mid-save, though unlikely with transaction)
      await client.query('DELETE FROM competency_analysis WHERE report_id = $1 AND competency = $2', [reportId, compName]);

      const analysisInsert = await client.query(
        `INSERT INTO competency_analysis 
         (report_id, competency, level_achieved, explanation, development_recommendations, narrative_log_id, recommendations_log_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          reportId, compName, finalLevel, explanation,
          `**Personal Development:**\n${recommendations.individual}\n\n` +
          `**Assignment:**\n${recommendations.assignment}\n\n` +
          `**Training:**\n${recommendations.training}`,
          narrativeLogId,
          recLogId
        ]
      );
      const analysisId = analysisInsert.rows[0].id;

      for (const [lvlStr, kbs] of Object.entries(levelResults)) {
          const levelNum = parseInt(lvlStr);
          const judgmentLogId = levelLogIds[levelNum];
          for (const kb of (kbs as any[])) {
              const kbInsert = await client.query(
                  `INSERT INTO analysis_key_behaviors (analysis_id, level, kb_text, status, reasoning, judgment_log_id)
                   VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                  [analysisId, levelNum, kb.kbText, kb.status, kb.reasoning, judgmentLogId]
              );
              
              if (kb.evidenceIds && kb.evidenceIds.length > 0) {
                  const validIds = kb.evidenceIds.filter((aiId: string) => 
                      allEvidence.some((realEv: any) => realEv.id === aiId)
                  );
                  for (const evId of validIds) {
                      await client.query(
                          `INSERT INTO analysis_evidence_links (kb_analysis_id, evidence_id)
                           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                          [kbInsert.rows[0].id, evId]
                      );
                  }
              }
          }
      }

      await client.query('COMMIT');
      await publishEvent(userId, 'evidence-batch-saved', { reportId, competency: compName, count: 1 });
    }

    await query("UPDATE reports SET status = 'COMPLETED', active_phase = NULL WHERE id = $1", [reportId]);
    await publishEvent(userId, 'generation-complete', {
        reportId, phase: 2, status: 'COMPLETED', message: "Competency Analysis Complete."
    });

    return { status: 'COMPLETED' };

  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.message === "CANCELLED_BY_USER") {
        await publishEvent(userId, 'generation-cancelled', { reportId, message: "Analysis stopped." });
        return { status: 'CANCELLED' };
    }
    await query("UPDATE reports SET status = 'FAILED', active_phase = NULL WHERE id = $1", [reportId]);
    await publishEvent(userId, 'generation-failed', { reportId, message: error.message });
    throw error;
  } finally {
    client.release();
  }
}

// --- INTELLIGENCE FUNCTIONS ---

function generateDefaultJudgments(lvlObj: any) {
    return lvlObj.keyBehavior.map((kbText: string) => ({
        kbText,
        status: 'NOT_OBSERVED',
        reasoning: "No evidence found for this key behavior.",
        evidenceIds: []
    }));
}

// TASK 1: KEY BEHAVIOR CHECK
async function evaluateKeyBehaviors(
    comp: any, level: number, allRelevantEvidence: any[], model: string, persona: string,
    simContextMap: Record<string, string>, instructions: string, projectContext: string,
    globalKb: string, projectKb: string,
    reportContext: string, reportId: string, userId: string, jobId: string, projectId: string
) {
    const lvlObj = comp.level.find((l: any) => String(l.nomor) === String(level));
    if (!lvlObj) return [];

    // If absolutely no evidence exists for this competency, skip AI and return defaults.
    if (!allRelevantEvidence || allRelevantEvidence.length === 0) {
        return generateDefaultJudgments(lvlObj);
    }

    const evidenceListText = allRelevantEvidence.map((e: any) => 
        `[Level: ${e.level}] SOURCE [${e.source}] (ID:${e.id}): "${e.quote}"\n   Context: ${e.reasoning}`
    ).join('\n\n');

    // FIX: Explicitly appending the JSON schema structure to the prompt
    const prompt = `
    ${persona}
    ${instructions}

    === GLOBAL GUIDELINES ===
    ${globalKb || "N/A"}

    === PROJECT GUIDELINES ===
    ${projectKb || "N/A"}

    === DATA FOR ANALYSIS ===
    
    **COMPETENCY:** ${comp.name || comp.namaKompetensi}
    **LEVEL:** ${level}
    **DEFINITION:** ${lvlObj.penjelasan}
    
    **PROJECT CONTEXT:**
    ${projectContext}

    **REPORT SPECIFIC CONTEXT:**
    ${reportContext || "N/A"}

    **SIMULATION METHOD CONTEXTS:**
    ${Object.entries(simContextMap).map(([k, v]) => `[${k}]: ${v}`).join('\n\n')}

    **KEY BEHAVIORS TO EVALUATE:**
    ${lvlObj.keyBehavior.map((kb: string, i: number) => `${i+1}. ${kb}`).join('\n')}
    
    **EVIDENCE POOL:**
    ${evidenceListText || "No specific evidence found for this competency."}

    *** OUTPUT REQUIREMENT ***
    You MUST return a JSON object exactly matching this structure:
    {
      "key_behaviors": [
        {
          "kb_text_fragment": "A short snippet of the KB text to identify it",
          "status": "FULFILLED" | "NOT_OBSERVED" | "CONTRA_INDICATOR",
          "reasoning": "Explanation of the behavior. Do NOT include Evidence IDs in this text.",
          "evidence_quote_ids": ["ID1", "ID2"] 
        }
      ]
    }
    `;

    const { response, aiLogId } = await smartAIRequest(
        {
            model: model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2 
        },
        reportId, userId, jobId, projectId, 'PHASE_2_JUDGMENT'
    );

    const rawContent = response.choices[0].message.content || "{}";
    
    // Log for debugging if needed
    // console.log("AI Response Task 1:", rawContent);

    const parsed = KeyBehaviorEvaluationSchema.safeParse(JSON.parse(rawContent));

    if (!parsed.success) {
        console.error("Task 1 Parse Failed", parsed.error, rawContent);
        return { judgments: generateDefaultJudgments(lvlObj), aiLogId: null };
    }

    const judgments = lvlObj.keyBehavior.map((kbText: string, i: number) => {
        let aiResult: typeof parsed.data.key_behaviors[number] | undefined = parsed.data.key_behaviors[i];
        
        if (!aiResult) {
            aiResult = parsed.data.key_behaviors.find(k => k.kb_text_fragment && kbText.includes(k.kb_text_fragment));
        }

        return {
            kbText,
            status: aiResult?.status || 'NOT_OBSERVED',
            reasoning: aiResult?.reasoning || "No evidence found for this key behavior.",
            evidenceIds: aiResult?.evidence_quote_ids || []
        };
    });

    return { judgments, aiLogId };
}

// TASK 2: LEVEL ASSIGNMENT & NARRATIVE
async function determineLevelAndNarrative(
    compName: string, targetLevel: number, levelsChecked: number[], levelResults: any,
    allLevelDefinitions: any[],
    model: string, persona: string, instructions: string, projectContext: string,
    reportContext: string, globalKb: string, projectKb: string,
    reportId: string, userId: string, jobId: string, projectId: string
) {
    let resultsSummary = "";
    for (const lvl of levelsChecked) {
        resultsSummary += `\n--- LEVEL ${lvl} RESULTS ---\n`;
        const kbs = levelResults[lvl] || [];
        kbs.forEach((kb: any) => {
            resultsSummary += `- [${kb.status}] ${kb.kbText}: ${kb.reasoning}\n`;
        });
    }

    const levelDefs = allLevelDefinitions.map((l: any) => `Level ${l.nomor}: ${l.penjelasan}`).join('\n');

    // Enforcing JSON Output
    const prompt = `
    ${persona}
    ${instructions}

    === GLOBAL GUIDELINES ===
    ${globalKb || "N/A"}

    === PROJECT GUIDELINES ===
    ${projectKb || "N/A"}

    === DATA FOR DECISION ===
    **COMPETENCY:** ${compName}
    **TARGET LEVEL:** ${targetLevel}
    
    **PROJECT CONTEXT:**
    ${projectContext}

    **REPORT SPECIFIC CONTEXT:**
    ${reportContext || "N/A"}

    **DICTIONARY LEVELS:**
    ${levelDefs}

    **KB EVALUATION RESULTS (FROM TASK 1):**
    ${resultsSummary}

    *** OUTPUT REQUIREMENT ***
    Return ONLY a JSON object:
    {
      "final_level": <number>,
      "explanation": "<string>"
    }
    `;

    const { response, aiLogId } = await smartAIRequest(
        {
            model: model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.5
        },
        reportId, userId, jobId, projectId, 'PHASE_2_NARRATIVE'
    );

    const raw = response.choices[0].message.content || "{}";
    const parsed = LevelAndNarrativeSchema.safeParse(JSON.parse(raw));
    
    if (!parsed.success) {
        console.error("Task 2 Parse Failed", parsed.error, raw);
        return { finalLevel: 0, explanation: "Error generating explanation.", aiLogId: null };
    }
    return { finalLevel: parsed.data.final_level, explanation: parsed.data.explanation, aiLogId };
}

// TASK 3: DEVELOPMENT RECOMMENDATIONS
async function generateRecommendations(
    compName: string, finalLevel: number, levelResults: any,
    model: string, persona: string, instructions: string, projectContext: string,
    globalKb: string, projectKb: string,
    reportContext: string, reportId: string, userId: string, jobId: string, projectId: string
) {
    let gapsText = "";
    for (const [lvl, kbs] of Object.entries(levelResults)) {
        // @ts-ignore
        const gaps = kbs.filter(k => k.status !== 'FULFILLED');
        if (gaps.length > 0) {
            gapsText += `\nLevel ${lvl} Gaps:\n`;
            // @ts-ignore
            gaps.forEach(k => gapsText += `- ${k.kbText} (${k.status})\n`);
        }
    }

    if (!gapsText) {
        gapsText = "No specific gaps found (Target exceeded). Focus on mastery.";
    }

    const prompt = `
    ${persona}
    ${instructions}

    === DATA FOR RECOMMENDATIONS ===
    **COMPETENCY:** ${compName}
    **CURRENT ASSIGNED LEVEL:** ${finalLevel}

    === GLOBAL GUIDELINES ===
    ${globalKb || "N/A"}

    === PROJECT GUIDELINES ===
    ${projectKb || "N/A"}

    **PROJECT CONTEXT:**
    ${projectContext}

    **REPORT SPECIFIC CONTEXT:**
    ${reportContext || "N/A"}
    
    **IDENTIFIED GAPS:**
    ${gapsText}

    *** OUTPUT REQUIREMENT ***
    Return ONLY a JSON object:
    {
      "individual": "<markdown string>",
      "assignment": "<markdown string>",
      "training": "<markdown string>"
    }
    `;

    const { response, aiLogId } = await smartAIRequest(
        {
            model: model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.7 
        },
        reportId, userId, jobId, projectId, 'PHASE_2_RECOMMENDATIONS'
    );

    const raw = response.choices[0].message.content || "{}";
    const parsed = RecommendationsSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
        console.error("Task 3 Parse Failed", parsed.error, raw);
        return { individual: "No data", assignment: "No data", training: "No data", aiLogId: null };
    }
    return { ...parsed.data, aiLogId };
}