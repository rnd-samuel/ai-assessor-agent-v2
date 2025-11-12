// backend/src/routes/reports.routes.ts
import { Router, Request } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { query } from '../services/db';
import { aiGenerationQueue } from '../services/queue';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

const router = Router();

/**
 * (FR-AI-001) Create a new Report
 * This endpoint creates the report record in the database.
 * The file uploads will be handled by a separate endpoint.
 */
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { title, projectId, targetLevels, specificContext } = req.body;
  const creatorId = req.user?.userId;

  if (!title || !projectId || !targetLevels) {
    return res.status(400).send({ message: "Missing required fields: title, projectId, targetLevels" });
  }

  try {
    // (U22, U25, U26) Save all the data from the New Report Page
    const result = await query(
      `INSERT INTO reports (title, project_id, creator_id, target_levels, specific_context)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [title, projectId, creatorId, JSON.stringify(targetLevels), specificContext]
    );

    const newReportId = result.rows[0].id;

    // (NR-6.4) Queue the Phase 1 AI generation job
    // The worker needs to know which report to work on and who to notify
    await aiGenerationQueue.add('generate-phase-1', {
      reportId: newReportId,
      userId: creatorId
    });

    res.status(201).json({
      message: "Report record created. Generation started.",
      reportId: newReportId
    });

  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

export default router;