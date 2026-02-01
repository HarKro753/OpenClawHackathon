import type OpenAI from "openai";
import { browserAct, browserNavigate, browserSnapshot } from "./browser.js";
import { googleTools } from "./integrations/google-tools.js";
import { notionTools } from "./integrations/notion-tools.js";
import { getLinkedInCookies } from "./integrations/index.js";

// ============================================================================
// Tool Definitions
// ============================================================================

export interface ToolDefinition {
  name: string;
  tool: OpenAI.Chat.ChatCompletionTool;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// ============================================================================
// Bash Command Tool
// ============================================================================

async function executeBashCommand(command: string): Promise<ToolResult> {
  try {
    const linkedin = getLinkedInCookies();
    const proc = Bun.spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        LINKEDIN_LI_AT: linkedin.liAt ?? "",
        LINKEDIN_JSESSIONID: linkedin.jsessionId ?? "",
      },
    });

    const stdout = await new Response(proc.stdout).text();

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

const bashCommandTool: ToolDefinition = {
  name: "run_bash_command",
  tool: {
    type: "function",
    function: {
      name: "run_bash_command",
      description: "Execute a bash command.",
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
  execute: async (args) => {
    const command = args.command as string;
    return executeBashCommand(command);
  },
};

// ==========================================================================
// Browser Automation Tool (Brave via Playwright)
// ==========================================================================

const browserTool: ToolDefinition = {
  name: "browser",
  tool: {
    type: "function",
    function: {
      name: "browser",
      description:
        "Control a Brave browser session for automation (navigate, snapshot, act).",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action to perform: navigate, snapshot, act",
          },
          targetUrl: {
            type: "string",
            description: "URL to navigate to when action=navigate",
          },
          kind: {
            type: "string",
            description: "Action kind when action=act: click, type, wait",
          },
          selector: {
            type: "string",
            description: "CSS/Playwright selector for act",
          },
          text: {
            type: "string",
            description: "Visible text for act",
          },
          input: {
            type: "string",
            description: "Text input for type",
          },
          timeMs: {
            type: "number",
            description: "Time to wait for wait action",
          },
          submit: {
            type: "boolean",
            description: "Press Enter after type",
          },
        },
        required: ["action"],
      },
    },
  },
  execute: async (args) => {
    try {
      const action = String(args.action || "").trim();
      console.log(`[Browser Tool] Action: ${action}, Args:`, args);

      if (action === "navigate") {
        const targetUrl = String(args.targetUrl || "").trim();
        if (!targetUrl) {
          console.error("[Browser Tool] Navigate called without targetUrl");
          return {
            success: false,
            output: "",
            error: "targetUrl is required for navigate",
          };
        }

        console.log(
          `[Browser Tool] Calling browserNavigate with URL: ${targetUrl}`,
        );
        const result = await browserNavigate(targetUrl);
        console.log(`[Browser Tool] Navigate result:`, result);

        return { success: true, output: JSON.stringify(result, null, 2) };
      }

      if (action === "snapshot") {
        const result = await browserSnapshot();
        return { success: true, output: JSON.stringify(result, null, 2) };
      }

      if (action === "act") {
        const kind = String(args.kind || "").trim() as
          | "click"
          | "type"
          | "wait";
        if (!kind) {
          return {
            success: false,
            output: "",
            error: "kind is required for act",
          };
        }
        const result = await browserAct({
          kind,
          selector:
            typeof args.selector === "string" ? args.selector : undefined,
          text: typeof args.text === "string" ? args.text : undefined,
          input: typeof args.input === "string" ? args.input : undefined,
          timeMs: typeof args.timeMs === "number" ? args.timeMs : undefined,
          submit: typeof args.submit === "boolean" ? args.submit : undefined,
        });
        return { success: true, output: JSON.stringify(result, null, 2) };
      }

      return {
        success: false,
        output: "",
        error: `Unsupported action: ${action}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Browser action failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

const toolRegistry: Map<string, ToolDefinition> = new Map();

// Register core tools
toolRegistry.set(bashCommandTool.name, bashCommandTool);
toolRegistry.set(browserTool.name, browserTool);

// Register all Google tools
for (const tool of googleTools) {
  toolRegistry.set(tool.name, tool);
}

// Register all Notion tools
for (const tool of notionTools) {
  toolRegistry.set(tool.name, tool);
}

export function getToolDefinitions(): OpenAI.Chat.ChatCompletionTool[] {
  return Array.from(toolRegistry.values()).map((t) => t.tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = toolRegistry.get(name);
  if (!tool) {
    return {
      success: false,
      output: "",
      error: `Unknown tool: ${name}`,
    };
  }
  return tool.execute(args);
}

export function formatToolResult(result: ToolResult): string {
  if (result.success) {
    return result.output;
  }
  return `Error: ${result.error}\n${result.output}`.trim();
}
