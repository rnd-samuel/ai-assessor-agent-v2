// backend/src/services/ai-phase3-service.ts
import { pool } from './db';

export async function runPhase3Generation(reportId: string, userId: string) {
  console.log(`[Worker] Starting Phase 3 (Executive Summary) for Report: ${reportId}`);

  const client = await pool.connect();

  try {
    console.log('[Worker] Thinking... (Simulating AI summarization)');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 1. Mock Output (matches the 'executive_summary' table schema)
    const mockOutput = {
      strengths: "The candidate shows strong (Level 3) communication skills, particularly in handling difficult conversations and taking ownership of problems. They also demonstrate solid (Level 3) foundational problem-solving by identifying core issues and dependencies.",
      areas_for_improvement: "The primary area for development is in strategic thinking (Problem Solving Level 4), as the candidate did not meet the target level. They tend to find a single workable compromise rather than developing comprehensive, multi-faceted solutions.",
      recommendations: "It is recommended that the candidate shadow a senior manager during project planning to observe complex solutioning. Additionally, they should independently practice brainstorming multiple solutions before settling on a single path."
    };

    // 2. Save to Database
    await client.query('BEGIN');
    
    // Clear old summary if exists
    await client.query('DELETE FROM executive_summary WHERE report_id = $1', [reportId]);

    await client.query(
      `INSERT INTO executive_summary 
       (report_id, strengths, areas_for_improvement, recommendations)
       VALUES ($1, $2, $3, $4)`,
      [reportId, mockOutput.strengths, mockOutput.areas_for_improvement, mockOutput.recommendations]
    );
    
    // 3. Update Report Status to COMPLETED (Final state)
    await client.query(
        "UPDATE reports SET status = 'COMPLETED' WHERE id = $1",
        [reportId]
    );

    await client.query('COMMIT');
    console.log(`[Worker] Phase 3 complete for Report: ${reportId}`);

    return { userId, reportId, status: 'COMPLETED', phase: 3 };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Worker] Phase 3 Failed:', error);
    throw error;
  } finally {
    client.release();
  }
}