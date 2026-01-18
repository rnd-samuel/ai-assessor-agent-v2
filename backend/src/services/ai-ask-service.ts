// backend/src/services/ai-ask-service.ts
import { pool, query } from './db';
import { OpenAI } from 'openai';
import { logAIInteraction } from './ai-log-service';

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: { "HTTP-Referer": "https://ai-assessor-agent.com", "X-Title": "AI Assessor Agent" }
});

interface AskAiRequest {
    reportId: string;
    userId: string;
    projectId: string;
    userInstruction: string;
    currentContent: string;
    contextType: 'PHASE_2' | 'PHASE_3';
    // Context fields for Phase 2
    competencyName?: string;
    competencyLevel?: number;
    competencyDefinition?: string;
    levelDescriptions?: string[];
    // Context fields for Phase 3
    generalContext?: string;
    specificContext?: string;
}

interface AskAiResult {
    success: boolean;
    refinedContent?: string;
    reasoning?: string;
    error?: string;
    aiLogId?: string | null;
}

export async function runAskAi(request: AskAiRequest): Promise<AskAiResult> {
    const startTime = Date.now();

    try {
        // 1. FETCH AI CONFIG
        const settingsRes = await query("SELECT value FROM system_settings WHERE key = 'ai_config'");
        const aiConfig = settingsRes.rows[0]?.value || {};

        if (!aiConfig.askAiEnabled) {
            return { success: false, error: "Ask AI feature is disabled by the administrator." };
        }

        const model = aiConfig.askAiLLM || 'google/gemini-2.5-flash-lite-preview-09-2025';
        const temperature = aiConfig.askAiTemp ?? 0.5;

        // 2. FETCH DEFAULT PROMPTS
        const promptsRes = await query("SELECT value FROM system_settings WHERE key = 'default_prompts'");
        const defaultPrompts = promptsRes.rows[0]?.value || {};
        const systemPrompt = defaultPrompts.askAiSystem ||
            `You are an AI assistant helping refine competency assessment reports. 
       You follow the user's instructions precisely and maintain a professional, psychological tone in Bahasa Indonesia.
       Always provide your reasoning for the changes made.`;

        // 3. BUILD CONTEXT STRING
        let contextString = "";

        if (request.contextType === 'PHASE_2') {
            contextString = `
=== CONTEXT FOR REFINEMENT ===
**Component Type:** Competency Analysis (Phase 2)
**Competency:** ${request.competencyName || 'N/A'}
**Current Level:** ${request.competencyLevel || 'N/A'}
**Competency Definition:** ${request.competencyDefinition || 'N/A'}
**Level Descriptions:**
${(request.levelDescriptions || []).map((desc, i) => `- Level ${i + 1}: ${desc}`).join('\n')}
`;
        } else if (request.contextType === 'PHASE_3') {
            contextString = `
=== CONTEXT FOR REFINEMENT ===
**Component Type:** Executive Summary (Phase 3)
**General Project Context:** ${request.generalContext || 'N/A'}
**Specific Report Context:** ${request.specificContext || 'N/A'}
`;
        }

        // 4. BUILD USER PROMPT
        const userPrompt = `
${contextString}

=== CURRENT CONTENT ===
${request.currentContent}

=== USER INSTRUCTION ===
${request.userInstruction}

=== OUTPUT REQUIREMENT ===
Return a JSON object with:
{
  "refined_content": "<the updated text, following user instructions>",
  "reasoning": "<brief explanation of what you changed and why>"
}
`;

        // 5. CALL AI
        const response = await openai.chat.completions.create({
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: temperature
        });

        const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
        const rawContent = response.choices[0].message.content || "{}";

        // 6. LOG THE INTERACTION
        const aiLogId = await logAIInteraction({
            userId: request.userId,
            reportId: request.reportId,
            projectId: request.projectId,
            action: 'ASK_AI_REFINE',
            model: model,
            prompt: userPrompt,
            response: rawContent,
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            durationMs: Date.now() - startTime,
            status: 'SUCCESS'
        });

        // 7. PARSE AND RETURN
        try {
            const parsed = JSON.parse(rawContent);
            return {
                success: true,
                refinedContent: parsed.refined_content,
                reasoning: parsed.reasoning,
                aiLogId
            };
        } catch (parseError) {
            // If JSON parsing fails, return raw content as refined content
            return {
                success: true,
                refinedContent: rawContent,
                reasoning: "Unable to parse structured response.",
                aiLogId
            };
        }

    } catch (error: any) {
        // Log failure
        await logAIInteraction({
            userId: request.userId,
            reportId: request.reportId,
            projectId: request.projectId,
            action: 'ASK_AI_REFINE',
            model: 'unknown',
            prompt: request.userInstruction,
            response: "",
            durationMs: Date.now() - startTime,
            status: 'FAILED',
            errorMessage: error.message
        });

        return {
            success: false,
            error: error.message || "An error occurred while processing your request."
        };
    }
}
