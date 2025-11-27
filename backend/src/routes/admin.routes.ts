// backend/src/routes/admin.routes.ts
import { Router, Request } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';
import { aiGenerationQueue } from '../services/queue';
import { query } from '../services/db';
import { uploadToGCS } from '../services/storage';
import multer from 'multer';
import bcrypt from 'bcrypt';

// Extend Request type
interface AuthenticatedRequest extends Request {
  user?: { userId: string; role: string };
}

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = Router();

// Middleware: All routes here require 'Admin' role
router.use(authenticateToken, authorizeRole('Admin'));

/**
 * (ADM-8.2) Get Usage Stats
 * Mocked for now, but structured for the frontend.
 */
router.get('/stats/usage', async (req: AuthenticatedRequest, res) => {
  try {
    // In a real app, you'd query a 'usage_logs' table here.
    const stats = {
        apiRequests: [120, 150, 180, 220, 190, 240, 260], // Last 7 days
        tokenUsage: {
            input: [50000, 60000, 55000, 70000, 65000, 75000, 80000],
            output: [20000, 25000, 22000, 30000, 28000, 32000, 35000]
        },
        avgWaitTime: [15.2, 12.5, 18.1],
        errorRate: 1.2,
        totalCost: 123.45
    };
    res.json(stats);
  } catch (error) {
    console.error("Error fetching usage stats:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (ADM-8.3) Get Queue Stats
 * Real data from BullMQ.
 */
router.get('/stats/queue', async (req: AuthenticatedRequest, res) => {
  try {
    const counts = await aiGenerationQueue.getJobCounts(
        'active', 'completed', 'failed', 'delayed', 'waiting'
    );
    
    res.json({
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed,
        waiting: counts.waiting + counts.delayed
    });
  } catch (error) {
    console.error("Error fetching queue stats:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * Get all Global Knowledge Files
 */
router.get('/knowledge-base', async (req: AuthenticatedRequest, res) => {
  try {
    const result = await query('SELECT id, file_name, created_at FROM global_knowledge_files ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching global KB:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * Upload Global Knowledge File -> Triggers Context Update
 */
router.post('/knowledge-base', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  const file = req.file;
  const creatorId = req.user?.userId;

  if (!file) return res.status(400).send({ message: 'File is required.' });

  try {
    // 1. Upload to GCS
    const gcsPath = await uploadToGCS(file.buffer, file.originalname, 'global-kb');

    // 2. Save Metadata
    const result = await query(
      'INSERT INTO global_knowledge_files (file_name, gcs_path, created_by) VALUES ($1, $2, $3) RETURNING id, file_name, created_at',
      [file.originalname, gcsPath, creatorId]
    );

    // 3. Trigger Context Update Job
    await aiGenerationQueue.add('update-global-context', {
        gcsPath: gcsPath,
        userId: creatorId
    });

    res.status(201).json({ 
        message: "File uploaded. Global Context is updating...",
        file: result.rows[0] 
    });

  } catch (error) {
    console.error('Error uploading global KB:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * Delete Global Knowledge File
 */
router.delete('/knowledge-base/:id', async (req: AuthenticatedRequest, res) => {
    // Note: Deleting a file does NOT automatically strip its info from the "Distilled Guide".
    // The guide is a synthesis. To remove info, you'd typically need to regenerate the guide 
    // or edit it manually (future feature). For now, we just delete the file record.
    try {
        await query('DELETE FROM global_knowledge_files WHERE id = $1', [req.params.id]);
        res.send({ message: "File deleted." });
    } catch (error) {
        res.status(500).send({ message: "Server error" });
    }
});

/**
 * (ADM-8.6) Get all Competency Dictionaries
 */
router.get('/dictionaries', async (req: AuthenticatedRequest, res) => {
  try {
    // Modified query to check usage status
    // We assume "in use" means linked to at least one UNARCHIVED (active) project.
    const result = await query(`
      SELECT 
        d.id, 
        d.name, 
        d.created_at,
        EXISTS (
          SELECT 1 FROM projects p 
          WHERE p.dictionary_id = d.id AND p.is_archived = false
        ) as is_in_use
      FROM competency_dictionaries d
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching dictionaries:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.6) Upload/Create a new Competency Dictionary
 * Expects a JSON body with { name: string, content: object }
 */
router.post('/dictionaries', async (req: AuthenticatedRequest, res) => {
  const { name, content } = req.body;
  const creatorId = req.user?.userId;

  if (!name || !content) {
    return res.status(400).send({ message: 'Name and content are required.' });
  }

  try {
    const result = await query(
      'INSERT INTO competency_dictionaries (name, content, created_by) VALUES ($1, $2, $3) RETURNING id, name, created_at',
      [name, content, creatorId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating dictionary:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(409).send({ message: 'A dictionary with this name already exists.' });
    }
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.6) Update a Competency Dictionary
 */
router.put('/dictionaries/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name, content } = req.body;

  if (!name || !content) {
    return res.status(400).send({ message: 'Name and content are required.' });
  }

  try {
    const result = await query(
      'UPDATE competency_dictionaries SET name = $1, content = $2 WHERE id = $3 RETURNING id',
      [name, content, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).send({ message: 'Dictionary not found.' });
    }

    res.status(200).send({ message: 'Dictionary updated successfully.' });
  } catch (error: any) {
    console.error('Error updating dictionary:', error);
    if (error.code === '23505') {
      return res.status(409).send({ message: 'A dictionary with this name already exists.' });
    }
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.6) Delete a Competency Dictionary
 */
router.delete('/dictionaries/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const result = await query('DELETE FROM competency_dictionaries WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send({ message: 'Dictionary not found.' });
    }
    res.status(200).send({ message: 'Dictionary deleted successfully.' });
  } catch (error) {
    console.error('Error deleting dictionary:', error);
    // Check for foreign key violation (if used in projects)
    if ((error as any).code === '23503') {
        return res.status(400).send({ message: 'Cannot delete: This dictionary is currently used by one or more projects.' });
    }
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.7) Get all Global Simulation Methods
 */
router.get('/simulation-methods', async (req: AuthenticatedRequest, res) => {
  try {
    const result = await query(
      'SELECT id, name, description, created_at FROM global_simulation_methods ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching simulation methods:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.7) Create a new Simulation Method
 */
router.post('/simulation-methods', async (req: AuthenticatedRequest, res) => {
  const { name, description } = req.body; // <-- Add description
  const creatorId = req.user?.userId;

  if (!name) {
    return res.status(400).send({ message: 'Method name is required.' });
  }

  try {
    const result = await query(
      'INSERT INTO global_simulation_methods (name, description, created_by) VALUES ($1, $2, $3) RETURNING id, name, description',
      [name, description || '', creatorId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating simulation method:', error);
    if (error.code === '23505') {
      return res.status(409).send({ message: 'A method with this name already exists.' });
    }
    res.status(500).send({ message: 'Internal server error' });
  }
});

router.put('/simulation-methods/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  if (!name) return res.status(400).send({ message: "Name is required" });

  try {
    // Check if used in active projects? 
    // Requirement says "edit/delete only enabled if never used".
    // We'll do a strict check for now.
    const check = await query('SELECT 1 FROM projects_to_global_methods WHERE method_id = $1 LIMIT 1', [id]);
    
    // NOTE: Editing the *description* might be safe even if used, but renaming might be confusing. 
    // For strict compliance with "edit only enabled if never used", uncomment this:
    /*
    if ((check.rowCount || 0) > 0) {
       return res.status(400).send({ message: "Cannot edit: Method is in use." });
    }
    */

    const result = await query(
      'UPDATE global_simulation_methods SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description, id]
    );

    if (result.rowCount === 0) return res.status(404).send({ message: "Method not found" });
    
    res.json(result.rows[0]);

  } catch (error: any) {
    console.error("Error updating method:", error);
    if (error.code === '23505') return res.status(409).send({ message: "Name already taken." });
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (ADM-8.7) Delete a Simulation Method
 */
router.delete('/simulation-methods/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    // Check if used in projects first
    const check = await query('SELECT 1 FROM projects_to_global_methods WHERE method_id = $1', [id]);
    if (check.rowCount && check.rowCount > 0) {
       return res.status(400).send({ message: 'Cannot delete: This method is being used by active projects.' });
    }

    const result = await query('DELETE FROM global_simulation_methods WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send({ message: 'Method not found.' });
    }
    res.status(200).send({ message: 'Method deleted successfully.' });
  } catch (error) {
    console.error('Error deleting simulation method:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.7) Get all Global Simulation Files
 */
router.get('/simulation-files', async (req: AuthenticatedRequest, res) => {
  try {
    // Join with the method table to get the tag name (e.g., 'Case Study')
    const result = await query(`
      SELECT f.id, f.file_name, f.created_at, m.name as method_name 
      FROM global_simulation_files f
      JOIN global_simulation_methods m ON f.method_id = m.id
      ORDER BY f.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching simulation files:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.7) Upload a new Global Simulation File
 * Expects multipart/form-data: { file: (binary), methodId: string }
 * UPDATED: Now triggers 'update-sim-context'
 */
router.post('/simulation-files', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  const { methodId } = req.body;
  const file = req.file;
  const creatorId = req.user?.userId;

  if (!file || !methodId) {
    return res.status(400).send({ message: 'File and Method ID are required.' });
  }

  try {
    // 1. Upload to GCS (Changed from raw text storage)
    const gcsPath = await uploadToGCS(file.buffer, file.originalname, `simulation-methods/${methodId}`);

    // 2. Save Metadata (Removed file_content column use)
    // Note: You might need to update your DB schema to remove 'file_content' constraint if it was NOT NULL
    // For now, we just won't insert it, assuming you made it nullable or dropped it.
    const result = await query(
      `INSERT INTO global_simulation_files (file_name, gcs_path, method_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, file_name`,
      [file.originalname, gcsPath, methodId, creatorId]
    );

    const newFileId = result.rows[0].id;

    // 3. Trigger Context Update
    await aiGenerationQueue.add('update-sim-context', {
        fileId: newFileId,
        methodId,
        gcsPath,
        userId: creatorId
    });

    res.status(201).json({
        message: "File uploaded. Simulation Context is updating...",
        file: result.rows[0]
    });

  } catch (error) {
    console.error('Error uploading simulation file:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.7) Delete a Simulation File
 */
router.delete('/simulation-files/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM global_simulation_files WHERE id = $1', [id]);
    res.status(200).send({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Error deleting simulation file:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.8 / 8.9) Get System Settings
 */
router.get('/settings/:key', async (req: AuthenticatedRequest, res) => {
  const { key } = req.params;
  try {
    const result = await query('SELECT value FROM system_settings WHERE key = $1', [key]);
    // Return empty object if not found, rather than 404, for easier frontend handling
    res.json(result.rows[0]?.value || {});
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (ADM-8.8 / 8.9) Update System Settings
 */
router.put('/settings/:key', async (req: AuthenticatedRequest, res) => {
  const { key } = req.params;
  const value = req.body; // The JSON object
  const userId = req.user?.userId;

  if (!value) return res.status(400).send({ message: "Value is required." });

  try {
    await query(
      `INSERT INTO system_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE 
       SET value = $2, updated_by = $3, updated_at = NOW()`,
      [key, value, userId]
    );
    res.send({ message: "Settings updated successfully." });
  } catch (error) {
    console.error(`Error updating setting ${key}:`, error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (ADM-8.10) Get All Users
 */
router.get('/users', async (req: AuthenticatedRequest, res) => {
  try {
    // Exclude password_hash for security
    const result = await query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.10) Delete a User
 */
router.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  
  // Prevent an admin from deleting themselves
  if (id === req.user?.userId) {
    return res.status(400).send({ message: "You cannot delete your own account." });
  }

  try {
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send({ message: 'User not found.' });
    }
    res.status(200).send({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.10) Update a User
 */
router.put('/users/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name, email, role, password } = req.body;

  try {
    // 1. Build the query dynamically based on whether password is provided
    let queryText = '';
    let queryParams = [];

    if (password && password.trim() !== '') {
      // Case A: Updating Password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      
      queryText = `
        UPDATE users 
        SET name = $1, email = $2, role = $3, password_hash = $4 
        WHERE id = $5 
        RETURNING id, name, email, role
      `;
      queryParams = [name, email, role, passwordHash, id];
    } else {
      // Case B: Keeping existing password
      queryText = `
        UPDATE users 
        SET name = $1, email = $2, role = $3 
        WHERE id = $4 
        RETURNING id, name, email, role
      `;
      queryParams = [name, email, role, id];
    }

    const result = await query(queryText, queryParams);

    if (result.rowCount === 0) {
      return res.status(404).send({ message: 'User not found.' });
    }

    res.status(200).json(result.rows[0]);

  } catch (error: any) {
    console.error('Error updating user:', error);
    if (error.code === '23505') {
        return res.status(409).send({ message: 'Email already in use.' });
    }
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (ADM-8.11) Get All AI Models
 */
router.get('/ai-models', async (req: AuthenticatedRequest, res) => {
  try {
    const result = await query('SELECT * FROM ai_models ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching AI models:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (ADM-8.11) Add New AI Model
 */
router.post('/ai-models', async (req: AuthenticatedRequest, res) => {
  const { id, context_window, input_cost, output_cost } = req.body;

  if (!id) return res.status(400).send({ message: "Model ID is required." });

  // TODO: Optional - Add OpenRouter API check here

  try {
    await query(
      `INSERT INTO ai_models (id, name, context_window, input_cost_per_m, output_cost_per_m)
       VALUES ($1, $1, $2, $3, $4)`,
      [id, context_window || 0, input_cost || 0, output_cost || 0]
    );
    res.status(201).send({ message: "Model added successfully." });
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).send({ message: "Model ID already exists." });
    console.error("Error adding model:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (ADM-8.11) Delete AI Model
 */
router.delete('/ai-models/:id', async (req: AuthenticatedRequest, res) => {
  // Note: In production, check if this model is currently selected in system_settings before deleting.
  // For now, we allow deletion.
  const { id } = req.params;
  try {
    // decodeURIcomponent in case ID has slashes (e.g. openrouter/gpt-4)
    const decodedId = decodeURIComponent(id);
    await query('DELETE FROM ai_models WHERE id = $1', [decodedId]);
    res.send({ message: "Model deleted." });
  } catch (error) {
    console.error("Error deleting model:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

export default router;