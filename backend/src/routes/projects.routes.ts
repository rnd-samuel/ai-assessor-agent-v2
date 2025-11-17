// backend/src/routes/projects.routes.ts
import { Router, Request } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';
import { query } from '../services/db';
import multer from 'multer';

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

// --- (FR-PROJ-002 / PD-3.4) Get Project List (with search) ---
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
 * (FR-PROJ-001) Create New Project
 * (P6) Must be a Project Manager or Admin
 */
router.post('/', authenticateToken, authorizeRole('Admin', 'Project Manager'), async (req: AuthenticatedRequest, res) => {
  const { name, userIds, prompts, dictionaryId, simulationMethodIds } = req.body;
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

    // Link the selected simulation methods (NP-4.5)
    if (simulationMethodIds && Array.isArray(simulationMethodIds)) {
      for (const methodId of simulationMethodIds) {
        await query(
          // TODO: This table name must match your database
          "INSERT INTO projects_to_global_methods (project_id, method_id) VALUES ($1, $2)",
          [projectId, methodId]
        );
      }
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

/**
 * (NP-4.2, 4.3, 4.5) Handle file uploads for a specific project
 * This route expects 'multipart/form-data'
 * It uses the 'upload.single('file')' middleware to process one file.
 */
router.post('/:id/upload', authenticateToken, authorizeRole('Admin', 'Project Manager'), upload.single('file'),
  async (req, res) => {
    const { id: projectId } = req.params;
    const { fileType } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).send({ message: 'No file uploaded.' });
    }

    if (!fileType) {
      return res.status(400).send({ message: 'Missing fileType.' });
    }

    console.log(`[File Upload] ProjectID: ${projectId}`);
    console.log(`[File Upload] FileType: ${fileType}`);
    console.log(`[File Upload] OriginalName: ${file.originalname}`);
    console.log(`[File Upload] Size: ${file.size} bytes`);

    try {
      // --- This is where you will add GCS and BullMQ logic later ---
      // TODO (Step 1): Upload file.buffer to Google Cloud Storage
      // const gcsUrl = await uploadToGCS(file.buffer, file.originalname);

      // TODO (Step 2): Save file metadata to the database
      // await query(
      //   "INSERT INTO project_files (project_id, file_name, gcs_url, file_type) VALUES ($1, $2, $3, $4)",
      //   [projectId, file.originalname, gcsUrl, fileType]
      // );
      
      // TODO (Step 3): If it's a KB file, queue an ingestion job
      // if (fileType === 'knowledgeBase' || fileType === 'simulationMethod') {
      //   await fileIngestionQueue.add('ingest-file', { projectId, gcsUrl });
      // }

      // For now, just send success
      res.status(200).send({
        message: 'File uploaded successfully (placeholder)',
        filename: file.originalname,
      });

    } catch (error) {
      console.error('File upload failed', error);
      res.status(500).send({ message: 'Internal server error during file upload.' });
    }
  }
)

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

    if (userRole === 'Admin' || userRole === 'Project Manager') {
      // (P17) Admins/PMs see ALL reports for the project
      sqlQuery = `
         SELECT r.id, r.created_at, r.title, u.name as user_name, (r.creator_id = $1) as can_archive
         FROM reports r
         JOIN users u ON r.creator_id = u.id
         WHERE r.project_id = $2 AND r.is_archived = false
      `;
      params.push(userId, projectId);
    } else {
      // (U17) Users only see their OWN reports
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
 * (NP-4.5) Get all available global simulation methods
 * Used by the NewProjectPage to populate the multi-select
 */
router.get('/available-simulation-methods', authenticateToken, async (req, res) => {
  try {
    // This reads the REAL data from your database.
    const result = await query(
      'SELECT id, name FROM global_simulation_methods ORDER BY name'
    );
    res.status(200).json(result.rows);

  } catch (error) {
    console.error('Error fetching simulation methods:', error);
    res.status(500).send({ message: 'Internal server error' });
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
      'SELECT id, email FROM users WHERE id != $1 ORDER BY email',
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
         u.email as creator_email,
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
    //    We will query the (not-yet-implemented) project_files table.
    //    For now, this will correctly return empty arrays.

    // TODO: Implement a 'project_files' table and query it here.
    const reportTemplateResult = { rows: [] as any[] };
    const knowledgeBaseResult = { rows: [] as any[] };

    const reportTemplate = reportTemplateResult.rows.length > 0 ? {
      name: reportTemplateResult.rows[0].file_name,
      url: reportTemplateResult.rows[0].gcs_url
    } : null;
    const knowledgeBaseFiles = knowledgeBaseResult.rows.map(f => ({
      name: f.file_name,
      url: f.gcs_url
    }));

    // 4. Assemble and send response
    res.status(200).json({
      projectName: projectData.project_name,
      projectManager: projectData.creator_email,
      reportTemplate: reportTemplate,
      knowledgeBaseFiles: knowledgeBaseFiles,
      dictionaryTitle: projectData.dictionary_name || 'N/A',
      dictionaryId: projectData.dictionary_id,
      simulationMethods: simMethods,
      generalContext: projectData.general_context || 'No general context provided.'
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

export default router;