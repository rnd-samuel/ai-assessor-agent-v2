// backend/src/services/document-service.ts
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import path from 'path';
import { query } from './db';

// Helper to clean keys for docxtemplater (remove special chars, keep spaces if needed or replace them)
// The requirement format is: [Competency]_[Level]_[KB]
// We'll replace spaces with underscores to be safe for all template engines.
const cleanKey = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_');

export const generateReportDocx = async (reportId: string) => {
  // 1. Fetch Report & Project Config
  const reportRes = await query(
    `SELECT r.title, r.project_id, p.enable_analysis, p.enable_summary 
     FROM reports r
     JOIN projects p ON r.project_id = p.id
     WHERE r.id = $1`, 
    [reportId]
  );
  
  if (reportRes.rows.length === 0) throw new Error("Report not found");
  const report = reportRes.rows[0];

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
  const templatePath = path.resolve(__dirname, '../../template.docx');
  if (!fs.existsSync(templatePath)) throw new Error("Template file not found on server.");
  
  const content = fs.readFileSync(templatePath, 'binary');
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
    const compKey = cleanKey(item.competency); // e.g., "Problem_Solving" -> "Problem_Solving"

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
  
  const safeTitle = report.title.replace(/[^a-zA-Z0-9 \-_]/g, '');
  const filename = `${formattedDate} - Report - ${safeTitle}.docx`;

  return { buffer: buf, filename };
};