// backend/src/routes/projects.routes.ts
import { Router, Request } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';
import { query } from '../services/db';
import { uploadToGCS, getSignedUrl } from '../services/storage';
import multer from 'multer';
import crypto from 'crypto';
import { generateReportDocx } from '../services/document-service';
import { extractDocxPlaceholders } from '../services/document-service';
import { fileIngestionQueue } from '../services/queue';

// Extend Request type to include 'user'
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

// Configure multer to store files in memory as buffers
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = Router();

// Helper: Calculate MD5 Hash of a buffer
const calculateHash = (buffer: Buffer): string => {
  return crypto.createHash('md5').update(buffer).digest('hex');
};

// Validation Regexes
// 1. Static: overall_strength, overall_weakness, overall_development
const STATIC_PATTERN = /^(overall_strength|overall_weakness|overall_development)$/;

// 2. Dynamic Competency: [Name] + suffix
// Suffixes: _level, _explanation, _development
// OR KB: _[level]_[kb] + suffix (_fulfillment, _explanation)
const DYNAMIC_PATTERN = /^\[[^\]]+\](_(level|explanation|development)|_(\d+|\[target_level\])_\d+_(fulfillment|explanation))$/;

const validatePlaceholder = (p: string): boolean => {
  return STATIC_PATTERN.test(p) || DYNAMIC_PATTERN.test(p);
};

// --- (FR-PROJ-001) Create New Project ---
router.post('/', authenticateToken, authorizeRole('Admin', 'Project Manager'), async (req: AuthenticatedRequest, res) => {
  const { name, userIds, prompts, dictionaryId, simulationFileIds, enableAnalysis, enableSummary } = req.body;
  const creatorId = req.user?.userId;

  if (!name || !prompts || !dictionaryId || !userIds) {
    return res.status(400).send({ message: "Missing required fields." });
  }

  // VALIDATION: Check for duplicate name for this creator
  try {
    const duplicateCheck = await query(
      `SELECT id FROM projects
       WHERE lower(name) = lower($1)
         AND creator_id = $2
         AND is_archived = false`,
      [name, creatorId]
    );
    if (duplicateCheck.rows.length > 0) {
      return res.status(409).send({ message: "You already have an active project with this name." });
    }

    await query('BEGIN');

    const projectResult = await query(
      `INSERT INTO projects (name, creator_id, dictionary_id, enable_analysis, enable_summary) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
      [name, creatorId, dictionaryId, enableAnalysis ?? true, enableSummary ?? true]
    );
    const projectId = projectResult.rows[0].id;

    await query(
      `INSERT INTO project_prompts (project_id, general_context, persona_prompt, evidence_prompt, analysis_prompt, summary_prompt)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, prompts.general_context, prompts.persona_prompt, prompts.evidence_prompt, prompts.analysis_prompt, prompts.summary_prompt]
    );

    const allUserIds = [...new Set([...userIds, creatorId])];
    for (const userId of allUserIds) {
      await query("INSERT INTO project_users (project_id, user_id) VALUES ($1, $2)", [projectId, userId]);
    }

    if (simulationFileIds && Array.isArray(simulationFileIds) && simulationFileIds.length > 0) {
      const uniqueMethodIds = new Set<string>();

      for (const fileId of simulationFileIds) {
        await query("INSERT INTO projects_to_simulation_files (project_id, file_id) VALUES ($1, $2)", [projectId, fileId]);

        const fileRes = await query("SELECT method_id FROM global_simulation_files WHERE id = $1", [fileId]);
        if (fileRes.rows.length > 0) {
          uniqueMethodIds.add(fileRes.rows[0].method_id);
        }
      }

      for (const methodId of uniqueMethodIds) {
        // Use ON CONFLICT DO NOTHING to avoid duplicates if multiple files share a method
        // Note: projects_to_global_methods needs a unique constraint or we check first. 
        // Since we are in a transaction and just created the project, checking existence is safe/easy, 
        // but "INSERT ... ON CONFLICT" is better if supported. 
        // Let's just do a simple check-then-insert loop for safety in this transaction.
        await query("INSERT INTO projects_to_global_methods (project_id, method_id) VALUES ($1, $2)", [projectId, methodId]);
      }
    }

    await query('COMMIT');
    res.status(201).json({ message: "Project created successfully", projectId });

  } catch (error: any) {
    await query('ROLLBACK');
    // Handle Unique Constraint Violation from DB (double safety)
    if (error.code === '23505') {
        return res.status(409).send({ message: "Project name must be unique among your active projects." });
    }
    console.error("Error creating project:", error);
    res.status(500).send({ message: "Internal server error." });
  }
});

