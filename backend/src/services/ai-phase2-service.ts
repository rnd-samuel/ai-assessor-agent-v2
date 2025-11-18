// backend/src/services/ai-phase2-service.ts
import { pool } from './db';
import { z } from 'zod';

// 1. Updated Schema to include 'level' and 'evidence' for each KB
const CompetencyAnalysisSchema = z.array(z.object({
  competencyId: z.string(),
  competencyName: z.string(),
  levelAchieved: z.string(),
  explanation: z.string(),
  developmentRecommendations: z.string(),
  keyBehaviors: z.array(z.object({
    level: z.string(), // <--- NEW
    kbText: z.string(),
    fulfilled: z.boolean(),
    explanation: z.string().optional(),
    evidence: z.array(z.object({ // <--- NEW
        quote: z.string(),
        source: z.string()
    })).optional()
  }))
}));

export async function runPhase2Generation(reportId: string, userId: string) {
  console.log(`[Worker] Starting Phase 2 (Competency Analysis) for Report: ${reportId}`);

  const client = await pool.connect();

  try {
    console.log('[Worker] Thinking... (Simulating AI delay)');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2. Updated Mock Output with Levels and Evidence
    const mockOutput = [
      {
        competencyId: "comp-ps", 
        competencyName: "Problem Solving",
        levelAchieved: "3",
        explanation: "The candidate demonstrated strong analytical skills by breaking down complex stakeholder feedback into manageable categories.",
        developmentRecommendations: "Continue exposing the candidate to high-ambiguity scenarios.",
        keyBehaviors: [
          { 
            level: "2",
            kbText: "Identifies core issues in complex situations", 
            fulfilled: true, 
            explanation: "Correctly categorized the feedback to find the root cause.",
            evidence: [
                { quote: "Konfliknya memuncak saat fase desain dan implementasi.", source: "Case Study" }
            ]
          },
          { 
            level: "3",
            kbText: "Maps dependencies in conflicting feedback", 
            fulfilled: true, 
            explanation: "Mapped out dependencies before proposing a solution.",
            evidence: [
                { quote: "Based on the conflicting stakeholder feedback, I first mapped out the dependencies...", source: "Case Study" }
            ]
          },
          { 
            level: "4",
            kbText: "Develops multi-faceted solutions for complex issues", 
            fulfilled: false, 
            explanation: "The solution was a standard compromise, not a multi-faceted strategy.",
            evidence: [] 
          }
        ]
      },
      {
        competencyId: "comp-comm",
        competencyName: "Communication",
        levelAchieved: "2",
        explanation: "Communication was clear but lacked the persuasive element required for Level 3.",
        developmentRecommendations: "Practice structuring for executive presentations.",
        keyBehaviors: [
          { 
            level: "2",
            kbText: "Speaks clearly and concisely", 
            fulfilled: true, 
            explanation: "Direct and clear communication observed.",
            evidence: [
                { quote: "I am taking personal responsibility for this...", source: "Roleplay" }
            ] 
          },
          { 
            level: "3",
            kbText: "Adapts style to audience", 
            fulfilled: false, 
            explanation: "Tone was too casual for the context.",
            evidence: []
          }
        ]
      }
    ];

    // 3. Save to Database (Same logic as before)
    await client.query('BEGIN');
    await client.query('DELETE FROM competency_analysis WHERE report_id = $1', [reportId]);

    for (const comp of mockOutput) {
      await client.query(
        `INSERT INTO competency_analysis 
         (report_id, competency, level_achieved, explanation, development_recommendations, key_behaviors_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          reportId, 
          comp.competencyName, 
          comp.levelAchieved, 
          comp.explanation, 
          comp.developmentRecommendations, 
          JSON.stringify(comp.keyBehaviors)
        ]
      );
    }
    
    await client.query('COMMIT');
    console.log(`[Worker] Phase 2 complete for Report: ${reportId}`);

    return { userId, reportId, status: 'COMPLETED', phase: 2 };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Worker] Phase 2 Failed:', error);
    throw error;
  } finally {
    client.release();
  }
}