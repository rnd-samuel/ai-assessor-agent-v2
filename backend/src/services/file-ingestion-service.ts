// backend/src/services/file-ingestion-service.ts
import { pool } from './db';
import { downloadBufferFromGCS } from './storage';
import { OpenAIEmbedding } from '@llamaindex/openai'; 
import { Settings, Document } from 'llamaindex';
import { publishEvent } from './redis-publisher';
const officeParser = require('officeparser');

// TEXT EXTRACTION (Considers "Awkward Spaces")
async function extractText(buffer: Buffer, filename: string): Promise<string> {
    try {
        let text = await officeParser.parseOfficeAsync(buffer);
        
        if (typeof text !== 'string') {
             text = buffer.toString('utf-8');
        }

        // Basic cleanup
        text = text.replace(/\r\n/g, '\n');
        
        // Merge lines that shouldn't be broken (e.g. "We aim to\ndeliver" -> "We aim to deliver")
        // Heuristic: Newline preceded by non-punctuation & followed by lowercase/number
        text = text.replace(/([^\.\:\n])\n(?=[a-z0-9])/g, '$1 ');

        // Collapse multiple spaces/tabs
        text = text.replace(/[ \t]+/g, ' ');

        // Ensure nice paragraph spacing (max 2 newlines)
        text = text.replace(/\n{3,}/g, '\n\n');

        return text.trim();

    } catch (e) {
        console.warn(`[Ingestion] Office parser failed for ${filename}, falling back to utf-8 string.`);
        return buffer.toString('utf-8');
    }
}

// 2. CORE LOGIC (Chunk, Embed, Save, Notify)
async function embedAndSave(
    fileId: string, 
    text: string, 
    targetColumn: 'report_file_id' | 'project_file_id' | 'global_file_id',
    userId?: string // userId for notifications
) {
    // Initialize Model (1536 dims for text-embedding-3-small)
    const embedModel = new OpenAIEmbedding({
        apiKey: process.env.OPENROUTER_API_KEY,
        model: "text-embedding-3-small", 
        additionalSessionOptions: { baseURL: "https://openrouter.ai/api/v1" }
    });

    // Chunking
    const document = new Document({ text: text, id_: fileId });
    const splitter = Settings.nodeParser; 
    const nodes = await splitter.getNodesFromDocuments([document]);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // A. Save CLEAN TEXT to the parent table (Dynamic Table Selection)
        let tableName = '';
        if (targetColumn === 'report_file_id') tableName = 'report_files';
        else if (targetColumn === 'project_file_id') tableName = 'project_files';
        else if (targetColumn === 'global_file_id') tableName = 'global_simulation_files';

        if (tableName) {
          await client.query(`UPDATE ${tableName} SET extracted_text = $1 WHERE id = $2`, [text, fileId]);
        }

        // B. Clear old chunks
        await client.query(`DELETE FROM document_chunks WHERE ${targetColumn} = $1`, [fileId]);
        
        // C. Save Embeddings
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const content = node.getContent();
            const embedding = await embedModel.getTextEmbedding(content);
            
            await client.query(
                `INSERT INTO document_chunks (${targetColumn}, chunk_index, chunk_content, embedding)
                 VALUES ($1, $2, $3, $4)`,
                [fileId, i, content, JSON.stringify(embedding)]
            );
        }

        await client.query('COMMIT');
        console.log(`[Ingestion] Successfully processed file ${fileId} into ${tableName}`);

        // D. NOTIFY FRONTEND (Auto-Refresh)
        if (userId) {
            await publishEvent(userId, 'file-processed', { fileId, type: targetColumn });
        }

    } catch (dbErr) {
        await client.query('ROLLBACK');
        throw dbErr;
    } finally {
        client.release();
    }
}

// --- JOB HANDLERS (Fixed Arguments) ---

export async function processProjectFile(jobData: any) {
    const { fileId, gcsPath, userId } = jobData;
    console.log(`[Ingestion] Processing Project File: ${fileId}`);
    
    const buffer = await downloadBufferFromGCS(gcsPath);
    const text = await extractText(buffer, gcsPath);
    if (!text) return;

    // Fixed call: passing all 4 arguments
    await embedAndSave(fileId, text, 'project_file_id', userId);
}

export async function processReportFile(jobData: any) {
    const { fileId, gcsPath, userId } = jobData;
    console.log(`[Ingestion] Processing Report File: ${fileId}`);
    
    const buffer = await downloadBufferFromGCS(gcsPath);
    const text = await extractText(buffer, gcsPath);
    if (!text) return;

    // Fixed call: passing all 4 arguments
    await embedAndSave(fileId, text, 'report_file_id', userId);
}