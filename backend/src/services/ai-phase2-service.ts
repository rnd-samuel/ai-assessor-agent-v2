// backend/src/services/ai-phase2-service.ts
import { pool, query } from './db';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { publishEvent } from './redis-publisher';
import { Job } from 'bullmq';
import { clearInterval } from 'timers';

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "HTTP-Referer": "https://ai-assessor-agent.com", "X-Title": "AI Assessor Agent" }
});

// --- CONSTANTS: DEFAULT PROMPTS ---
// (Fallback if not set in Admin Panel/Project Settings)
const DEFAULT_JUDGMENT_INSTRUCTIONS = `
INSTRUCTIONS:
For EACH Key Behavior, determine the status:
1. **FULFILLED**: The candidate explicitly demonstrated this behavior.
2. **CONTRA_INDICATOR**: The candidate demonstrated the OPPOSITE or FAILED this behavior (e.g., was rude when they should have been polite). This is a "Negative Indicator".
3. **NOT_OBSERVED**: There is no evidence for this. Either they didn't do it, or the simulation didn't require it.

IMPORTANT: 
- "NOT_OBSERVED" is neutral. 
- "CONTRA_INDICATOR" is a penalty. 
- Be strict about "CONTRA_INDICATOR". Only use it if there is clear negative evidence.
`;

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

async function smartAIRequest(
  payload: any, 
  reportId: string, 
  userId: string, 
  jobId: string
) {
  const controller = new AbortController();
  const signal = controller.signal;

  // Heartbeat: Check DB every 1.5s
  const poller = setInterval(async () => {
    try {
      await checkCancellation(reportId, userId, jobId);
    } catch (e) {
      console.log(`[SmartAI] Detected cancellation for job ${jobId}. Aborting OpenAI request.`);
      controller.abort(); // <--- Kills the AI request
      clearInterval(poller);
    }
  }, 1500);

  try {
    const response = await openai.chat.completions.create({ ...payload }, { signal });
    clearInterval(poller);
    return response;
  } catch (error: any) {
    clearInterval(poller);
    if (error.name === 'AbortError') {
      throw new Error("CANCELLED_BY_USER");
    }
    throw error;
  }
}

// --- OUTPUT SCHEMAS ---

const KB_STATUS = z.enum(['FULFILLED', 'NOT_OBSERVED', 'CONTRA_INDICATOR']);

const LevelEvaluationSchema = z.object({
  key_behaviors: z.array(z.object({
    kb_text_fragment: z.string(),
    status: KB_STATUS,
    reasoning: z.string(),
    evidence_quote_ids: z.array(z.string()).optional() 
  }))
});

