// backend/src/services/ai-context-service.ts
import { OpenAI } from 'openai';
import { downloadBufferFromGCS } from './storage';
import path from 'path';
const officeParser = require('officeparser');

// We use a separate instance or reuse the configuration. 
// Since this is a background task, standard OpenAI instantiation is fine.
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { 
    "HTTP-Referer": "https://ai-assessor-agent.com", 
    "X-Title": "AI Assessor Agent" 
  }
});

// Helper: Extract Text (Reused logic, but kept simple here)
async function extractText(gcsPath: string): Promise<string> {
    try {
        const buffer = await downloadBufferFromGCS(gcsPath);
        const ext = path.extname(gcsPath).toLowerCase();

        console.log(`[Context] Extracting text from ${gcsPath} (${ext})...`);

        // 1. Text Files (Simple String)
        if (['.txt', '.md', '.csv', '.json', '.xml'].includes(ext)) {
            return buffer.toString('utf-8');
        }

        // 2. Office Documents AND PDFs
        // We add .pdf here so officeparser attempts to process it.
        if (['.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods', '.pdf'].includes(ext)) {
            return await officeParser.parseOfficeAsync(buffer);
        }

        // Fallback for unknown binary types
        // We try officeparser anyway as a hail mary, or just stringify
        try {
            return await officeParser.parseOfficeAsync(buffer);
        } catch (e) {
            console.warn(`[Context] OfficeParser failed for ${ext}, falling back to utf-8.`);
            return buffer.toString('utf-8');
        }

    } catch (e) {
        console.warn(`[Context Service] Failed to extract text from ${gcsPath}:`, e);
        return "";
    }
}

/**
 * Generates or Updates the Master Assessor Guide (Global or Project scope).
 * It reads the *existing* guide and the *new* file, and synthesizes them.
 */
export async function generateKnowledgeContext(
    currentContext: string | null, 
    newFileGcsPath: string,
    scope: 'GLOBAL' | 'PROJECT'
): Promise<string> {
    console.log(`[Context] Generating ${scope} context from file: ${newFileGcsPath}`);
    
    const newFileContent = await extractText(newFileGcsPath);
    
    if (!newFileContent) return currentContext || "";

    const systemPrompt = `
You are an experienced Senior Industrial & Organizational Psychologist and Assessment Center Assessor.
Your goal is to maintain a "Master Assessor Guide" for ${scope} analysis. 
This guide is used to instruct other AIs on how to interpret candidate behaviors accurately and consistently according to organizational standards.
`;

    const userPrompt = `
I will provide you with the CURRENT GUIDE (if any) and content from a NEW FILE.
Your task is to SYNTHESIZE them into a single, cohesive, updated Assessor Guide.

RULES:
1. **Integrate, Don't Append:** Do not just add the new text at the bottom. Weave the new concepts into the relevant sections of the guide.
2. **Preserve Specifics:** Keep specific behavioral indicators, anti-behaviors, and cultural nuances verbatim. Do not summarize them into generic statements.
3. **Structure:** Use Markdown headers (e.g., ## Core Values, ## Assessment Guidelines, ## Do's and Don'ts).
4. **Focus:** Remove administrative fluff (e.g., page numbers, table of contents). Keep only high-signal assessment criteria.

--- CURRENT GUIDE ---
${currentContext || "(Empty - This is the first file)"}

--- NEW FILE CONTENT ---
${newFileContent.slice(0, 100000)} 
`; 
// Note: Gemini 1.5 Flash has a 1M token window, so 100k chars is very safe.

    const response = await openai.chat.completions.create({
        model: "google/gemini-2.5-pro",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.3 // Low temp for consistency
    });

    return response.choices[0].message.content || currentContext || "";
}

/**
 * Generates a Guide for a specific Simulation Method (e.g., "Case Study").
 */
export async function generateSimulationContext(
    methodName: string,
    methodDescription: string,
    newFileGcsPath: string
): Promise<string> {
    console.log(`[Context] Generating guide for method: ${methodName}`);
    
    const newFileContent = await extractText(newFileGcsPath);

    const systemPrompt = `
You are an expert Assessment Center Designer. 
You are analyzing a specific simulation exercise (e.g., Roleplay, Case Study) to create a "Scoring Guide" for AI Assessors.
`;

    const userPrompt = `
Simulation Method: ${methodName}
Description: ${methodDescription}

I am providing the raw material for this simulation (e.g., the case study text, roleplay script).
Create a **Context Guide** that tells an AI Assessor what to look for when analyzing a candidate's response to this specific simulation.

INSTRUCTIONS:
1. **Scenario Summary:** Briefly summarize the challenge the candidate faces.
2. **Key Triggers:** Identify specific problems or "traps" hidden in the material that test specific competencies.
3. **Behavioral Indicators:** Explain what a "Good" response looks like vs. a "Bad" response for this specific scenario.

Keep this guide compact and dense.

--- SIMULATION MATERIAL ---
${newFileContent.slice(0, 50000)}
`;

    const response = await openai.chat.completions.create({
        model: "google/gemini-2.5-pro",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.3
    });

    return response.choices[0].message.content || "";
}