// --- (FR-PROJ-002) Get Project List ---
// This route is protected. A user MUST be logged in to see it.
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  const { search } = req.query; // <-- 1. GET THE SEARCH QUERY

  try {
    let projectsResult;
    // 2. Base query and parameters
    let sqlQuery = '';
    const params: any[] = [];

    if (userRole === 'Admin') {
      sqlQuery = `
        SELECT p.id, p.name, p.created_at, p.creator_id, COUNT(r.id) as report_count
        FROM projects p
        LEFT JOIN reports r ON p.id = r.project_id AND r.is_archived = false
        WHERE p.is_archived = false
      `;
    } else {
      sqlQuery = `
        SELECT p.id, p.name, p.created_at, p.creator_id, COUNT(r.id) as report_count
        FROM projects p
        JOIN project_users pu ON p.id = pu.project_id
        LEFT JOIN reports r ON p.id = r.project_id AND r.creator_id = $1 AND r.is_archived = false
        WHERE pu.user_id = $1 AND p.is_archived = false
      `;
      params.push(userId);
    }

    // 3. Dynamically add the SEARCH filter
    if (search && typeof search === 'string' && search.trim() !== '') {
      // Both base queries already have a WHERE clause, so we can always safely add AND
      sqlQuery += ' AND'; 
      sqlQuery += ` p.name ILIKE $${params.length + 1}`;
      params.push(`%${search.trim()}%`);
    }

    sqlQuery += ' GROUP BY p.id, p.name, p.created_at, p.creator_id ORDER BY p.created_at DESC';

    // 4. Execute the final query
    projectsResult = await query(sqlQuery, params);

    // 5. Format the data (this logic is now more complex, so we update it)
    const projects = projectsResult.rows.map(p => {
      const reportCount = parseInt(p.report_count, 10) || 0;
      const isCreator = p.creator_id === userId;
      
      return {
        id: p.id,
        date: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        name: p.name,
        reports: reportCount,
        canArchive: (
          (userRole === 'Admin' || isCreator) && // User is Admin OR project creator
          reportCount === 0 // AND project has 0 reports
        )
      };
    });

    res.status(200).json(projects);

  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (NR-5.2)
 * Edit Project via Context
 */
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name, userIds } = req.body;
  const userId = req.user?.userId;

  // Validation: Only creator can update
  const proj = await query('SELECT creator_id FROM projects WHERE id = $1', [id]);
  if (proj.rows.length === 0) return res.status(404).send({ message: "Project not found" });
  if (proj.rows[0].creator_id !== userId) return res.status(403).send({ message: "Only the creator can edit this project." });

  try {
    await query('BEGIN');
    
    // 1. Update Name
    if (name) {
        await query('UPDATE projects SET name = $1 WHERE id = $2', [name, id]);
    }

    // 2. Update Users (Full Replace Strategy for simplicity)
    if (userIds && Array.isArray(userIds)) {
        // Remove old users (except creator) - Wait, creator isn't in project_users table in our schema?
        // Actually, in `POST /`, we added creator to project_users.
        // Let's just wipe and recreate, ensuring creator is always there.
        
        await query('DELETE FROM project_users WHERE project_id = $1', [id]);
        
        const allUsers = [...new Set([...userIds, userId])];
        for (const uid of allUsers) {
             await query("INSERT INTO project_users (project_id, user_id) VALUES ($1, $2)", [id, uid]);
        }
    }

    await query('COMMIT');
    res.send({ message: "Project updated successfully." });

  } catch (error) {
    await query('ROLLBACK');
    console.error("Error updating project:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (NR-6.2, NR-6.3)
 * Get the necessary data for filling out the "New Report" form.
 * This includes the project's competency dictionary and its simulation methods.
 */
router.get('/:id/form-data', authenticateToken, async (req, res) => {
  const { id: projectId } = req.params;

  if (!projectId || projectId === 'undefined' || projectId === '${project.id}') {
    return res.status(400).send({ message: "Project ID is invalid." });
  }

  try {
    // 1. Get the Competency Dictionary
    //We join projects and competency_dictionaries to get the dictionary 'content'
    const dictQuery = await query(
      `SELECT cd.content
       FROM competency_dictionaries cd
       JOIN projects p ON p.dictionary_id = cd.id
       WHERE p.id = $1`,
      [projectId]
    );

    let competencies: { id: string, name: string }[] = [];
    if (dictQuery.rows.length > 0) {
      const dictionary = dictQuery.rows[0].content;
      if (dictionary.kompetensi) {
        competencies = dictionary.kompetensi.map((comp: any) => ({
          id: comp.id || comp.namaKompetensi,
          name: comp.name || comp.namaKompetensi
        }));
      }
    }

    // 2. Get Global Simulation Methods linked to this project
    const globalMethodsQuery = await query(
      `SELECT gsm.id, gsm.name
       FROM global_simulation_methods gsm
       JOIN projects_to_global_methods pgm ON pgm.method_id = gsm.id
       WHERE pgm.project_id = $1`,
      [projectId]
    );

    // 3. Get Project-Specific Simulation Methods
    const projectMethodsQuery = await query(
      `SELECT id, name
       FROM project_simulation_methods
       WHERE project_id = $1`,
      [projectId]
    );

    const simulationMethods = [
      ...globalMethodsQuery.rows,
      ...projectMethodsQuery.rows
    ];

    // 4. Send all data to the frontend
    res.status(200).json({
      competencies,
      simulationMethods,
    });

  } catch (error: any) {
    console.error("Error fetching project form-data:", error);
    res.status(500).send({ message: "Internal server error", detail: error.message });
  }
});

// --- (NP-4.2/4.3) Upload Project Files (GCS + Duplicate Check) ---
router.post('/:id/upload', authenticateToken, authorizeRole('Admin', 'Project Manager'), upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    const { id: projectId } = req.params;
    const { fileType } = req.body; // 'template', 'knowledgeBase'
    const file = req.file;
    const userId = req.user?.userId;

    if (!file || !fileType) return res.status(400).send({ message: 'File or fileType missing.' });

    // Validation: Ensure fileType is valid
    if (!['template', 'knowledgeBase'].includes(fileType)) {
        return res.status(400).send({ message: "Invalid file type." });
    }

    try {
      // 1. Calculate Hash
      const fileHash = calculateHash(file.buffer);

      // 2. Check for Duplicates in this Project
      // We assume duplicate means: Same Project AND Same Content Hash
      // This ensures "Same file names (or content) uploaded in DIFFERENT projects are allowed"
      const duplicateCheck = await query(
        "SELECT id FROM project_files WHERE project_id = $1 AND file_hash = $2",
        [projectId, fileHash]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).send({ message: `File '${file.originalname}' is a duplicate in this project.` });
      }

      // 3. Upload to GCS
      const folder = `projects/${projectId}/${fileType}`;
      const gcsPath = await uploadToGCS(file.buffer, file.originalname, folder);

      // 4. Save to DB
      const dbResult = await query(
        `INSERT INTO project_files (project_id, file_name, gcs_path, file_type, file_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [projectId, file.originalname, gcsPath, fileType, fileHash]
      );

      const newFileId = dbResult.rows[0].id;

      // 5. Trigger Background Processing (Chunking & Embedding)
      // We only need to embed Knowledge Base files, not Templates
      if (fileType === 'knowledgeBase') {
        await fileIngestionQueue.add('process-project-file', {
          fileId: newFileId,
          gcsPath: gcsPath,
          userId: userId,
          projectId: projectId
        });
        console.log(`[Upload] Queued file ${newFileId} for embedding.`);
      }

      // 6. Handle Template Analysis (Synchronous is fine for small docx headers)
      let placeholders: string[] = [];

      if (fileType === 'template') {
        try {
          placeholders = extractDocxPlaceholders(file.buffer);
        } catch (err) {
          console.error("Template analysis warning:", err);
        }
      }
      
      res.status(200).send({ 
        message: 'File uploaded successfully.', 
        filename: file.originalname,
        placeholders: placeholders
      });

    } catch (error) {
      console.error('File upload failed:', error);
      res.status(500).send({ message: 'Internal server error.' });
    }
  }
);

/**
 * (P16, U16, RD-5.5) Get all reports for a specific project (with search)
 */
router.get('/:id/reports', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: projectId } = req.params;
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  const { search } = req.query; // <-- GET THE SEARCH QUERY

  try {
    let reportsResult;
    let sqlQuery = '';
    const params: any[] = [];

    if (userRole === 'Admin') {
      // Admin sees ALL reports
      sqlQuery = `
         SELECT r.id, r.created_at, r.title, u.name as user_name, (r.creator_id = $1) as can_archive
         FROM reports r
         JOIN users u ON r.creator_id = u.id
         WHERE r.project_id = $2 AND r.is_archived = false
      `;
      params.push(userId, projectId);
    } else if (userRole === 'Project Manager') {
      // Check if this PM is the CREATOR of the project
      const projectCheck = await query('SELECT creator_id FROM projects WHERE id = $1', [projectId]);
      const isProjectCreator = projectCheck.rows.length > 0 && projectCheck.rows[0].creator_id === userId;

      if (isProjectCreator) {
        sqlQuery = `
           SELECT r.id, r.created_at, r.title, u.name as user_name, (r.creator_id = $1) as can_archive
           FROM reports r
           JOIN users u ON r.creator_id = u.id
           WHERE r.project_id = $2 AND r.is_archived = false
        `;
        params.push(projectId, userId);
      } else {
      // PM is NOT Creator (just invivted): See ONLY OWN reports
        sqlQuery = `
           SELECT r.id, r.created_at, r.title, u.name as user_name, true as can_archive
           FROM reports r
           JOIN users u ON r.creator_id = u.id
           WHERE r.project_id = $1 AND r.creator_id = $2 AND r.is_archived = false
        `;
        params.push(projectId, userId);
      }
    } else {
      // Normal User: See ONLY OWN reports
      sqlQuery = `
         SELECT r.id, r.created_at, r.title, u.name as user_name, true as can_archive
         FROM reports r
         JOIN users u ON r.creator_id = u.id
         WHERE r.project_id = $1 AND r.creator_id = $2 AND r.is_archived = false
      `;
      params.push(projectId, userId);
    }

    // --- THIS IS THE CRITICAL LOGIC ---
    // Dynamically add the SEARCH filter
    if (search && typeof search === 'string' && search.trim() !== '') {
      sqlQuery += ` AND r.title ILIKE $${params.length + 1}`; // ILIKE is case-insensitive
      params.push(`%${search.trim()}%`); // Add wildcards and trim whitespace
    }
    
    sqlQuery += ' ORDER BY r.created_at DESC';

    // Execute the final query
    reportsResult = await query(sqlQuery, params);

    // Format the data for the frontend
    const reports = reportsResult.rows.map(r => ({
      id: r.id,
      date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      title: r.title,
      user: r.user_name,
      canArchive: r.can_archive
    }));

    res.status(200).json(reports);

  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (NP-4.4) Get all available competency dictionaries
 * Used by the NewProjectPage to populate the dropdown
 */
router.get('/available-dictionaries', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name FROM competency_dictionaries ORDER BY created_at DESC'
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching dictionaries:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (RD-5.5 / U20) Get all ARCHIVED reports for a specific project (with search)
 */
router.get('/:id/reports/archived', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: projectId } = req.params;
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  const { search } = req.query; // <-- GET THE SEARCH QUERY

  try {
    let reportsResult;
    let sqlQuery = '';
    const params: any[] = [];

    if (userRole === 'Admin' || userRole === 'Project Manager') {
      sqlQuery = `
         SELECT r.id, r.created_at, r.title, u.name as user_name, (r.creator_id = $1) as can_archive
         FROM reports r
         JOIN users u ON r.creator_id = u.id
         WHERE r.project_id = $2 AND r.is_archived = true
      `;
      params.push(userId, projectId);
    } else {
      sqlQuery = `
         SELECT r.id, r.created_at, r.title, u.name as user_name, true as can_archive
         FROM reports r
         JOIN users u ON r.creator_id = u.id
         WHERE r.project_id = $1 AND r.creator_id = $2 AND r.is_archived = true
      `;
      params.push(projectId, userId);
    }

    // --- THIS IS THE CRITICAL LOGIC ---
    // Dynamically add the SEARCH filter
    if (search && typeof search === 'string' && search.trim() !== '') {
      sqlQuery += ` AND r.title ILIKE $${params.length + 1}`;
      params.push(`%${search.trim()}%`);
    }

    sqlQuery += ' ORDER BY r.created_at DESC';
    
    // Execute the final query
    reportsResult = await query(sqlQuery, params);
    
    const reports = reportsResult.rows.map(r => ({
      id: r.id,
      date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      title: r.title,
      user: r.user_name,
      canArchive: r.can_archive
    }));

    res.status(200).json(reports);

  } catch (error) {
    console.error("Error fetching archived reports:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (PD-3.5) Archive a Project
 */
router.put('/:id/archive', authenticateToken, authorizeRole('Admin', 'Project Manager'), async (req: AuthenticatedRequest, res) => {
  const { id: projectId } = req.params;
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  try {
    // 1. Get project creator and report count
    const projectResult = await query(
      `SELECT 
         creator_id, 
         (SELECT COUNT(*) FROM reports WHERE project_id = $1) as report_count 
       FROM projects 
       WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).send({ message: 'Project not found' });
    }

    const project = projectResult.rows[0];
    const reportCount = parseInt(project.report_count, 10);
    const isCreator = project.creator_id === userId;
    const isAdmin = userRole === 'Admin';

    // 2. Enforce User Story PD-3.5 rules
    if (!isAdmin && !isCreator) {
      return res.status(403).send({ message: 'Forbidden: Only the project creator or an Admin can archive.' });
    }
    if (reportCount > 0) {
      return res.status(400).send({ message: 'Bad Request: Cannot archive a project that has reports.' });
    }

    // 3. Update the project
    await query(
      'UPDATE projects SET is_archived = true WHERE id = $1',
      [projectId]
    );

    res.status(200).send({ message: 'Project archived successfully.' });

  } catch (error) {
    console.error('Error archiving project:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (PD-3.7) Get all ARCHIVED projects (with search)
 */
router.get('/archived', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  const { search } = req.query; // <-- 1. GET THE SEARCH QUERY

  try {
    let projectsResult;
    // 2. Base query and parameters
    let sqlQuery = '';
    const params: any[] = [];

    if (userRole === 'Admin') {
      sqlQuery = `
        SELECT p.id, p.name, p.created_at, p.creator_id, 0 as report_count
        FROM projects p
        WHERE p.is_archived = true
      `;
    } else {
      sqlQuery = `
        SELECT p.id, p.name, p.created_at, p.creator_id, 0 as report_count
        FROM projects p
        JOIN project_users pu ON p.id = pu.project_id
        WHERE pu.user_id = $1 AND p.is_archived = true
      `;
      params.push(userId);
    }

    // 3. Dynamically add the SEARCH filter
    if (search && typeof search === 'string' && search.trim() !== '') {
      // Both base queries already have a WHERE clause, so we can always safely add AND
      sqlQuery += ' AND';
      sqlQuery += ` p.name ILIKE $${params.length + 1}`;
      params.push(`%${search.trim()}%`);
    }
    
    sqlQuery += ' GROUP BY p.id, p.name, p.created_at, p.creator_id ORDER BY p.created_at DESC';

    // 4. Execute the final query
    projectsResult = await query(sqlQuery, params);

    // 5. Format the data
    const projects = projectsResult.rows.map(p => ({
      id: p.id,
      date: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      name: p.name,
      reports: 0, 
      canArchive: (userRole === 'Admin' || p.creator_id === userId)
    }));

    res.status(200).json(projects);

  } catch (error) {
    console.error("Error fetching archived projects:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (PD-3.7) Unarchive a Project
 */
router.put('/:id/unarchive', authenticateToken, authorizeRole('Admin', 'Project Manager'), async (req: AuthenticatedRequest, res) => {
  const { id: projectId } = req.params;
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  try {
    // 1. Get project creator
    const projectResult = await query(
      `SELECT creator_id FROM projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).send({ message: 'Project not found' });
    }

    const project = projectResult.rows[0];
    const isCreator = project.creator_id === userId;
    const isAdmin = userRole === 'Admin';

    // 2. Enforce User Story PD-3.7 rules (only creator or Admin)
    if (!isAdmin && !isCreator) {
      return res.status(403).send({ message: 'Forbidden: Only the project creator or an Admin can unarchive.' });
    }

    // 3. Update the project
    await query(
      'UPDATE projects SET is_archived = false WHERE id = $1',
      [projectId]
    );

    res.status(200).send({ message: 'Project unarchived successfully.' });

  } catch (error) {
    console.error('Error unarchiving project:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (PD-3.8) Permanently Delete a Project
 * Restriction: Admin Only, and Project must be Archived.
 */
router.delete('/:id', authenticateToken, authorizeRole('Admin'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    // 1. Safety Check: Is it archived?
    const check = await query('SELECT is_archived FROM projects WHERE id = $1', [id]);
    
    if (check.rows.length === 0) {
      return res.status(404).send({ message: "Project not found." });
    }
    
    if (!check.rows[0].is_archived) {
      return res.status(400).send({ message: "Cannot delete an active project. Archive it first." });
    }

    // 2. Perform Delete (Cascade will handle reports, files, etc. if schema is set up right)
    await query('DELETE FROM projects WHERE id = $1', [id]);
    
    res.send({ message: "Project permanently deleted." });

  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).send({ message: "Internal server error." });
  }
});

/**
 * (NP-4.5) Get all available global simulation methods
 * Used by the NewProjectPage to populate the multi-select
 */
router.get('/available-simulation-files', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT f.id, f.file_name, m.name as method_name, m.id as method_id
      FROM global_simulation_files f
      JOIN global_simulation_methods m ON f.method_id = m.id
      ORDER BY m.name, f.file_name
    `);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching simulation files:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (NP-4.6) Get default prompts
 */
router.get('/defaults/prompts', authenticateToken, async (req, res) => {
  try {
    const result = await query("SELECT value FROM system_settings WHERE key = 'default_prompts'");
    res.json(result.rows[0]?.value || {});
  } catch (error) {
    console.error("Error fetching default prompts:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (NP-4.7) Get all users in the system
 * Used by the NewProjectPage to populate the multi-select
 */
router.get('/available-users', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const currentUserId = req.user?.userId; // Get the ID of the user making the request

  try {
    // Fetch all users *except* the user creating the project
    const result = await query(
      'SELECT id, email, name FROM users WHERE id != $1 ORDER BY email',
      [currentUserId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (RD-5.2) Get all context data for a specific project
 */
router.get('/:id/context', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: projectId } = req.params;
  const userId = req.user?.userId;

  try {
    // 1. Get Project, Creator, and Dictionary
    const projectResult = await query(
      `SELECT 
         p.name as project_name,
         p.dictionary_id,
         p.enable_analysis,
         p.enable_summary,
         u.email as creator_email,
         u.name as creator_name,
         cd.name as dictionary_name,
         pp.general_context
       FROM projects p
       JOIN users u ON p.creator_id = u.id
       LEFT JOIN competency_dictionaries cd ON p.dictionary_id = cd.id
       LEFT JOIN project_prompts pp ON p.id = pp.project_id
       WHERE p.id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).send({ message: "Project not found" });
    }
    const projectData = projectResult.rows[0];

    // 2. Get Simulation Methods
    const globalMethods = await query(
      `SELECT gsm.name FROM global_simulation_methods gsm
       JOIN projects_to_global_methods pgm ON gsm.id = pgm.method_id
       WHERE pgm.project_id = $1`,
      [projectId]
    );
    // TODO: Add project_simulation_methods query here when implemented

    const simMethods = globalMethods.rows.map(r => r.name);

    // 3. Get file-based data (Report Template, KB Files)
    const filesResult = await query(
      `SELECT file_name, gcs_path, file_type 
       FROM project_files 
       WHERE project_id = $1`,
      [projectId]
    );

    let reportTemplate = null;
    const knowledgeBaseFiles = [];

    for (const file of filesResult.rows) {
        // Format: "ProjectTitle - FileName"
        const customName = `${projectData.project_name} - ${file.file_name}`;

        // Generate a signed URL for secure access (valid for 15 mins)
        const signedUrl = await getSignedUrl(file.gcs_path);

        const fileObj = {
            name: file.file_name,
            url: signedUrl
        };

        if (file.file_type === 'template') {
            reportTemplate = fileObj;
        } else if (file.file_type === 'knowledgeBase') {
            knowledgeBaseFiles.push(fileObj);
        }
    }

    // 4. Get invited users
    const usersResult = await query(
      `SELECT u.id, u.email, u.name
       FROM project_users pu
       JOIN users u ON pu.user_id = u.id
       WHERE pu.project_id = $1`,
      [projectId]
    );
    const invitedUsers = usersResult.rows;

    // 5. Assemble and send response
    res.status(200).json({
      projectName: projectData.project_name,
      projectManager: projectData.creator_name || projectData.creator_email,
      projectManagerEmail: projectData.creator_email,
      invitedUsers: usersResult.rows,
      reportTemplate: reportTemplate,
      knowledgeBaseFiles: knowledgeBaseFiles,
      dictionaryTitle: projectData.dictionary_name || 'N/A',
      dictionaryId: projectData.dictionary_id,
      simulationMethods: simMethods,
      generalContext: projectData.general_context || 'No general context provided.',
      enableAnalysis: projectData.enable_analysis,
      enableSummary: projectData.enable_summary
    });

  } catch (error) {
    console.error("Error fetching project context:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * --- 2. ADD NEW ROUTE FOR DICTIONARY CONTENT ---
 * (RP-7.2 / RD-5.2) Get the content of a specific competency dictionary
 */
router.get('/dictionary/:id/content', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: dictionaryId } = req.params;

  try {
    const result = await query(
      `SELECT content FROM competency_dictionaries WHERE id = $1`,
      [dictionaryId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send({ message: "Dictionary not found" });
    }

    res.status(200).json(result.rows[0].content); // Send the raw JSON content

  } catch (error) {
    console.error("Error fetching dictionary content:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * Analyze a template file without saving it.
 */
router.post('/analyze-template', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send({ message: "No file provided." });
  
  try {
    // 1. Extract all text inside { }
    const allPlaceholders = extractDocxPlaceholders(req.file.buffer);
    
    // 2. Filter Validity
    const validPlaceholders: string[] = [];
    const invalidPlaceholders: string[] = [];

    allPlaceholders.forEach(p => {
      if (validatePlaceholder(p)) {
        validPlaceholders.push(p);
      } else {
        invalidPlaceholders.push(p);
      }
    });

    res.json({ 
      placeholders: allPlaceholders, 
      invalidPlaceholders // <-- Send this back
    });

  } catch (error) {
    console.error("Analysis error:", error);
    res.status(400).send({ message: "Failed to analyze template." });
  }
});

export default router;