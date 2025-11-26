// backend/src/services/ai-phase1-service.ts
import 'dotenv/config';
import { query, pool } from './db';
import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming'; 
import { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { z } from 'zod';
import { publishEvent } from './redis-publisher';
import { Job } from 'bullmq';

// Initialize OpenAI client (Base configuration)
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://ai-assessor-agent.com",
    "X-Title": "AI Assessor Agent",
  }
});

// Define the Output Schema (Zod) for validation
const EvidenceItemSchema = z.object({
  competency: z.string(),
  level: z.string(),
  kb: z.string(),
  quote: z.string(),
  source: z.string(),
  reasoning: z.string(),
});

const EvidenceListSchema = z.object({
  evidence: z.array(EvidenceItemSchema)
});

async function checkCancellation(reportId: string, userId: string) {
    const res = await query("SELECT status FROM reports WHERE id = $1", [reportId]);
    if (res.rows.length === 0 || res.rows[0].status !== 'PROCESSING') {
        await publishEvent(userId, 'ai-stream', { 
            reportId, 
            chunk: `\n⛔ Process cancelled by user (or status changed). Aborting job.\n` 
        });
        throw new Error("CANCELLED_BY_USER");
    }
}

export async function runPhase1Generation(reportId: string, userId: string, job: Job) {
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
      `SELECT cd.content as dictionary, pp.persona_prompt, pp.evidence_prompt 
       FROM projects p
       JOIN competency_dictionaries cd ON p.dictionary_id = cd.id
       JOIN project_prompts pp ON p.id = pp.project_id
       WHERE p.id = $1`,
      [report.project_id]
    );
    const { dictionary, persona_prompt, evidence_prompt } = projectRes.rows[0];

    // Validate Dictionary Structure
    if (!dictionary.kompetensi || !Array.isArray(dictionary.kompetensi)) {
        throw new Error("Invalid Competency Dictionary format.");
    }

    // Get Report Files & Their Chunks
    // We fetch ALL text chunks associated with this report's files.
    // We assume "source_truth" strategy (feed full text) instead of RAG search for higher accuracy.
    const filesRes = await query(
      `SELECT
        rf.file_name,
        rf.simulation_method_tag,
        rf.extracted_text,
        gsm.description as method_description
       FROM report_files rf
       LEFT JOIN global_simulation_methods gsm ON rf.simulation_method_tag = gsm.name
       WHERE rf.report_id = $1`,
      [reportId]
    );

    if (filesRes.rows.length === 0) throw new Error("No files found.");

    // Format the context string
    let assessmentContext = "";
    filesRes.rows.forEach(row => {
      const sourceTag = row.simulation_method_tag || 'Unknown Source';
      const content = row.extracted_text || "";
      const methodDesc = row.method_description ? `\nCONTEXT/DESCRIPTION: ${row.method_description}\n` : "";
        
      // STRICTER HEADER FORMAT
      // We explicitly tell the AI: "This section is from SOURCE: [Tag]"
      assessmentContext += `\n\n=== START EVIDENCE SOURCE: ${sourceTag} ===\n`;
      assessmentContext += methodDesc;
      assessmentContext += content;
      assessmentContext += `\n=== END EVIDENCE SOURCE: ${sourceTag} ===\n`;
    });

    if (assessmentContext.trim().length === 0) {
         throw new Error("Files are uploaded but text extraction is pending. Please wait a moment and try again.");
    }

    // NEW: Fetch Project Knowledge Base Files
    const kbFilesRes = await query(
      `SELECT file_name, extracted_text 
       FROM project_files 
       WHERE project_id = $1 AND file_type = 'knowledgeBase'`,
      [report.project_id]
    );

    let knowledgeBaseContext = "";
    if (kbFilesRes.rows.length > 0) {
        kbFilesRes.rows.forEach(row => {
            const content = row.extracted_text || "";
            if (content.trim()) {
                knowledgeBaseContext += `\n\n--- KNOWLEDGE BASE: ${row.file_name} ---\n${content}\n`;
            }
        });
    };

    // RESUME LOGIC START (in the event of failure)
    // Check which competencies already generated evidence
    const existingRes = await query (
      'SELECT DISTINCT competency FROM evidence WHERE report_id = $1 AND is_ai_generated = true',
      [reportId]
    );
    const completedCompetencies = new Set(existingRes.rows.map(r => r.competency));

    // Filter the dictionary
    const competenciesToProcess = dictionary.kompetensi.filter((comp: any) => {
      const cName = comp.name || comp.namaKompetensi;
      return !completedCompetencies.has(cName);
    });

    if (completedCompetencies.size > 0 && competenciesToProcess.length > 0) {
      await publishEvent(userId, 'ai-stream', {
        reportId,
        chunk: `\n⏩ Resuming: Found ${completedCompetencies.size} completed competencies. Processing remaining ${competenciesToProcess.length}...\n`
      });
    } else if (completedCompetencies.size > 0 && competenciesToProcess.length === 0) {
      await publishEvent(userId, 'ai-stream', { 
        reportId, 
        chunk: `\n✅ All competencies already analyzed.\n` 
      });
    }

    let totalEvidenceCount = 0;


    // // 2. Prepare DB
    // await poolClient.query('BEGIN');
    // await poolClient.query('DELETE FROM evidence WHERE report_id = $1 AND is_ai_generated = true', [reportId]);
    // await poolClient.query('COMMIT');

    // 3. Iterative Generation Loop
    // We loop through each competency to force the AI to be exhaustive
    for (const comp of competenciesToProcess) {
      // Check cancellation before starting a new competency
      try {
        await checkCancellation(reportId, userId);
      } catch (e: any) {
        if (e.message === "CANCELLED_BY_USER") return { status: 'CANCELLED' };
        throw e;
      }

      const compName = comp.name || comp.namaKompetensi || "Unknown Competency";

      await publishEvent(userId, 'ai-stream', {
        reportId,
        chunk: `\n🔍 Analyzing: ${compName}...\n`
      });

      const systemPrompt = `${persona_prompt}

      ${knowledgeBaseContext ? `\nADDITIONAL CONTEXT / KNOWLEDGE BASE:\nUse this information to as a reference during evidence collection:\n${knowledgeBaseContext}` : ""}
      
      You are analyzing the candidate's performance to find evidence ONLY for:
      ${JSON.stringify(comp, null, 2)}`;
          
      const jsonStructure = {
        evidence: [
          {
            competency: "String (Must match current competency name)",
            level: "String (1, 2, 3,...)",
            kb: "String (Full text of the Key Behavior)",
            quote: "String (Exact quote from the source text)",
            source: "String (The Source Tag, e.g. 'Case Study')",
            reasoning: "String (Why this quote matches the KB)"
          }
        ]
      };

      const userPrompt = `
        ${evidence_prompt}

        CRITICAL OUTPUT RULES:
          1. **EXHAUSTIVE SEARCH:** Find EVERY piece of evidence for every key behavior for this competency. Do not stop at the first match. Do not be lazy. If there are 10 valid quotes, list all 10.
          2. **MULTIPLE EVIDENCE:** If a Key Behavior is demonstrated multiple times or in different files, output SEPARATE evidence items for each instance. It is normal to have multiple quotes for the same Key Behavior.
          3. **KB Text:** Output the **full text** of the Key Behavior (including number in the text).
          4. **Source:** You MUST use the exact string from the "START EVIDENCE SOURCE" header (e.g., "Case Study", "Roleplay"). Do NOT use the filename. Do NOT invent new source names.
          3. **JSON Format:** You must output a valid JSON object matching this structure exactly:
          ${JSON.stringify(jsonStructure, null, 2)}

        Here is the assessment transcript/data:
        ${assessmentContext}
      `;

      const options: any = { temperature };
      if (model.includes('o1')) delete options.temperature;

      const stream = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        stream: true,
        ...options
      }) as unknown as Stream<ChatCompletionChunk>;

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          await publishEvent(userId, 'ai-stream', { reportId, chunk: content });
        }
      }

      try {
        // Sanitization
        let cleanResponse = fullResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = cleanResponse.indexOf('{');
        const lastBrace = cleanResponse.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
        }

        const rawJson = JSON.parse(cleanResponse);

        // Handle Array vs Object
        let rawList = [];
        if (Array.isArray(rawJson)) rawList = rawJson;
        else if (rawJson && Array.isArray(rawJson.evidence)) rawList = rawJson.evidence;
        else {
          const potential = Object.values(rawJson).find(v => Array.isArray(v));
          if (potential) rawList = potential as any[];
        }

        // Normalize
        const normalizedList = rawList.map((item: any) => {
          const foundQuote = item.quote || item.Quote || item.evidence || item.Evidence || item.excerpt || item.Excerpt || "";
          return {
            competency: compName,
            level:      String(item.level || item.Level || ""),
            kb:         item.kb || item.KB || item['Key Behavior'] || item.keyBehavior || "",
            quote:      foundQuote,
            source:     item.source || item.Source || "",
            reasoning:  item.reasoning || item.Reasoning || ""
          };
        });

        // Save Batch
        // Idempotency: Clear THIS competency before inserting (in case of retry loop quirk)
        await poolClient.query('BEGIN');
        await poolClient.query(
          'DELETE FROM evidence WHERE report_id = $1 AND competency = $2 AND is_ai_generated = true',
          [reportId, compName]
        );
        for (const ev of normalizedList) {
          await poolClient.query(
            `INSERT INTO evidence (report_id, competency, level, kb, quote, source, reasoning, is_ai_generated)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [reportId, ev.competency, ev.level, ev.kb, ev.quote, ev.source, ev.reasoning, true]
          );
        }
        await poolClient.query('COMMIT');

        totalEvidenceCount += normalizedList.length;

        await publishEvent(userId, 'evidence-batch-saved', {
          reportId,
          count: normalizedList.length,
          competency: compName
        });

        await publishEvent(userId, 'ai-stream', {
          reportId,
          chunk: `\n✅ Found ${normalizedList.length} items for ${compName}.\n`
        });
      } catch (e) {
        console.error(`Failed to parse/save batch for ${compName}`, e);
        await publishEvent(userId, 'ai-stream', {
          reportId,
          chunk: `\n❌ Failed to parse results for ${compName}. Moving to next...\n`
        });
        // We continue the loop even if one fails
      }
    } // End Loop

    // 4. Finalize
    await query("UPDATE reports SET status = 'COMPLETED' WHERE id = $1", [reportId]);

    await publishEvent(userId, 'generation-complete', {
      reportId: reportId,
      phase: 1,
      status: 'COMPLETED',
      message: `Analysis complete. Total ${totalEvidenceCount} evidence items collected.`
    });

    return { status: 'COMPLETED', count: totalEvidenceCount };

  } catch (error: any) {
    // Global Error Handler (Retries)
    await poolClient.query('ROLLBACK');

    // Handle cancellation silently
    if (error.message === 'CANCELLED_BY_USER') {
      console.log(`[Worker] Job for ${reportId} cancelled.`);
      return { status: 'CANCELLED' };
    }

    console.error(`[Worker] 🚨 Attempt ${attemptsMade + 1} Failed:`, error.message);

    if (attemptsMade >= 5) {
      await query("UPDATE reports SET status = 'FAILED' WHERE id = $1", [reportId]);
      await publishEvent(userId, 'generation-failed', {
        reportId: reportId,
        phase: 1,
        status: 'FAILED',
        message: "AI models unavailable. Please try again later."
      });
    } else {
      // Check cancellation before waiting/retrying
      try {
        await checkCancellation(reportId, userId);
      } catch (e: any) {
        if (e.message === "CANCELLED_BY_USER") return { status: 'CANCELLED' };
      }
      
      const nextDelay = Math.pow(2, attemptsMade) * 2;
      await publishEvent(userId, 'ai-stream', {
        reportId,
        chunk: `\n❌ Global Error: ${error.message}. Retrying in ~${nextDelay}s...\n`
      });
    }
    throw error;
  } finally {
    poolClient.release();
  }
}