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

/**
 * (RD-5.5) Archive a Report
 * We use PUT or PATCH for updates. Let's use PUT and a custom URL.
 */
router.put('/:id/archive', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  try {
    // Check if the user is allowed to archive this report
    const reportResult = await query(
      `SELECT r.creator_id, p.creator_id as project_creator_id
       FROM reports r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).send({ message: 'Report not found' });
    }

    const report = reportResult.rows[0];
    const isReportCreator = report.creator_id === userId;
    const isProjectCreator = report.project_creator_id === userId;
    const isAdmin = userRole === 'Admin';

    // (RD-5.5 / RD-5.4) A user can only archive their own report.
    // (PD-3.5 logic) A PM/Admin who created the project can also archive.
    if (!isReportCreator && !isProjectCreator && !isAdmin) {
      return res.status(403).send({ message: 'You are not authorized to archive this report.' });
    }

    // Update the report
    await query(
      'UPDATE reports SET is_archived = true WHERE id = $1',
      [reportId]
    );

    res.status(200).send({ message: 'Report archived successfully.' });

  } catch (error) {
    console.error('Error archiving report:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (RD-5.5) Unarchive a Report
 */
router.put('/:id/unarchive', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  try {
    // Check if the user is allowed to unarchive this report
    // We'll use the same authorization logic as archiving
    const reportResult = await query(
      `SELECT r.creator_id, p.creator_id as project_creator_id
       FROM reports r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).send({ message: 'Report not found' });
    }

    const report = reportResult.rows[0];
    const isReportCreator = report.creator_id === userId;
    const isProjectCreator = report.project_creator_id === userId;
    const isAdmin = userRole === 'Admin';

    if (!isReportCreator && !isProjectCreator && !isAdmin) {
      return res.status(403).send({ message: 'You are not authorized to unarchive this report.' });
    }

    // Update the report
    await query(
      'UPDATE reports SET is_archived = false WHERE id = $1',
      [reportId]
    );

    res.status(200).send({ message: 'Report unarchived successfully.' });

  } catch (error) {
    console.error('Error unarchiving report:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

export default router;