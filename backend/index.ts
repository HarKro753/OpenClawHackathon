import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";

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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const skillsDir = join(import.meta.dir, "..", "skills");
const skillNames = ["gog", "linkedin", "notion"];
const skills: { name: string; content: string }[] = [];

for (const name of skillNames) {
  const skillPath = join(skillsDir, name, "SKILL.md");
  try {
    const content = readFileSync(skillPath, "utf-8");
    skills.push({ name, content });
    console.log(`✅ Loaded skill: ${name}`);
  } catch (error) {
    console.error(`⚠️ Failed to load ${name} skill:`, error);
  }
}

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_bash_command",
      description:
        "Execute a bash command. Use this for:\n" +
        "- gog CLI: Gmail, Calendar, Drive, Contacts, Sheets, Docs operations\n" +
        "- lk CLI: LinkedIn profiles, messages, feed operations\n" +
        "- curl: Notion API calls for pages, databases, and blocks\n" +
        "Environment variables LINKEDIN_LI_AT, LINKEDIN_JSESSIONID, and NOTION_API_KEY are available.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute",
          },
        },
        required: ["command"],
      },
    },
  },
];

const skillDocs = skills
  .map((s) => `## ${s.name.toUpperCase()}\n\n${s.content}`)
  .join("\n\n---\n\n");

const baseSystemPrompt = readFileSync(
  join(import.meta.dir, "system-prompt.txt"),
  "utf-8"
);

const systemPrompt = `${baseSystemPrompt}\n\n# Available Tools Documentation\n\n${skillDocs}`;

async function executeCommand(
  command: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const proc = Bun.spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        LINKEDIN_LI_AT: process.env.LINKEDIN_LI_AT,
        LINKEDIN_JSESSIONID: process.env.LINKEDIN_JSESSIONID,
        NOTION_API_KEY: process.env.NOTION_API_KEY,
      },
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      if (
        stderr.includes("command not found") &&
        (stderr.includes("gog") || command.startsWith("gog "))
      ) {
        return {
          success: false,
          output: "",
          error: `The 'gog' CLI is not installed. Please install it with: brew install steipete/tap/gogcli`,
        };
      }
      if (
        stderr.includes("no credentials") ||
        stderr.includes("not authenticated") ||
        (stderr.includes("token") && command.startsWith("gog "))
      ) {
        return {
          success: false,
          output: "",
          error: `gog authentication required. Please run:\n1. gog auth credentials /path/to/client_secret.json\n2. gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets`,
        };
      }

      if (
        stderr.includes("command not found") &&
        (stderr.includes("lk") || command.startsWith("lk "))
      ) {
        return {
          success: false,
          output: "",
          error: `The 'lk' LinkedIn CLI is not installed. Please install it from: https://github.com/clawdbot/linkedin-cli\nAlso ensure you have: pip install linkedin-api`,
        };
      }
      if (
        (stderr.includes("CHALLENGE") ||
          stderr.includes("login") ||
          stderr.includes("session")) &&
        command.startsWith("lk ")
      ) {
        return {
          success: false,
          output: "",
          error: `LinkedIn authentication issue. Your session cookies may have expired.\nPlease update LINKEDIN_LI_AT and LINKEDIN_JSESSIONID from your browser's DevTools → Application → Cookies → www.linkedin.com`,
        };
      }

      if (
        (stderr.includes("401") || stdout.includes('"status": 401')) &&
        command.includes("notion.com")
      ) {
        return {
          success: false,
          output: "",
          error: `Notion authentication failed. Check your NOTION_API_KEY and ensure:\n1. The API key is correct (starts with 'ntn_' or 'secret_')\n2. The integration has been shared with the target pages/databases`,
        };
      }
      if (
        (stderr.includes("404") || stdout.includes('"status": 404')) &&
        command.includes("notion.com")
      ) {
        return {
          success: false,
          output: "",
          error: `Notion resource not found. Ensure:\n1. The page/database ID is correct\n2. The integration has been connected to the resource (click "..." → "Connect to" → your integration)`,
        };
      }

      return {
        success: false,
        output: stdout,
        error: stderr || `Command exited with code ${exitCode}`,
      };
    }

    return {
      success: true,
      output: stdout || "(no output)",
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

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
          skills: skills.map((s) => s.name),
        }),
        { headers },
      );
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = (await req.json()) as {
        messages: { role: string; content: string }[];
      };
      const { messages } = body;

      // Add system prompt with skill context
      const messagesWithSystem: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...(messages as OpenAI.Chat.ChatCompletionMessageParam[]),
      ];

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: object) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
          };

          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: messagesWithSystem,
              tools,
              tool_choice: "auto",
            });

            const message = response.choices[0]?.message;

            if (message?.tool_calls && message.tool_calls.length > 0) {
              const toolMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                ...messagesWithSystem,
                message,
              ];

              for (const toolCall of message.tool_calls) {
                if (toolCall.function.name === "run_bash_command") {
                  const args = JSON.parse(toolCall.function.arguments);
                  const command = args.command;

                  sendEvent({
                    type: "tool_call",
                    name: "run_bash_command",
                    command,
                  });

                  const result = await executeCommand(command);

                  sendEvent({
                    type: "tool_result",
                    success: result.success,
                    output: result.output,
                    error: result.error,
                  });

                  toolMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: result.success
                      ? result.output
                      : `Error: ${result.error}\n${result.output}`,
                  });
                }
              }

              const finalStream = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: toolMessages,
                stream: true,
              });

              for await (const chunk of finalStream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                  sendEvent({ type: "content", content });
                }
              }
            } else if (message?.content) {
              sendEvent({ type: "content", content: message.content });
            }
          } catch (error) {
            sendEvent({
              type: "error",
              error: error instanceof Error ? error.message : String(error),
            });
          }

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

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers,
    });
  },
});

console.log(`Backend server running at http://localhost:${server.port}`);
console.log(`Loaded skills: ${skills.map((s) => s.name).join(", ")}`);
