import { query } from './db';

// Define the Filter Interface
interface ExportFilters {
  startDate?: string;
  endDate?: string;
  projectId?: string;
  reportId?: string;
  model?: string;
}

interface FineTuningMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface FineTuningExample {
  messages: FineTuningMessage[];
}

export async function generateFineTuningDataset(filters: ExportFilters) {
  const dataset: FineTuningExample[] = [];
  const params: any[] = [];
  let paramCount = 1;

  // Helper to build dynamic WHERE clauses
  const buildWhere = (baseCondition: string) => {
    const conditions = [baseCondition];
    
    if (filters.projectId) {
      conditions.push(`l.project_id = $${paramCount++}`);
      params.push(filters.projectId);
    }
    if (filters.reportId) {
      conditions.push(`l.report_id = $${paramCount++}`);
      params.push(filters.reportId);
    }
    if (filters.model) {
      conditions.push(`l.model = $${paramCount++}`);
      params.push(filters.model);
    }
    if (filters.startDate) {
      conditions.push(`l.created_at >= $${paramCount++}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`l.created_at <= $${paramCount++}`);
      params.push(filters.endDate);
    }
    return conditions.join(' AND ');
  };

  // --- 1. RECONSTRUCT PHASE 1 (Evidence Extraction) ---
  // Reset params for first query
  params.length = 0; 
  paramCount = 1;
  
  const phase1Where = buildWhere("l.action = 'PHASE_1_EXTRACTION' AND l.status = 'SUCCESS'");
  
  const phase1Logs = await query(`
    SELECT l.id, l.prompt_snapshot 
    FROM ai_logs l
    WHERE ${phase1Where}
    ORDER BY l.created_at DESC
  `, params);

  for (const log of phase1Logs.rows) {
    const evidenceRows = await query(
      `SELECT kb, quote, source, reasoning 
       FROM evidence 
       WHERE ai_log_id = $1 AND is_archived = false`,
      [log.id]
    );

    if (evidenceRows.rows.length > 0) {
      const idealJson = {
        evidence: evidenceRows.rows.map(row => ({
          kb: row.kb,
          quote: row.quote,
          reasoning: row.reasoning // <--- This contains the USER EDITS
        }))
      };

      let messages: FineTuningMessage[] = [];
      try {
        messages = JSON.parse(log.prompt_snapshot) as FineTuningMessage[];
      } catch (e) { continue; }

      dataset.push({
        messages: [
          ...messages,
          { role: "assistant", content: JSON.stringify(idealJson, null, 2) }
        ]
      });
    }
  }

  // --- 2. RECONSTRUCT PHASE 3 (Executive Summary) ---
  // Reset params for second query
  params.length = 0;
  paramCount = 1;

  const phase3Where = buildWhere("l.action = 'PHASE_3_CRITIQUE' AND l.status = 'SUCCESS'");

  // Note: We join here to ensure we only get logs that actually produced a summary
  const phase3Logs = await query(`
    SELECT l.id, l.prompt_snapshot 
    FROM ai_logs l
    JOIN executive_summary es ON es.ai_log_id = l.id
    WHERE ${phase3Where}
  `, params);

  for (const log of phase3Logs.rows) {
    // We already joined, but let's fetch the columns specifically
    const summaryRow = await query(
      `SELECT overview, strengths, areas_for_improvement, recommendations 
       FROM executive_summary WHERE ai_log_id = $1`,
      [log.id]
    );

    if (summaryRow.rows.length > 0) {
      const row = summaryRow.rows[0];
      const idealJson = {
        overview: row.overview, // <--- This contains the USER EDITS
        strengths: row.strengths,
        weaknesses: row.areas_for_improvement,
        recommendations: row.recommendations
      };

      let messages: FineTuningMessage[] = [];
      try {
        messages = JSON.parse(log.prompt_snapshot) as FineTuningMessage[];
      } catch (e) { continue; }

      dataset.push({
        messages: [
          ...messages,
          { role: "assistant", content: JSON.stringify(idealJson, null, 2) }
        ]
      });
    }
  }

  return dataset;
}