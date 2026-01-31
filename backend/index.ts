import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

const openai = new OpenAI({ apiKey });

const skillPath = join(import.meta.dir, "..", "skills", "gog", "SKILL.md");
let skillContent = "";
try {
  skillContent = readFileSync(skillPath, "utf-8");
  console.log("✅ Loaded skill: gog");
} catch (error) {
  console.error("⚠️ Failed to load gog skill:", error);
}

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_bash_command",
      description:
        "Execute a bash command. Use this for gog CLI commands to interact with Gmail, Calendar, Drive, Contacts, Sheets, and Docs. The gog CLI is already authenticated.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              "The bash command to execute (e.g., 'gog gmail search \"newer_than:7d\" --max 10')",
          },
        },
        required: ["command"],
      },
    },
  },
];

const systemPrompt = `You are a helpful assistant with access to the gog CLI tool for Google Workspace operations.

Here is the documentation for the gog CLI tool you can use:

${skillContent}

When the user asks to do something with Gmail, Calendar, Drive, Contacts, Sheets, or Docs, use the run_bash_command tool to execute the appropriate gog command.

Important:
- For reading emails, use: gog gmail search 'query' --max N
- For sending emails, always confirm with the user first before executing
- Use --json flag when you need structured data
- If a command fails due to authentication, explain that the user needs to run 'gog auth' commands first`;

// Execute a bash command and return the result
async function executeCommand(
  command: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const proc = Bun.spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      if (
        stderr.includes("command not found") ||
        stderr.includes("gog: not found")
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
        stderr.includes("token")
      ) {
        return {
          success: false,
          output: "",
          error: `Authentication required. Please run:\n1. gog auth credentials /path/to/client_secret.json\n2. gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets`,
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
        JSON.stringify({ status: "ok", message: "Backend is running!" }),
        { headers },
      );
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = (await req.json()) as {
        messages: { role: string; content: string }[];
      };
      const { messages } = body;

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
