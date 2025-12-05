// backend/src/routes/reports.routes.ts
import { Router, Request } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/auth.middleware';
import { query } from '../services/db';
import { aiGenerationQueue, fileIngestionQueue } from '../services/queue';
import { uploadToGCS } from '../services/storage';
import { generateReportDocx } from '../services/document-service';
import multer from 'multer';
import crypto from 'crypto';
const officeParser = require('officeparser');

// Configure multer to store files in memory as buffers
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper for matching (same as in ai-phase2-service.ts)
const normalizeKb = (str: string) => {
  return str.replace(/^(kb|key\s*behavior)?[\d\w\.\-\s]+/i, '').trim().toLowerCase();
};

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

const router = Router();

// Helper
const calculateHash = (buffer: Buffer): string => {
  return crypto.createHash('md5').update(buffer).digest('hex');
};

/**
 * (FR-AI-001) Create a new Report
 * This endpoint creates the report record in the database.
 * The file uploads will be handled by a separate endpoint.
 */
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { title, projectId, targetLevels, specificContext } = req.body;
  const creatorId = req.user?.userId;

  if (!title || !projectId) return res.status(400).send({ message: "Missing fields." });

  try {
    // VALIDATION: Unique Title in Project
    const dupCheck = await query(
      `SELECT id FROM reports 
       WHERE lower(title) = lower($1) 
         AND project_id = $2 
         AND is_archived = false`,
      [title, projectId]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).send({ message: "An active report with this title already exists in this project." });
    }

    const result = await query(
        `INSERT INTO reports (title, project_id, creator_id, target_levels, specific_context, status)
        VALUES ($1, $2, $3, $4, $5, 'CREATED')
        RETURNING id`,
        [title, projectId, creatorId, JSON.stringify(targetLevels), specificContext]
    );

    res.status(201).json({
      message: "Report record created.",
      reportId: result.rows[0].id
    });

  } catch (error: any) {
    if (error.code === '23505') {
        return res.status(409).send({ message: "Report title must be unique in this project." });
    }
    console.error("Error creating report:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (NR-6.2) Upload assessment result files for a new report
 */
router.post('/:id/upload', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  const { simulationMethod } = req.body;
  const file = req.file;
  const userId = req.user?.userId;

  if (!file || !simulationMethod) return res.status(400).send({ message: 'File or method missing.' });

  try {
    // 1. Hash Check
    const fileHash = calculateHash(file.buffer);
    const dupCheck = await query(
      "SELECT id FROM report_files WHERE report_id = $1 AND file_hash = $2",
      [reportId, fileHash]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).send({ message: "This exact file has already been uploaded to this report." });
    }

    // 2. GCS Upload
    const gcsPath = await uploadToGCS(file.buffer, file.originalname, `reports/${reportId}/evidence`);

    // 3. Save DB (Metadata Only - No file_content)
    const dbResult = await query(
      `INSERT INTO report_files (report_id, file_name, gcs_path, simulation_method_tag, file_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [reportId, file.originalname, gcsPath, simulationMethod, fileHash]
    );
    
    const newFileId = dbResult.rows[0].id;

    // 4. Queue for Ingestion (Chunking + Embedding)
    await fileIngestionQueue.add('process-report-file', {
        fileId: newFileId,
        gcsPath: gcsPath,
        reportId: reportId,
        userId: userId
    });
    console.log(`[Upload] Queued report file ${newFileId} for embedding.`);

    res.status(200).send({ message: 'File uploaded and processing started.', filename: file.originalname });

  } catch (error) {
    console.error('Report upload failed', error);
    res.status(500).send({ message: 'Internal server error.' });
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

/**
 * (RD-5.6) Permanently Delete a Report
 * Restriction: Admin Only, and Report must be Archived.
 */
router.delete('/:id', authenticateToken, authorizeRole('Admin'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    // 1. Safety Check
    const check = await query('SELECT is_archived FROM reports WHERE id = $1', [id]);
    
    if (check.rows.length === 0) {
      return res.status(404).send({ message: "Report not found." });
    }
    
    if (!check.rows[0].is_archived) {
      return res.status(400).send({ message: "Cannot delete an active report. Archive it first." });
    }

    // 2. Perform Delete
    await query('DELETE FROM reports WHERE id = $1', [id]);
    
    res.send({ message: "Report permanently deleted." });

  } catch (error) {
    console.error("Error deleting report:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// (RP-7.1, RP-7.4, RP-7.12, RP-7.14) Get ALL data for a report
router.get('/:id/data', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  const userId = req.user?.userId;
  const userRole = req.user?.role;

  try {
    // 1. Get Report Details
    const reportResult = await query(
      `SELECT 
         r.title, r.status, r.creator_id, r.project_id, r.target_levels,
         r.specific_context, r.is_archived,
         p.creator_id as project_creator_id, p.dictionary_id,
         p.enable_analysis, p.enable_summary
       FROM reports r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).send({ message: 'Report not found' });
    }

    const report = reportResult.rows[0];

    // Auth Check
    if (report.creator_id !== userId && report.project_creator_id !== userId && userRole !== 'Admin') {
      return res.status(403).send({ message: 'Forbidden.' });
    }

    // 2. Calculate Target Phase
    let targetPhase = 1;
    if (report.enable_analysis) targetPhase = 2;
    if (report.enable_summary) targetPhase = 3;

    // 3. Get Dictionary
    let dictionary = null;
    if (report.dictionary_id) {
      const dictResult = await query('SELECT content FROM competency_dictionaries WHERE id = $1', [report.dictionary_id]);
      if (dictResult.rows.length > 0) dictionary = dictResult.rows[0].content;
    }

    // 4. Fetch Evidence
    const evidenceResult = await query(
      `SELECT * FROM evidence WHERE report_id = $1 AND is_archived = false ORDER BY competency, level, created_at`,
      [reportId]
    );

    // 5. Fetch Files (UPDATED)
    // We select 'extracted_text' as 'file_content' directly
    const filesResult = await query(
      `SELECT id, file_name, simulation_method_tag, extracted_text as file_content 
       FROM report_files 
       WHERE report_id = $1
       ORDER BY created_at ASC`, // Keep consistent order
      [reportId]
    );

    const rawFiles = filesResult.rows.map(f => ({
        ...f,
        // Fallback if text hasn't been processed yet
        file_content: f.file_content || "(Processing text... please refresh in a moment)"
    }));

    // 6. Fetch Analysis & Summary
    const analysisResult = await query(
      `SELECT * FROM competency_analysis WHERE report_id = $1 ORDER BY competency`,
      [reportId]
    );

    const summaryResult = await query(
      `SELECT * FROM executive_summary WHERE report_id = $1`,
      [reportId]
    );

    // Determine Phase
    let currentPhase = 1;
    if (summaryResult.rows.length > 0) currentPhase = 3;
    else if (analysisResult.rows.length > 0) currentPhase = 2;

    res.status(200).json({
      title: report.title,
      status: report.status,
      projectId: report.project_id,
      targetLevels: report.target_levels,
      specificContext: report.specific_context,
      isArchived: report.is_archived,
      currentPhase,
      targetPhase,
      creatorId: report.creator_id,
      evidence: evidenceResult.rows,
      rawFiles: rawFiles, // Now contains the reconstructed text!
      competencyAnalysis: analysisResult.rows,
      executiveSummary: summaryResult.rows[0] || null,
      dictionary
    });

  } catch (error) {
    console.error(`Error fetching report data:`, error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (RP-7.7) Create a new Evidence Card
 */
router.post('/evidence', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { reportId, competency, level, kb, quote, source, reasoning } = req.body;
  const userId = req.user?.userId;

  try {
    // TODO: Add permission check: is user the report creator?

    const result = await query(
      `INSERT INTO evidence (report_id, competency, level, kb, quote, source, reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`, // Return the new card
      [reportId, competency, level, kb, quote, source, reasoning]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error(`Error creating evidence for report ${reportId}:`, error);
    res.status(500).send({ message: 'Internal server error' });
  }
});


/**
 * (RP-7.8) Update an existing Evidence Card
 */
router.put('/evidence/:evidenceId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { evidenceId } = req.params;
  const { competency, level, kb, quote, source, reasoning } = req.body;
  const userId = req.user?.userId;

  try {
    // TODO: Add permission check: is user the report creator?

    const result = await query(
      `UPDATE evidence
       SET 
         competency = $1, 
         level = $2, 
         kb = $3, 
         quote = $4, 
         source = $5, 
         reasoning = $6,
         last_edited_at = NOW()
       WHERE id = $7
       RETURNING *`, // Return the updated card
      [competency, level, kb, quote, source, reasoning, evidenceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send({ message: 'Evidence not found' });
    }

    res.status(200).json(result.rows[0]);

  } catch (error) {
    console.error(`Error updating evidence ${evidenceId}:`, error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (RP-7.9) Delete (Archive) an Evidence Card
 */
router.delete('/evidence/:evidenceId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { evidenceId } = req.params;
  const userId = req.user?.userId;

  try {
    // 1. Check if the user has permission to edit this evidence.
    // We join through the report to get the creator.
    const evidenceResult = await query(
      `SELECT r.creator_id
       FROM evidence e
       JOIN reports r ON e.report_id = r.id
       WHERE e.id = $1`,
      [evidenceId]
    );

    if (evidenceResult.rows.length === 0) {
      return res.status(404).send({ message: 'Evidence not found' });
    }

    // (RP-7.17) Only the report creator can edit (for now)
    // TODO: Add Admin/Project Creator logic later
    if (evidenceResult.rows[0].creator_id !== userId) {
      return res.status(403).send({ message: 'You are not authorized to edit this report.' });
    }

    // 2. Set the 'is_archived' flag to true
    await query(
      'UPDATE evidence SET is_archived = true WHERE id = $1',
      [evidenceId]
    );

    res.status(200).send({ message: 'Evidence deleted successfully.' });

  } catch (error) {
    console.error(`Error deleting evidence ${evidenceId}:`, error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

/**
 * (New) Trigger Phase 1 Generation Manually
 */
router.post('/:id/generate/phase1', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  const userId = req.user?.userId;

  try {
    // 1. SAFETY CHECK: Look for zombie jobs
    const currentRes = await query("SELECT active_job_id FROM reports WHERE id = $1", [reportId]);
    const previousJobId = currentRes.rows[0]?.active_job_id;

    if (previousJobId) {
      console.log(`[API] Found existing job ${previousJobId} for report ${reportId}. Attempting cleanup...`);
      try {
        // Try to find the job in the queue
        const oldJob = await aiGenerationQueue.getJob(previousJobId);
        if (oldJob) {
          // Attempt to remove it (works if waiting/delayed/failed)
          // If it's 'active', this might throw or fail, which is fine (the DB check will kill it)
          await oldJob.remove(); 
          console.log(`[API] Successfully removed stale job ${previousJobId} from queue.`);
        }
      } catch (err) {
        console.warn(`[API] Could not remove old job (it might be already gone or locked):`, err);
      }

      // Explicitly invalidate in DB (The "Double Tap")
      await query("UPDATE reports SET active_job_id = NULL WHERE id = $1", [reportId]);
    }

    // 2. Add job to queue to get ID
    const job = await aiGenerationQueue.add('generate-phase-1', {
      reportId,
      userId
    }, {
      // Retry Configuration
      attempts: 6,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false
    });

    if (!job || !job.id) throw new Error("Failed to create job");

    // 3. Update DB with Status AND the specific Job ID
    await query(
      "UPDATE reports SET status = 'PROCESSING', active_job_id = $1 WHERE id = $2", 
      [job.id, reportId]
    );

    res.status(200).send({ message: "Phase 1 generation started." });
  } catch (error) {
    console.error("Failed to start Phase 1:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (RP-7.11) Trigger Phase 2 Generation
 */
router.post('/:id/generate/phase2', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  const userId = req.user?.userId;

  try {
    const check = await query(
      'SELECT 1 FROM evidence WHERE report_id = $1 AND is_archived = false LIMIT 1',
      [reportId]
    );

    if ((check.rowCount || 0) === 0) {
      return res.status(400).send({ message: "Cannot generate analysis: No evidence collected yet." })
    }

    // SAFETY CHECK: Look for zombie jobs (The Defense-in-Depth Pattern)
    const currentRes = await query("SELECT active_job_id FROM reports WHERE id = $1", [reportId]);
    const previousJobId = currentRes.rows[0]?.active_job_id;

    if (previousJobId) {
      console.log(`[API] Found existing Phase 2 job ${previousJobId} for report ${reportId}. Attempting cleanup...`);
      try {
        const oldJob = await aiGenerationQueue.getJob(previousJobId);
        if (oldJob) {
          await oldJob.remove();
          console.log(`[API] Successfully removed stale job ${previousJobId} from queue.`);
        }
      } catch (err) {
        console.warn(`[API] Could not remove old job:`, err);
      }
      // Invalidate DB to kill running worker
      await query("UPDATE reports SET active_job_id = NULL WHERE id = $1", [reportId]);
    }

    // Add job to queue
    const job = await aiGenerationQueue.add('generate-phase-2', {
      reportId,
      userId
    }, {
      attempts: 6,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false
    });

    if (!job || !job.id) throw new Error("Failed to create job");

    // Authorize new job
    await query(
      "UPDATE reports SET status = 'PROCESSING', active_job_id = $1 WHERE id = $2", 
      [job.id, reportId]
    );

    res.status(200).send({ message: "Phase 2 generation started." });
  } catch (error) {
    console.error("Failed to start Phase 2:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// While we are here, let's add the GET route to fetch this data later
router.get('/:id/analysis', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  try {
    const result = await query(
      `SELECT * FROM competency_analysis WHERE report_id = $1 ORDER BY competency`,
      [reportId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching analysis:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (RP-7.14) Trigger Phase 3 Generation
 */
router.post('/:id/generate/phase3', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  const userId = req.user?.userId;

  try {
    // Validation: Ensure Phase 2 is done (optional but good practice)
    const check = await query('SELECT 1 FROM competency_analysis WHERE report_id = $1 LIMIT 1', [reportId]);
    if ((check.rowCount || 0) === 0) {
        return res.status(400).send({ message: "Cannot generate summary: Competency analysis (Phase 2) is missing." });
    }

    // SAFETY CHECK: Look for zombie jobs
    const currentRes = await query("SELECT active_job_id FROM reports WHERE id = $1", [reportId]);
    const previousJobId = currentRes.rows[0]?.active_job_id;

    if (previousJobId) {
      console.log(`[API] Found existing Phase 3 job ${previousJobId} for report ${reportId}. Attempting cleanup...`);
      try {
        const oldJob = await aiGenerationQueue.getJob(previousJobId);
        if (oldJob) {
          await oldJob.remove();
          console.log(`[API] Successfully removed stale job ${previousJobId} from queue.`);
        }
      } catch (err) {
        console.warn(`[API] Could not remove old job:`, err);
      }
      await query("UPDATE reports SET active_job_id = NULL WHERE id = $1", [reportId]);
    }

    // Add new job to queue
    const job = await aiGenerationQueue.add('generate-phase-3', {
      reportId,
      userId
    }, {
      attempts: 6,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false
    });

    if (!job || !job.id) throw new Error("Failed to create job");

    // Authorize new job
    await query(
      "UPDATE reports SET status = 'PROCESSING', active_job_id = $1 WHERE id = $2", 
      [job.id, reportId]
    );

    res.status(200).send({ message: "Phase 3 generation started." });
  } catch (error) {
    console.error("Failed to start Phase 3:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (RP-7.14) Get Executive Summary
 */
router.get('/:id/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  try {
    const result = await query(
      `SELECT * FROM executive_summary WHERE report_id = $1`,
      [reportId]
    );
    // Return the single object or null
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (RP-7.13) Ask AI / Refine Text
 */
router.post('/:id/refine', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { prompt, currentText, context } = req.body;

  try {
    // Mock AI Delay
    await new Promise(r => setTimeout(r, 2000));

    // Mock Logic: Just append something to show it worked
    const refinedText = `${currentText}\n\n[AI Refined based on: "${prompt}"]`;

    res.json({
      refinedText,
      reasoning: "I have updated the text to address your request for clarity."
    });
  } catch (error) {
    console.error("Ask AI failed:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// (RP-7.17) Save Report Content (Analysis & Summary)
router.put('/:id/content', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  const { title, competencyAnalysis, executiveSummary } = req.body;

  const client = await query('BEGIN');

  try {
    // Update Report Title (if provided)
    if (title) {
      await query('UPDATE reports SET title = $1 WHERE id = $2', [title, reportId]);
    }

    // Save Analysis
    if (competencyAnalysis && Array.isArray(competencyAnalysis)) {
      for (const item of competencyAnalysis) {
        if (item.id) {
          const levelAchieved = item.levelAchieved || item.level_achieved;
          const explanation = item.explanation;
          const devRecs = item.developmentRecommendations || item.development_recommendations;
          
          const kbData = item.keyBehaviors || item.key_behaviors_status || [];
          const kbJson = JSON.stringify(kbData);

          await query(
            `UPDATE competency_analysis 
             SET level_achieved = $1, explanation = $2, development_recommendations = $3, key_behaviors_status = $4, updated_at = NOW()
             WHERE id = $5 AND report_id = $6`,
            [
                levelAchieved, // $1
                explanation,   // $2
                devRecs,       // $3
                kbJson,        // $4
                item.id,       // $5
                reportId       // $6
            ]
          );
        }
      }
    }

    // Save Summary
    if (executiveSummary) {
      const check = await query('SELECT id FROM executive_summary WHERE report_id = $1', [reportId]);

      // CHECK: Does the incoming data actually have content?
      const hasContent = 
        (executiveSummary.strengths && executiveSummary.strengths.trim().length > 0) || 
        (executiveSummary.areas_for_improvement && executiveSummary.areas_for_improvement.trim().length > 0) || 
        (executiveSummary.recommendations && executiveSummary.recommendations.trim().length > 0);

      if (check.rows.length > 0) {
        await query(
          `UPDATE executive_summary 
           SET strengths = $1, areas_for_improvement = $2, recommendations = $3, updated_at = NOW()
           WHERE report_id = $4`,
          [executiveSummary.strengths, executiveSummary.areas_for_improvement, executiveSummary.recommendations, reportId]
        );
      } else if (hasContent) {
         await query(
          `INSERT INTO executive_summary (report_id, strengths, areas_for_improvement, recommendations)
           VALUES ($1, $2, $3, $4)`,
          [reportId, executiveSummary.strengths, executiveSummary.areas_for_improvement, executiveSummary.recommendations]
        );
      }
    }

    await query('COMMIT');
    res.status(200).send({ message: "Report content saved successfully." });

  } catch (error) {
    await query('ROLLBACK');
    console.error("Error saving report:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// --- (RP-7.18) Export Report ---
router.get('/:id/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  try {
    const { buffer, filename } = await generateReportDocx(reportId);
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);

  } catch (error: any) {
    console.error("Export failed:", error);
    // Send friendly error if validation failed
    if (error.message.includes("Cannot export")) {
        return res.status(400).send({ message: error.message });
    }
    res.status(500).send({ message: "Internal server error during export." });
  }
});

/**
 * (Maintenance) Reset Report Status
 * Useful if a job gets stuck in PROCESSING due to a crash.
 */
router.post('/:id/reset-status', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;
  try {
    await query(
      "UPDATE reports SET status = 'FAILED', active_job_id = NULL WHERE id = $1",
      [reportId]
    );
    res.status(200).send({ message: "Report status reset to FAILED." });
  } catch (error) {
    console.error("Error resetting status:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

/**
 * (MAINTENANCE) Repair/Hydrate Phase 2 Evidence
 * Matches existing Phase 1 evidence to Phase 2 analysis cards without using AI.
 */
router.post('/:id/repair-evidence', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id: reportId } = req.params;

  try {
    // 1. Fetch all Evidence for this report
    const evidenceRes = await query(
      `SELECT kb, quote, source, competency 
       FROM evidence 
       WHERE report_id = $1 AND is_archived = false`,
      [reportId]
    );
    const allEvidence = evidenceRes.rows;

    // 2. Fetch all Competency Analysis records
    const analysisRes = await query(
      `SELECT id, competency, key_behaviors_status 
       FROM competency_analysis 
       WHERE report_id = $1`,
      [reportId]
    );
    
    let updatedCount = 0;

    // 3. Iterate and Inject
    for (const row of analysisRes.rows) {
      let keyBehaviors = row.key_behaviors_status;
      
      // Handle case where it might be a string (depending on pg driver config)
      if (typeof keyBehaviors === 'string') {
        keyBehaviors = JSON.parse(keyBehaviors);
      }

      if (!Array.isArray(keyBehaviors)) continue;

      let hasChanges = false;

      // Filter evidence for THIS competency only to reduce noise
      const compEvidence = allEvidence.filter(e => 
        e.competency.toLowerCase() === row.competency.toLowerCase()
      );

      const updatedKbs = keyBehaviors.map((kbItem: any) => {
        // If evidence is already there, skip (or overwrite if you prefer)
        if (kbItem.evidence && kbItem.evidence.length > 0) return kbItem;

        const kbTextNormalized = normalizeKb(kbItem.kbText || "");

        // FIND MATCHES
        const matches = compEvidence.filter(ev => {
            const evKbNormalized = normalizeKb(ev.kb);
            // Fuzzy check: Exact match OR containment
            return evKbNormalized === kbTextNormalized || 
                   (kbTextNormalized.length > 10 && evKbNormalized.includes(kbTextNormalized)) ||
                   (evKbNormalized.length > 10 && kbTextNormalized.includes(evKbNormalized));
        }).map(ev => ({
            quote: ev.quote,
            source: ev.source
        }));

        if (matches.length > 0) {
            hasChanges = true;
            return { ...kbItem, evidence: matches };
        }
        return kbItem;
      });

      // 4. Save back if changed
      if (hasChanges) {
        await query(
          `UPDATE competency_analysis 
           SET key_behaviors_status = $1 
           WHERE id = $2`,
          [JSON.stringify(updatedKbs), row.id]
        );
        updatedCount++;
      }
    }

    res.json({ 
        message: `Repaired evidence for ${updatedCount} competency cards.`, 
        totalMatches: allEvidence.length 
    });

  } catch (error) {
    console.error("Repair failed:", error);
    res.status(500).send({ message: "Internal server error during repair." });
  }
});

export default router;