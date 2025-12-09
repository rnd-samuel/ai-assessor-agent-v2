// backend/src/services/ai-phase2-service.ts
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

// --- HELPER: Normalize KB for matching
const normalizeKb = (str: string) => {
  return str
    .replace(/^(kb|key\s*behavior)?[\d\w\.\-\s]+/i, '') 
    .trim()
    .toLowerCase();
};

// --- HELPER: Cancellation Check ---
async function checkCancellation(reportId: string, userId: string, currentJobId?: string) {
  const res = await query("SELECT status, active_job_id FROM reports WHERE id = $1", [reportId]);
  if (res.rows.length === 0) throw new Error("CANCELLED_BY_USER");
    
  const { status, active_job_id } = res.rows[0];

  // Status Check
  if (status !== 'PROCESSING') {
    await publishEvent(userId, 'ai-stream', { 
      reportId, 
      chunk: `\n⛔ Process stopped (Status: ${status}). Aborting job.\n` 
    });
    throw new Error("CANCELLED_BY_USER");
  }

  // Identity Check (Zombie Protection)
  if (currentJobId && active_job_id && String(active_job_id) !== String(currentJobId)) {
    console.warn(`[Worker] Job ${currentJobId} aborted. New job ${active_job_id} has taken over.`);
    throw new Error("CANCELLED_BY_USER");
  }
}

// Output Schema
const LevelEvaluationSchema = z.object({
  key_behaviors: z.array(z.object({
    kb_text: z.string(),
    fulfilled: z.boolean(),
    reasoning: z.string(),
  }))
});

const NarrativeSchema = z.object({
  explanation: z.string(),
  development_recommendations: z.object({
    personal: z.string(),
    assignment: z.string(),
    training: z.string()
  })
});

