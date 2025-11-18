// backend/src/routes/admin.routes.ts
import { Router, Request } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';
import { query } from '../services/db';
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
 * (ADM-8.6) Get all Competency Dictionaries
 */
router.get('/dictionaries', async (req: AuthenticatedRequest, res) => {
  try {
    const result = await query(
      'SELECT id, name, created_at FROM competency_dictionaries ORDER BY created_at DESC'
    );
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
      'SELECT id, name, created_at FROM global_simulation_methods ORDER BY name ASC'
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
  const { name } = req.body;
  const creatorId = req.user?.userId;

  if (!name) {
    return res.status(400).send({ message: 'Method name is required.' });
  }

  try {
    const result = await query(
      'INSERT INTO global_simulation_methods (name, created_by) VALUES ($1, $2) RETURNING id, name',
      [name, creatorId]
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
 */
router.post('/simulation-files', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  const { methodId } = req.body;
  const file = req.file;
  const creatorId = req.user?.userId;

  if (!file || !methodId) {
    return res.status(400).send({ message: 'File and Method ID are required.' });
  }

  try {
    // For this MVP, we assume text-based files (txt, markdown) or extractable content
    // We'll just store the raw buffer as a string for now to simulate text extraction.
    // TODO: REFACTOR - Currently stripping null bytes to prevent DB crash.
    // We need to implement real PDF/DOCX text extraction (e.g., pdf-parse) here.
    const fileContent = file.buffer.toString('utf-8').replace(/\0/g, '');

    const result = await query(
      `INSERT INTO global_simulation_files (file_name, file_content, method_id, created_by) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, file_name`,
      [file.originalname, fileContent, methodId, creatorId]
    );

    res.status(201).json(result.rows[0]);
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

export default router;