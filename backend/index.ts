import OpenAI from "openai";
import { join } from "path";
import { ContextManager } from "./context.js";
import {
  runAgentLoopStreaming,
  type StreamEvent,
  DEFAULT_CONFIG,
} from "./agent-loop.js";

// ============================================================================
// Environment Validation
// ============================================================================

const requiredEnvVars = [
  "OPENAI_API_KEY",
  "LINKEDIN_LI_AT",
  "LINKEDIN_JSESSIONID",
  "NOTION_API_KEY",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(
      `${envVar} environment variable is not set. Check your .env file.`,
    );
  }
}

// ============================================================================
// Initialize Services
// ============================================================================

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const contextManager = new ContextManager({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  skillsDir: join(import.meta.dir, "..", "skills"),
  skillFolders: ["gog", "linkedin", "notion"],
  systemPromptPath: join(import.meta.dir, "system-prompt.txt"),
});

// ============================================================================
// HTTP Server
// ============================================================================

const server = Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          message: "Backend is running!",
          skills: contextManager.getSkillNames(),
        }),
        { headers },
      );
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = (await req.json()) as {
        messages: { role: string; content: string }[];
      };
      const { messages } = body;

      const selectedSkills =
        await contextManager.selectSkillsForMessages(messages);

      const messagesWithContext = contextManager.buildContextMessages(
        selectedSkills,
        messages as OpenAI.Chat.ChatCompletionMessageParam[],
      );

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: StreamEvent) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
          };

          try {
            await runAgentLoopStreaming(
              openai,
              messagesWithContext,
              sendEvent,
              {
                ...DEFAULT_CONFIG,
                model: "gpt-4o-mini",
              },
            );
          } catch (error) {
            sendEvent({
              type: "error",
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Signal completion
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers,
    });
  },
});

// ============================================================================
// Startup Logging
// ============================================================================

console.log(`Backend server running at http://localhost:${server.port}`);
console.log(`Loaded skills: ${contextManager.getSkillNames().join(", ")}`);
console.log(
  `Skill routing enabled: LLM will select relevant skills per request`,
);
console.log(`Agentic loop: max ${DEFAULT_CONFIG.maxIterations} iterations`);