export async function runPhase2Generation(reportId: string, userId: string, job: Job) {
  const currentJobId = job.id;
  console.log(`[Worker] Starting Expert Phase 2 for Report: ${reportId}`);
  
  // 1. Initial Status Update
  await publishEvent(userId, 'ai-stream', { 
      reportId, 
      chunk: "🧠 Initializing Expert Assessor System...\n" 
  });

  const client = await pool.connect();

  try {
    // --- FETCH CONFIG & CONTEXT ---
    const settingsRes = await query("SELECT value FROM system_settings WHERE key = 'ai_config'");
    const aiConfig = settingsRes.rows[0]?.value || {};
    
    // Configurable Models
    const judgmentModel = aiConfig.judgmentLLM || "google/gemini-2.5-flash-lite-preview-09-2025"; 
    const narrativeModel = aiConfig.narrativeLLM || "google/gemini-3-preview";
    const judgmentTemp = aiConfig.judgmentTemp ?? 0.3;
    const narrativeTemp = aiConfig.judgmentTemp ?? 0.7;

    // Fetch Report & Project Data
    const reportRes = await query('SELECT project_id, target_levels, specific_context FROM reports WHERE id = $1', [reportId]);
    const report = reportRes.rows[0];
    const targetLevels = report.target_levels || {};
    const reportContext = report.specific_context || "";

    const projectRes = await query(
      `SELECT cd.content as dictionary, pp.persona_prompt, pp.analysis_prompt, pp.general_context 
       FROM projects p 
       JOIN competency_dictionaries cd ON p.dictionary_id = cd.id 
       JOIN project_prompts pp ON p.id = pp.project_id
       WHERE p.id = $1`, 
      [report.project_id]
    );
    const { dictionary, persona_prompt, analysis_prompt, general_context } = projectRes.rows[0];

    // Fetch ALL Evidence
    const evidenceRes = await query(
      `SELECT competency, level, kb, quote, source, reasoning 
       FROM evidence WHERE report_id = $1 AND is_archived = false`,
      [reportId]
    );
    const allEvidence = evidenceRes.rows;

    // Clear old analysis
    await client.query('DELETE FROM competency_analysis WHERE report_id = $1', [reportId]);

    // Configurable Threshold
    const PASS_THRESHOLD = aiConfig.passThreshold || 0.75;

    // --- ORCHESTRATOR LOOP ---
    for (const comp of dictionary.kompetensi) {
      try { await checkCancellation(reportId, userId, currentJobId); }
      catch (e: any) { if (e.message === "CANCELLED_BY_USER") return { status: 'CANCELLED' }; throw e; }

      const compName = comp.name || comp.namaKompetensi;
      const compId = comp.id || compName; 

      // Filter Evidence
      const relevantEvidence = allEvidence.filter((e: any) =>
        e.competency.trim().toLowerCase() === compName.trim().toLowerCase()
      );

      // Sanity Log
      console.log(`[Phase 2] Analyzing ${compName}: Found ${relevantEvidence.length} specific evidence items.`);
      
      // Get Target Level
      const targetLevel = parseInt(targetLevels[compId] || "3");

      // Dynamic Min/Max Levels
      const availableLevels = comp.level.map((l: any) => parseInt(l.nomor)).sort((a: number, b: number) => a - b);
      const MIN_LEVEL = availableLevels[0] || 1;
      const MAX_LEVEL = availableLevels[availableLevels.length - 1] || 5;


      await publishEvent(userId, 'ai-stream', { 
          reportId, 
          chunk: `\n🔍 Analyzing Competency: **${compName}** (Target: ${targetLevel})\n` 
      });

      const levelJudgments: Record<number, any[]> = {};

      // === STEP A: CHECK TARGET LEVEL ===
      await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Checking Target Level ${targetLevel}...\n` });
      
      // Evaluate Target
      levelJudgments[targetLevel] = await evaluateLevel(
          comp, targetLevel, relevantEvidence, judgmentModel, judgmentTemp,
          general_context, reportContext
      );

      // Check Downwards (Foundation Check)
      // We ALWAYS check down to Level 1 to ensure no gaps (The "Anomaly" fix)
      for (let l = targetLevel - 1; l >= 1; l--) {
        await checkCancellation(reportId, userId, currentJobId);
        await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Verifying Foundation Level ${l}...\n` });
        levelJudgments[l] = await evaluateLevel(
          comp, l, relevantEvidence, judgmentModel, judgmentTemp,
          general_context, reportContext
        );
      }

      // Check Upwards (Growth Check)
      // We only check up if the Target (or current top) was passed.
      let currentCeiling = targetLevel;
      let keepCheckingUp = isLevelPassed(levelJudgments[targetLevel], PASS_THRESHOLD);

      while (keepCheckingUp && currentCeiling < 5) {
        const nextLevel = currentCeiling + 1;
        await checkCancellation(reportId, userId, currentJobId);
        await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Exploring Potential Level ${nextLevel}...\n` });

        levelJudgments[nextLevel] = await evaluateLevel(
          comp, nextLevel, relevantEvidence, judgmentModel, judgmentTemp,
          general_context, reportContext
        );

        if (isLevelPassed(levelJudgments[nextLevel], PASS_THRESHOLD)) {
          currentCeiling = nextLevel;
        } else {
          keepCheckingUp = false;
        }
      }

      // === STEP B: CALCULATE FINAL LEVEL ===
      // Rule: Final Level = The highest level N where Levels 1..N are ALL passed.

      let finalCalculatedLevel = 0;
      for (const l of availableLevels) {
        if (!levelJudgments[l]) break;
        if (isLevelPassed(levelJudgments[l], PASS_THRESHOLD)) {
          finalCalculatedLevel = 1;
        } else {
          break;
        }
      }
      // If even Level 1 failed, score is 0

      // Detect Anomaly for Narrative
      let anomalyDetected = false;
      const sortedLevels = Object.keys(levelJudgments).map(Number).sort((a,b) => a-b);
      for (let i = 0; i < sortedLevels.length - 1; i++) {
        const lower = sortedLevels[i];
        const higher = sortedLevels[i+1];
        if (!isLevelPassed(levelJudgments[lower], PASS_THRESHOLD) && isLevelPassed(levelJudgments[higher], PASS_THRESHOLD)) {
          anomalyDetected = true;
        }
      }

      if (anomalyDetected) {
        await publishEvent(userId, 'ai-stream', { reportId, chunk: `⚠️ Consistency Warning: Higher levels met while lower levels missed. Adjusting score to robust foundation.\n` });
      }

      // === STEP E: NARRATIVE GENERATION ===
      await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Writing final analysis...\n` });
      
      const narrativeData = await generateNarrative(
          compName, 
          finalCalculatedLevel, 
          targetLevel, 
          levelJudgments, 
          narrativeModel, 
          narrativeTemp,
          persona_prompt,
          analysis_prompt, // Passing the System Prompt here
          anomalyDetected
      );

      // Format recommendations for DB (Text)
      const formattedRecs = `**Personal Development:**\n${narrativeData.development_recommendations.personal}\n\n` +
                            `**Assignment:**\n${narrativeData.development_recommendations.assignment}\n\n` +
                            `**Training:**\n${narrativeData.development_recommendations.training}`;

      // === STEP F: SAVE ===
      const flatKbs = [];
      for (const [lvl, kbs] of Object.entries(levelJudgments)) {
          flatKbs.push(...kbs.map((k: any) => ({
              level: lvl,
              kbText: k.kbText,
              fulfilled: k.fulfilled,
              explanation: k.reasoning,
              evidence: k.realEvidence
          })));
      }

      await client.query(
        `INSERT INTO competency_analysis 
         (report_id, competency, level_achieved, explanation, development_recommendations, key_behaviors_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          reportId, 
          compName, 
          String(finalCalculatedLevel),
          narrativeData.explanation + (anomalyDetected ? "\n\n[SYSTEM FLAG: Inconsistent scoring detected.]" : ""),
          formattedRecs,
          JSON.stringify(flatKbs)
        ]
      );

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

// --- HELPERS ---

function isLevelPassed(kbs: any[], threshold: number) {
    if (!kbs || kbs.length === 0) return false;
    const fulfilledCount = kbs.filter(k => k.fulfilled).length;
    return (fulfilledCount / kbs.length) >= threshold;
}

async function evaluateLevel(
    comp: any, 
    level: number, 
    allRelevantEvidence: any[],
    model: string, 
    temp: number,
    generalContext: string,
    reportContext: string
) {
    const lvlObj = comp.level.find((l: any) => String(l.nomor) === String(level));
    if (!lvlObj) return [];

    // Pass reasoning from Phase 1 to give the "Judge" context
    const contextEvidenceText = allRelevantEvidence.map((e: any) =>
        `- Quote: "${e.quote}"\n  Context from Phase 1: ${e.reasoning}` 
    ).join('\n');

    const prompt = `
    TASK: Judge if the candidate fulfilled the Key Behaviors for Level ${level}.
    
    CONTEXT:
    ${generalContext || ""}
    ${reportContext || ""}

    COMPETENCY: ${comp.name || comp.namaKompetensi}
    LEVEL DEFINITION: ${lvlObj.penjelasan}
    
    CANDIDATE EVIDENCE:
    ${contextEvidenceText || "No specific evidence recorded."}
    
    KEY BEHAVIORS TO CHECK:
    ${lvlObj.keyBehavior.map((kb: string, i: number) => `${i+1}. ${kb}`).join('\n')}
    
    INSTRUCTIONS:
    - You are a strict assessor.
    - Evaluate EACH Key Behavior.
    - Return a JSON object with a single key "key_behaviors".
    - "key_behaviors" must be an array of objects.
    
    REQUIRED JSON STRUCTURE:
    {
      "key_behaviors": [
        {
          "kb_text": "The full text of the key behavior",
          "fulfilled": true/false,
          "reasoning": "Why you made this decision",
          "evidence_used": ["Quote 1", "Quote 2"]
        }
      ]
    }
    `;

    const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: temp
    });

    const rawContent = response.choices[0].message.content || "{}";
    let parsedJson;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch (e) {
      throw new Error("AI returned invalid JSON");
    }

    // Validate against Schema
    const validation = LevelEvaluationSchema.safeParse(parsedJson);

    if (!validation.success) {
      console.error("Schema Validation Failed:", validation.error);
      throw new Error("AI returned JSON matching the wrong schema (Schema Drift).");
    }

    // Return clean data
    const result = validation.data;

    // Map to internal format
    return lvlObj.keyBehavior.map((kbText: string, i: number) => {
      // Try to find the matching KB in the AI output by index or text
      // Since we ask for an array, usually index alignment is safest if AI follows instructions
      // But let's look for a text match or fallback to index
      const aiRes = result.key_behaviors[i] || {};

      // Manual Evidence Mapping
      const normKb = normalizeKb(kbText);

      const matchingEvidence = allRelevantEvidence.filter((ev: any) => {
        const normEvKb = normalizeKb(ev.kb);
        return normEvKb === normKb ||
          (normKb.length > 10 && normEvKb.includes(normKb)) ||
          (normEvKb.length > 10 && normKb.includes(normEvKb));
      }).map(ev => ({
        quote: ev.quote,
        source: ev.source
      }));

      return {
        kbText,
        fulfilled: aiRes.fulfilled || false,
        reasoning: aiRes.reasoning || "No evidence found",
        realEvidence: matchingEvidence
      };
    });
}

async function generateNarrative(
    compName: string, 
    finalLevel: number, 
    targetLevel: number,
    judgments: any, 
    model: string,
    temp: number,
    persona: string,
    customPrompt: string,
    anomaly: boolean
) {
    let summaryText = `Candidate achieved Level ${finalLevel} (Target: ${targetLevel}).\n\n`;

    // Add anomaly note to context
    if (anomaly) {
        summaryText += "NOTE: The candidate displayed behaviors of higher levels but failed some lower foundational levels. The score was capped to ensure consistency.\n";
    }
    
    for (const [lvl, kbs] of Object.entries(judgments)) {
        summaryText += `Level ${lvl}:\n`;
        // @ts-ignore
        kbs.forEach(k => {
            summaryText += `- ${k.kbText}: ${k.fulfilled ? "YES" : "NO"} (${k.reasoning})\n`;
        });
    }

    const prompt = `
    ${persona || "You are an expert assessor."}

    ${customPrompt}
    
    CONTEXT:
    Competency: ${compName}
    ${anomaly ? "IMPORTANT: There is an anomaly where higher levels were met but lower levels missed. Address this in the explanation." : ""}
    
    SCORING SUMMARY:
    ${summaryText}
    
    TASK:
    1. Write a cohesive 'explanation' justifying the Final Level ${finalLevel}. Address the gap if Target (${targetLevel}) was not met.
    2. Write 'development_recommendations' to close the gap (or maintain performance) categorized exactly as requested..
    
    IMPORTANT: You MUST categorize recommendations into these 3 specific sections:
    - **Personal Development**: Actionable steps the individual can take alone.
    - **Assignment**: Tasks or projects assigned by a supervisor.
    - **Training**: Formal learning (workshops, courses).
    
    REQUIRED JSON STRUCTURE:
    {
      "explanation": "Markdown text...",
      "development_recommendations": {
         "personal": "Actionable self-learning steps...",
         "assignment": "On-the-job tasks...",
         "training": "Formal courses or workshops..."
      }
    }
    `;

    const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: temp
    });

    const rawContent = response.choices[0].message.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
      const valid = NarrativeSchema.safeParse(parsed);
      if (valid.success) return valid.data;
      console.warn("Narrative schema mismatch, attempting fallback...");
    } catch (e) {}

    // Fallback if schema fails (e.g. AI returned flat string)
    return {
      explanation: parsed?.explanation || "Analysis generated.",
      development_recommendations: {
        personal: parsed?.development_recommendations?.personal || "Review competency guide.",
        assignment: parsed?.development_recommendations?.assignment || "Seek mentoring.",
        training: parsed?.development_recommendations?.training || "Attend relevant workshops."
      }
    };
}