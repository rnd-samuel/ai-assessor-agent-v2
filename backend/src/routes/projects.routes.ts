// backend/src/routes/projects.routes.ts
import { Router, Request } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';
import { query } from '../services/db';

// Extend Request type to include 'user'
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

const router = Router();

// --- (FR-PROJ-002) Get Project List ---
// This route is protected. A user MUST be logged in to see it.
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  try {
    let projectsResult;

    if (userRole === 'Admin') {
      // Admins/PMs who CREATE projects see all of them (P17)
      // We also join to count reports.
      projectsResult = await query(`
        SELECT p.id, p.name, p.created_at, COUNT(r.id) as report_count
        FROM projects p
        LEFT JOIN reports r ON p.id = r.project_id
        WHERE p.is_archived = false
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `);
    } else {
      // 'Users' only see projects they are invited to (U9)
      projectsResult = await query(`
        SELECT p.id, p.name, p.created_at, COUNT(r.id) as report_count
        FROM projects p
        JOIN project_users pu ON p.id = pu.project_id
        LEFT JOIN reports r ON p.id = r.project_id AND r.creator_id = $1
        WHERE pu.user_id = $1 AND p.is_archived = false
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, [userId]);
    }

    // Format the data for the frontend
    const projects = projectsResult.rows.map(p => ({
      id: p.id,
      date: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      name: p.name,
      reports: parseInt(p.report_count, 10) || 0,
      canArchive: userRole === 'Admin' || userRole === 'Project Manager' // (P3)
    }));

    res.status(200).json(projects);

  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (FR-PROJ-001) Create New Project
 * (P6) Must be a Project Manager or Admin
 */
router.post('/', authenticateToken, authorizeRole('Admin', 'Project Manager'), async (req: AuthenticatedRequest, res) => {
  const { name, userIds, prompts, dictionaryId } = req.body;
  const creatorId = req.user?.userId;

  if (!name || !prompts || !dictionaryId || !userIds || !Array.isArray(userIds)) {
    return res.status(400).send({ message: "Missing required fields: name, userIds, prompts, dictionaryId" });
  }

  // We use a database transaction to ensure all queries succeed or fail together.
  const client = await query('BEGIN'); // Start transaction

  try {
    // 1. Create the Project
    const projectResult = await query(
      "INSERT INTO projects (name, creator_id, dictionary_id) VALUES ($1, $2, $3) RETURNING id",
      [name, creatorId, dictionaryId]
    );
    const projectId = projectResult.rows[0].id;

    // 2. Save the Prompts (P12)
    await query(
      `INSERT INTO project_prompts (project_id, general_context, persona_prompt, evidence_prompt, analysis_prompt, summary_prompt)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        projectId,
        prompts.general_context,
        prompts.persona_prompt,
        prompts.evidence_prompt,
        prompts.analysis_prompt,
        prompts.summary_prompt
      ]
    );

    // 3. Link the invited users (P13)
    // We also add the creator to their own project
    const allUserIds = [...new Set([...userIds, creatorId])]; // Add creator

    for (const userId of allUserIds) {
      await query(
        "INSERT INTO project_users (project_id, user_id) VALUES ($1, $2)",
        [projectId, userId]
      );
    }

    // If all queries were successful, commit the transaction
    await query('COMMIT');

    res.status(201).json({ 
      message: "Project created successfully",
      projectId: projectId 
    });

  } catch (error) {
    // If any query failed, roll back all changes
    await query('ROLLBACK');
    console.error("Error creating project:", error);
    res.status(500).send({ message: "Internal server error during project creation." });
  }
});

/**
 * (P16, U16) Get all reports for a specific project
 */
router.get('/:id/reports', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: projectId } = req.params;
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  try {
    let reportsResult;

    if (userRole === 'Admin' || userRole === 'Project Manager') {
      // (P17) Admins/PMs see ALL reports for the project
      reportsResult = await query(
        `SELECT r.id, r.created_at, r.title, u.email as user_email, (r.creator_id = $1) as can_archive
         FROM reports r
         JOIN users u ON r.creator_id = u.id
         WHERE r.project_id = $2 AND r.is_archived = false
         ORDER BY r.created_at DESC`,
        [userId, projectId]
      );
    } else {
      // (U17) Users only see their OWN reports
      reportsResult = await query(
        `SELECT r.id, r.created_at, r.title, u.email as user_email, true as can_archive
         FROM reports r
         JOIN users u ON r.creator_id = u.id
         WHERE r.project_id = $1 AND r.creator_id = $2 AND r.is_archived = false
         ORDER BY r.created_at DESC`,
        [projectId, userId]
      );
    }

    // Format the data for the frontend
    const reports = reportsResult.rows.map(r => ({
      id: r.id,
      date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      title: r.title,
      user: r.user_email,
      canArchive: r.can_archive // This is the boolean we calculated in the SQL query
    }));

    res.status(200).json(reports);

  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

export default router;