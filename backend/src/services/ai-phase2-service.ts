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

    // --- ORCHESTRATOR LOOP ---
    for (const comp of dictionary.kompetensi) {
      try { await checkCancellation(reportId, userId, currentJobId); }
      catch (e: any) { if (e.message === "CANCELLED_BY_USER") return { status: 'CANCELLED' }; throw e; }

      const compName = comp.name || comp.namaKompetensi;
      const compId = comp.id || compName; 
      
      // Get Target Level
      const targetLevel = parseInt(targetLevels[compId] || "3");

      await publishEvent(userId, 'ai-stream', { 
          reportId, 
          chunk: `\n🔍 Analyzing Competency: **${compName}** (Target: ${targetLevel})\n` 
      });

      const levelJudgments: Record<number, any[]> = {};

      // === STEP A: CHECK TARGET LEVEL ===
      await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Checking Target Level ${targetLevel}...\n` });
      
      // Pass ALL evidence to avoid filtering bugs
      levelJudgments[targetLevel] = await evaluateLevel(
          comp, targetLevel, allEvidence, judgmentModel, judgmentTemp, 
          general_context, reportContext
      );

      const targetFulfilledCount = levelJudgments[targetLevel].filter((k: any) => k.fulfilled).length;
      const targetTotal = levelJudgments[targetLevel].length;
      const targetPassed = (targetFulfilledCount / targetTotal) >= 0.5; 

      // === STEP B: DETERMINE DIRECTION ===
      let finalCalculatedLevel = 1; // Default floor
      
      if (!targetPassed) {
          // --- GO DOWN ---
          await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Target not met (${targetFulfilledCount}/${targetTotal}). Checking lower levels...\n` });
          
          let currentLevel = targetLevel - 1;
          let stopDown = false;

          while (currentLevel >= 1 && !stopDown) {
              await checkCancellation(reportId, userId, currentJobId);

              levelJudgments[currentLevel] = await evaluateLevel(
                  comp, currentLevel, allEvidence, judgmentModel, judgmentTemp, 
                  general_context, reportContext
              );
              
              const fulfilled = levelJudgments[currentLevel].some((k: any) => k.fulfilled);
              
              if (fulfilled) {
                  const pass = (levelJudgments[currentLevel].filter((k: any) => k.fulfilled).length / levelJudgments[currentLevel].length) >= 0.5;
                  if (pass) {
                      finalCalculatedLevel = currentLevel;
                      stopDown = true; 
                  }
              }
              
              if (!stopDown) currentLevel--;
          }

      } else {
          // --- GO UP ---
          await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Target met (${targetFulfilledCount}/${targetTotal}). Checking higher levels...\n` });
          
          finalCalculatedLevel = targetLevel; // It passed, so at least target is met
          
          let currentLevel = targetLevel + 1;
          const maxLevel = 5; 
          let stopUp = false;

          while (currentLevel <= maxLevel && !stopUp) {
              await checkCancellation(reportId, userId, currentJobId);

              levelJudgments[currentLevel] = await evaluateLevel(
                  comp, currentLevel, allEvidence, judgmentModel, judgmentTemp, 
                  general_context, reportContext
              );
              
              const fulfilledCount = levelJudgments[currentLevel].filter((k: any) => k.fulfilled).length;
              const total = levelJudgments[currentLevel].length;
              
              if ((fulfilledCount / total) >= 0.5) {
                  finalCalculatedLevel = currentLevel;
              } else {
                  stopUp = true;
              }
              
              if (!stopUp) currentLevel++;
          }
      }

      // === STEP C: MANDATORY NEIGHBOR CHECK ===
      const neighbors = [targetLevel - 1, targetLevel + 1];
      for (const n of neighbors) {
          if (n >= 1 && n <= 5 && !levelJudgments[n]) {
              await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Context check: Assessing Level ${n}...\n` });
              levelJudgments[n] = await evaluateLevel(
                  comp, n, allEvidence, judgmentModel, judgmentTemp, 
                  general_context, reportContext
              );
          }
      }

      // === STEP D: EDGE CASE DETECTION ===
      let anomalyDetected = false;
      const levels = Object.keys(levelJudgments).map(Number).sort((a,b) => a-b);
      for (let i = 0; i < levels.length - 1; i++) {
          const lower = levels[i];
          const higher = levels[i+1];
          const scoreLow = getScore(levelJudgments[lower]);
          const scoreHigh = getScore(levelJudgments[higher]);

          if (scoreHigh > 0.5 && scoreLow < 0.2) {
              anomalyDetected = true;
              await publishEvent(userId, 'ai-stream', { 
                  reportId, 
                  chunk: `⚠️ Anomaly: Level ${higher} score is higher than Level ${lower}.\n` 
              });
          }
      }

      // === STEP E: NARRATIVE GENERATION ===
      await publishEvent(userId, 'ai-stream', { reportId, chunk: `> Writing final analysis...\n` });
      
      const narrative = await generateNarrative(
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

      // === STEP F: SAVE ===
      const flatKbs = [];
      for (const [lvl, kbs] of Object.entries(levelJudgments)) {
          flatKbs.push(...kbs.map((k: any) => ({
              level: lvl,
              kbText: k.kbText,
              fulfilled: k.fulfilled,
              explanation: k.reasoning,
              evidence: k.evidence_used.map((q: string) => ({ quote: q, source: "AI Selected" }))
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
          narrative.explanation + (anomalyDetected ? "\n\n[SYSTEM FLAG: Inconsistent scoring detected.]" : ""),
          narrative.development_recommendations, 
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

function getScore(kbs: any[]) {
    if (!kbs || kbs.length === 0) return 0;
    return kbs.filter(k => k.fulfilled).length / kbs.length;
}

async function evaluateLevel(
    comp: any, 
    level: number, 
    allEvidence: any[], 
    model: string, 
    temp: number,
    generalContext: string,
    reportContext: string
) {
    const lvlObj = comp.level.find((l: any) => String(l.nomor) === String(level));
    if (!lvlObj) return [];

    // FIX: Pass ALL evidence. The model is smart enough to pick what matters.
    // Filtering by string matching "Problem Solving" often fails if the quote 
    // is just tagged with "General" or if the Competency name varies slightly.
    const evidenceText = allEvidence.map((e: any) => 
        `- [${e.competency}] "${e.quote}" (${e.source})`
    ).join('\n');

    const prompt = `
    TASK: Judge if the candidate fulfilled the Key Behaviors for Level ${level}.
    
    CONTEXT:
    ${generalContext || ""}
    ${reportContext || ""}

    COMPETENCY: ${comp.name || comp.namaKompetensi}
    LEVEL DEFINITION: ${lvlObj.penjelasan}
    
    CANDIDATE EVIDENCE:
    ${evidenceText || "No specific evidence recorded."}
    
    KEY BEHAVIORS TO CHECK:
    ${lvlObj.keyBehavior.map((kb: string, i: number) => `${i+1}. ${kb}`).join('\n')}
    
    INSTRUCTIONS:
    - For EACH Key Behavior, decide true/false based on the evidence.
    - If evidence supports it, set fulfilled: true.
    - If NO evidence supports it, set fulfilled: false.
    - Return valid JSON.
    `;

    const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: temp
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return lvlObj.keyBehavior.map((kbText: string, i: number) => {
        const list = result.key_behaviors || result.keyBehaviors || [];
        const aiRes = list[i] || {};
        
        return {
            kbText,
            fulfilled: aiRes.fulfilled || false,
            reasoning: aiRes.reasoning || "No evidence found",
            evidence_used: aiRes.evidence_used || []
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
    1. Write a cohesive 'explanation' justifying the Level ${finalLevel}.
    2. Write 'development_recommendations' to close the gap (or maintain performance).
    
    IMPORTANT: You MUST categorize recommendations into these 3 specific sections:
    - **Personal Development**: Actionable steps the individual can take alone.
    - **Assignment**: Tasks or projects assigned by a supervisor.
    - **Training**: Formal learning (workshops, courses).
    
    Return JSON: { "explanation": "...", "development_recommendations": "..." }
    `;

    const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: temp
    });

    return JSON.parse(response.choices[0].message.content || "{}");
}