export async function runPhase2Generation(reportId: string, userId: string, job: Job) {
  const currentJobId = job.id || "unknown";
  console.log(`[Worker] Starting Context-Aware Phase 2 for Report: ${reportId}`);
  
  await publishEvent(userId, 'ai-stream', { 
      reportId, 
      chunk: "🧠 Initializing Executive Assessor Logic...\n" 
  });

  const client = await pool.connect();

  try {
    // --- FETCH CONFIG & CONTEXT ---
    const settingsRes = await query("SELECT value FROM system_settings WHERE key = 'ai_config'");
    const aiConfig = settingsRes.rows[0]?.value || {};
    
    // Models
    const judgmentModel = aiConfig.judgmentLLM || "google/gemini-2.5-flash-lite-preview-09-2025";
    const narrativeModel = aiConfig.narrativeLLM || "google/gemini-2.5-pro";

    // Prompts Configuration
    // 1. Judgment Prompt: Global Admin Setting (fallback to default)
    const judgmentInstructions = aiConfig.judgment_prompt || DEFAULT_JUDGMENT_INSTRUCTIONS;

    // Fetch Report & Project Data
    const reportRes = await query('SELECT project_id, target_levels FROM reports WHERE id = $1', [reportId]);
    const report = reportRes.rows[0];
    const targetLevels = report.target_levels || {};

    const projectRes = await query(
      `SELECT cd.content as dictionary, pp.persona_prompt, pp.analysis_prompt 
       FROM projects p 
       JOIN competency_dictionaries cd ON p.dictionary_id = cd.id 
       JOIN project_prompts pp ON p.id = pp.project_id
       WHERE p.id = $1`, 
      [report.project_id]
    );
    const { dictionary, persona_prompt, analysis_prompt } = projectRes.rows[0];

    // Fetch Simulation Contexts
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

    // Fetch Evidence
    const evidenceRes = await query(
      `SELECT id, competency, level, kb, quote, source, reasoning 
       FROM evidence WHERE report_id = $1 AND is_archived = false`,
      [reportId]
    );
    const allEvidence = evidenceRes.rows;

    await client.query('DELETE FROM competency_analysis WHERE report_id = $1', [reportId]);

    // --- ORCHESTRATOR LOOP ---
    for (const comp of dictionary.kompetensi) {
      try { await checkCancellation(reportId, userId, currentJobId); }
      catch (e: any) { if (e.message === "CANCELLED_BY_USER") return { status: 'CANCELLED' }; throw e; }

      const compName = comp.name || comp.namaKompetensi;
      const compId = comp.id || compName; 
      const targetLevel = parseInt(targetLevels[compId] || "3");

      const relevantEvidence = allEvidence.filter((e: any) =>
        e.competency.trim().toLowerCase() === compName.trim().toLowerCase()
      );

      await publishEvent(userId, 'ai-stream', { 
          reportId, 
          chunk: `\n🔍 Analyzing: **${compName}** (Target: ${targetLevel})\n` 
      });

      // 1. Evaluate All Levels
      const levelResults: Record<number, any[]> = {};
      const levelsToTest = comp.level.map((l: any) => parseInt(l.nomor));

      for (const levelNum of levelsToTest) {
         await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Checking Level ${levelNum}...\n` });
         
         const judgments = await evaluateLevel(
            comp, levelNum, relevantEvidence, judgmentModel,
            simContextMap, judgmentInstructions,
            reportId, userId, currentJobId
         );
         levelResults[levelNum] = judgments;
      }

      // 2. Score Calculation
      const { finalLevel, logicExplanation } = calculateScoreWithImpliedCompetence(levelResults);

      if (finalLevel >= targetLevel) {
          await publishEvent(userId, 'ai-stream', { reportId, chunk: `✅ Target Met (Level ${finalLevel})\n` });
      } else {
          await publishEvent(userId, 'ai-stream', { reportId, chunk: `⚠️ Target Missed (Level ${finalLevel})\n` });
      }

      await publishEvent(userId, 'ai-stream', { reportId, chunk: `✍️ Drafting analysis narrative...\n` });
      
      const narrativeData = await generateNarrative(
          compName, finalLevel, targetLevel, levelResults, 
          narrativeModel, persona_prompt, analysis_prompt, logicExplanation,
          reportId, userId, currentJobId // Pass ID for polling
      );

      // 4. Save to Database
      await client.query('BEGIN');

      const analysisInsert = await client.query(
        `INSERT INTO competency_analysis 
         (report_id, competency, level_achieved, explanation, development_recommendations)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          reportId, compName, finalLevel, narrativeData.explanation,
          `**Personal Development:**\n${narrativeData.development_recommendations.personal}\n\n` +
          `**Assignment:**\n${narrativeData.development_recommendations.assignment}\n\n` +
          `**Training:**\n${narrativeData.development_recommendations.training}`
        ]
      );
      const analysisId = analysisInsert.rows[0].id;

      for (const [lvlStr, kbs] of Object.entries(levelResults)) {
          const levelNum = parseInt(lvlStr);
          for (const kb of (kbs as any[])) {
              const kbInsert = await client.query(
                  `INSERT INTO analysis_key_behaviors (analysis_id, level, kb_text, status, reasoning)
                   VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                  [analysisId, levelNum, kb.kbText, kb.status, kb.reasoning]
              );
              
              // Validate and Link Evidence
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

    await query("UPDATE reports SET status = 'COMPLETED' WHERE id = $1", [reportId]);
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
    await query("UPDATE reports SET status = 'FAILED' WHERE id = $1", [reportId]);
    await publishEvent(userId, 'generation-failed', { reportId, message: error.message });
    throw error;
  } finally {
    client.release();
  }
}

// --- INTELLIGENCE FUNCTIONS ---

async function evaluateLevel(
    comp: any, level: number, allRelevantEvidence: any[], model: string,
    simContextMap: Record<string, string>, instructions: string,
    reportId: string, userId: string, jobId: string
) {
    const lvlObj = comp.level.find((l: any) => String(l.nomor) === String(level));
    if (!lvlObj) return [];

    const evidenceListText = allRelevantEvidence.map((e: any) => 
        `SOURCE [${e.source}] (ID:${e.id}): "${e.quote}"\n   Context: ${e.reasoning}`
    ).join('\n\n');

    const prompt = `
    TASK: Determine fulfillment of Level ${level} for "${comp.name || comp.namaKompetensi}".
    
    DEFINITION: ${lvlObj.penjelasan}
    
    KEY BEHAVIORS:
    ${lvlObj.keyBehavior.map((kb: string, i: number) => `${i+1}. ${kb}`).join('\n')}
    
    EVIDENCE POOL:
    ${evidenceListText || "No specific evidence found."}
    
    SIMULATION CONTEXTS (Use to judge source relevance):
    ${Object.entries(simContextMap).map(([k, v]) => `[${k}]: ${v}`).join('\n\n')}

    *** CRITICAL INSTRUCTION ON SOURCE RELEVANCE ***
    - **EVIDENCE MATCHING:** Check if the candidate's actions in the EVIDENCE POOL specifically match the Key Behaviors.
    - **STRICT SCORING:** - Only mark **FULFILLED** if there is *explicit, strong* evidence. Vague or weak evidence should be "NOT_OBSERVED".
       - Do not give "benefit of the doubt". If they didn't do it, it is NOT_OBSERVED.
    - **Relevance Rule:** If a Key Behavior is missing from a source (e.g., Roleplay) but that source is NOT designed to measure this specific competency (e.g., it measures Communication, not Analytics), ignore the absence. 
    - **Single Source Sufficiency:** If evidence exists in *at least one* valid source, mark the behavior as **FULFILLED**. Do not require consistency across all sources.
    - **Negative Evidence:** Only mark **CONTRA_INDICATOR** if the candidate actively demonstrated *bad* behavior. Simple absence is NOT a contra-indicator.

    ${instructions}

    OUTPUT JSON:
    {
      "key_behaviors": [
        {
          "kb_text_fragment": "...",
          "status": "FULFILLED" | "NOT_OBSERVED" | "CONTRA_INDICATOR",
          "reasoning": "Explain why, explicitly mentioning the source used.",
          "evidence_quote_ids": ["..."]
        }
      ]
    }
    `;

    // USE SMART REQUEST (POLLING)
    const response = await smartAIRequest(
        {
            model: model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2
        },
        reportId, userId, jobId
    );

    const rawContent = response.choices[0].message.content || "{}";
    const parsed = LevelEvaluationSchema.safeParse(JSON.parse(rawContent));

    if (!parsed.success) return [];

    return lvlObj.keyBehavior.map((kbText: string, i: number) => {
        const aiResult = parsed.data.key_behaviors[i] || {};
        return {
            kbText,
            status: aiResult.status || 'NOT_OBSERVED',
            reasoning: aiResult.reasoning || "No data",
            evidenceIds: aiResult.evidence_quote_ids || []
        };
    });
}

function calculateScoreWithImpliedCompetence(levelResults: Record<number, any[]>) {
    let finalLevel = 0;
    const explanationParts: string[] = [];
    const maxLevel = 5;

    // 1. Contra-Indicator Check (Hard Ceiling)
    let ceiling = maxLevel + 1;
    for (let l = 1; l <= maxLevel; l++) {
        if (!levelResults[l]) continue;
        const contras = levelResults[l].filter((k: any) => k.status === 'CONTRA_INDICATOR');
        if (contras.length > 0) {
            explanationParts.push(`Observed negative behavior at Level ${l}. Score capped.`);
            ceiling = l; 
            break;
        }
    }

    // 2. Find Highest "Real" Pass (Strict Threshold 0.75)
    let highestFulfilled = 0;
    for (let l = 1; l < ceiling; l++) {
        if (!levelResults[l]) break;
        const fulfilled = levelResults[l].filter((k: any) => k.status === 'FULFILLED').length;
        if (fulfilled / levelResults[l].length >= 0.75) highestFulfilled = l;
        else break; 
    }

    // 3. Implied Pass Logic
    for (let l = 1; l < ceiling; l++) {
        const kbs = levelResults[l] || [];
        const fulfilled = kbs.filter((k: any) => k.status === 'FULFILLED');
        const notObserved = kbs.filter((k: any) => k.status === 'NOT_OBSERVED');
        
        const isRealPass = fulfilled.length >= Math.ceil(kbs.length * 0.75);
        const isImpliedPass = (l < highestFulfilled) && (fulfilled.length + notObserved.length === kbs.length);

        if (isRealPass) finalLevel = l;
        else if (isImpliedPass) {
            finalLevel = l;
            explanationParts.push(`Level ${l} deemed competent via implication (demonstrated Level ${highestFulfilled} capability).`);
        } else {
            break; 
        }
    }

    return { finalLevel, logicExplanation: explanationParts.join(' ') };
}

async function generateNarrative(
    compName: string, finalLevel: number, targetLevel: number, levelResults: any,
    model: string, persona: string, customPrompt: string, logicExplanation: string,
    reportId: string, userId: string, jobId: string
) {
    let evidenceSummary = "";
    for (const [lvl, kbs] of Object.entries(levelResults)) {
        // @ts-ignore
        const significant = kbs.filter(k => k.status !== 'NOT_OBSERVED');
        if (significant.length > 0) {
            evidenceSummary += `\nLevel ${lvl} Findings:\n`;
            // @ts-ignore
            significant.forEach(k => evidenceSummary += `- [${k.status}] ${k.kbText}: ${k.reasoning}\n`);
        }
    }

    const prompt = `
    ${persona}
    ${customPrompt}

    TASK: Write the final assessment narrative for "${compName}".
    
    CONTEXT:
    - Final Score: ${finalLevel} (Target: ${targetLevel})
    - Logic: ${logicExplanation}
    
    KEY OBSERVATIONS:
    ${evidenceSummary}

    *** STYLE & TONE GUIDELINES (STRICT) ***
    1. **NO JARGON:** Do not use words like "Level 1", "Target Level", "Key Behavior", "Contra-Indicator", or "Dictionary".
    2. **DESCRIPTIVE & GENERALIZED:** - Describe the *pattern* of behavior, not just the specific event.
       - **CRITICAL:** Do NOT use specific names from the simulation (e.g., "Fani", "Pak Budi", "PT Maju").
       - Instead of "He told Fani to fix the report", write "He provides direct feedback to subordinates regarding work quality."
       - Instead of "In the meeting with the union", write "In negotiation situations..."
    3. **DIRECT:** Be professional and concise. Use "The assessee", "He/She", or the candidate's name.
    4. **RECOMMENDATIONS:** Must be actionable, specific to the gaps identified, and follow the 3 categories below.

    OUTPUT JSON:
    {
      "explanation": "A descriptive paragraph explaining their performance.",
      "development_recommendations": {
         "personal": "Specific self-learning actions.",
         "assignment": "On-the-job tasks to practice.",
         "training": "Formal training topics."
      }
    }
    `;
    const response = await smartAIRequest(
        {
            model: model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.7
        },
        reportId, userId, jobId
    );

    const raw = response.choices[0].message.content || "{}";
    return JSON.parse(raw); 
}