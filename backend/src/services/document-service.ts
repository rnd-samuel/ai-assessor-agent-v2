// backend/src/services/document-service.ts
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import path from 'path';
import { query } from './db';
import { downloadBufferFromGCS } from './storage';

// Helper to clean keys for docxtemplater (remove special chars, keep spaces if needed or replace them)
// The requirement format is: [Competency]_[Level]_[KB]
// We'll replace spaces with underscores to be safe for all template engines.
const cleanKey = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_');

export const generateReportDocx = async (reportId: string) => {
  // 1. Fetch Report & Project Config
  const reportRes = await query(
    `SELECT 
       r.title, r.project_id, r.target_levels, 
       p.enable_analysis, p.enable_summary,
       cd.content as dictionary_content
     FROM reports r
     JOIN projects p ON r.project_id = p.id
     LEFT JOIN competency_dictionaries cd ON p.dictionary_id = cd.id
     WHERE r.id = $1`, 
    [reportId]
  );
  
  if (reportRes.rows.length === 0) throw new Error("Report not found");
  const report = reportRes.rows[0];
  const dictContent = report.dictionary_content || {};

  // 2. Determine Target Phase
  let targetPhase = 1;
  if (report.enable_analysis) targetPhase = 2;
  if (report.enable_summary) targetPhase = 3;

  // 3. Check if we have enough data (RP-7.18 constraint)
  // We verify this by checking existence of rows in the DB tables
  const summaryRes = await query('SELECT * FROM executive_summary WHERE report_id = $1', [reportId]);
  const analysisRes = await query('SELECT * FROM competency_analysis WHERE report_id = $1', [reportId]);
  
  const hasAnalysis = analysisRes.rows.length > 0;
  const hasSummary = summaryRes.rows.length > 0;

  // Validation: Can't export if we haven't reached the target phase
  if (targetPhase >= 2 && !hasAnalysis) {
      throw new Error("Cannot export: Competency Analysis phase is not complete.");
  }
  if (targetPhase === 3 && !hasSummary) {
      throw new Error("Cannot export: Executive Summary phase is not complete.");
  }

  const summary = summaryRes.rows[0] || {};
  const analyses = analysisRes.rows;

  // 4. Load Template
  // In a real app, you'd fetch the specific template file from project_files via GCS.
  // For MVP, we use the local 'template.docx'.
  let content: Buffer | string | null = null;

  try {
    const fileRes = await query(
      `SELECT gcs_path FROM project_files 
       WHERE project_id = $1 AND file_type = 'template' 
       ORDER BY uploaded_at DESC LIMIT 1`,
      [report.project_id]
    );

    if (fileRes.rows.length > 0) {
      const gcsPath = fileRes.rows[0].gcs_path;
      console.log(`[DocGen] Using project template: ${gcsPath}`);
      content = await downloadBufferFromGCS(gcsPath);
    }
  } catch (error) {
    console.warn("[DocGen] Failed to load project template. Falling back to default.", error);
  }

  if (!content) {
    console.log("[DocGen] Using default local template.");
    const templatePath = path.resolve(__dirname, '../../template.docx');
    if (!fs.existsSync(templatePath)) throw new Error("Default template file not found on server.");
    
    // Read as binary string or buffer (PizZip handles Buffer fine)
    content = fs.readFileSync(templatePath);
  }

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  // 5. Build Data Map
  const dataMap: any = {
    report_title: report.title,
    // RP-7.18 Placeholders
    overall_strength: summary.strengths || "",
    overall_weakness: summary.areas_for_improvement || "",
    overall_development: summary.recommendations || "",
  };

  // 6. Dynamic Competency Mapping
  // Format: {[competency_name]_level}, {[competency_name]_[level]_[kb]_fulfillment}
  for (const item of analyses) {
    const compKey = `[${item.competency}]`; // e.g., "Problem_Solving" -> "Problem_Solving"

    // Standard Fields
    dataMap[`${compKey}_level`] = item.level_achieved;
    dataMap[`${compKey}_explanation`] = item.explanation;
    dataMap[`${compKey}_development`] = item.development_recommendations;

    // Key Behaviors Mapping
    // DB stores JSON: [{ kb: "...", fulfilled: true, level: "3" }, ...]
    const kbList = item.key_behaviors_status || [];
    
    // Group by Level to get the index right (1, 2, 3...)
    const kbsByLevel: Record<string, any[]> = {};
    
    kbList.forEach((kb: any) => {
        const lvl = kb.level; 
        if(!kbsByLevel[lvl]) kbsByLevel[lvl] = [];
        kbsByLevel[lvl].push(kb);
    });

    // Map specific keys
    Object.entries(kbsByLevel).forEach(([level, kbs]) => {
        kbs.forEach((kb, index) => {
            const kbNum = index + 1; // 1-based index
            
            // e.g., Problem_Solving_3_1_fulfillment
            const baseKey = `${compKey}_${level}_${kbNum}`;
            
            dataMap[`${baseKey}_fulfillment`] = kb.fulfilled ? "Yes" : "No";
            dataMap[`${baseKey}_explanation`] = kb.explanation || "";
        });
    });

    // Map "target_level" placeholders
    let compId = item.competency; // Default to name
    if (dictContent.kompetensi) {
        const found = dictContent.kompetensi.find((c: any) => 
            c.name === item.competency || c.namaKompetensi === item.competency
        );
        if (found) {
            compId = found.id || found.namaKompetensi;
        }
    }

    const targetLevels = report.target_levels || {};
    const targetLevelStr = targetLevels[compId];

    if (targetLevelStr && kbsByLevel[targetLevelStr]) {
        kbsByLevel[targetLevelStr].forEach((kb, index) => {
            const kbNum = index + 1;
            // Key format: [Comp]_target_level_1_fulfillment
            const baseKey = `${compKey}_[target_level]_${kbNum}`;
            
            dataMap[`${baseKey}_fulfillment`] = kb.fulfilled ? "Yes" : "No";
            dataMap[`${baseKey}_explanation`] = kb.explanation || "";
        });
    }
  }

  // 7. Render Document
  try {
    doc.render(dataMap);
  } catch (error: any) {
    console.error("Doc Render Error:", error);
    throw error;
  }

  // 8. Generate Output
  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  
  // Filename Format: "DDMMYY - Report - [Report Name].docx"
  const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'').split('').reverse().join(''); // This is harder in JS one-liner
  // Let's do it manually for DDMMYY
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const formattedDate = `${dd}${mm}${yy}`;
  
  const safeTitle = report.title.replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
  const filename = `${formattedDate} - Report - ${safeTitle}.docx`;

  return { buffer: buf, filename };
};

/**
 * Extracts all placeholders (e.g., {name}, {project_id}) from a DOCX buffer.
 * Returns a list of found keys.
 */
export const extractDocxPlaceholders = (buffer: Buffer): string[] => {
  try {
    const zip = new PizZip(buffer);
    
    // Configure docxtemplater
    // We use a custom parser that just returns empty string for everything 
    // because we only want to inspect, not render. But getFullText is easier.
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // getFullText() gets the raw text content of the document
    const text = doc.getFullText();

    // Regex to find patterns like {variable_name}
    // We match opening brace {, anything not a closing brace, then closing brace }
    const regex = /\{[^}]+\}/g;
    const found = text.match(regex);

    if (!found) return [];

    // Clean up the brackets: "{name}" -> "name"
    return found.map(tag => tag.replace(/[{}]/g, ''));

  } catch (error) {
    console.error("Error extracting placeholders:", error);
    // We re-throw so the route handler can send a 400 error
    throw new Error("Failed to parse DOCX template. Ensure it is a valid Word document.");
  }
};