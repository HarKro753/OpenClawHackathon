import type OpenAI from "openai";

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
    const proc = Bun.spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        LINKEDIN_LI_AT: process.env.LINKEDIN_LI_AT,
        LINKEDIN_JSESSIONID: process.env.LINKEDIN_JSESSIONID,
        NOTION_API_KEY: process.env.NOTION_API_KEY,
        GOG_ACCESS_TOKEN: process.env.GOG_ACCESS_TOKEN,
        GOG_REFRESH_TOKEN: process.env.GOG_REFRESH_TOKEN,
        GOG_TOKEN_EXPIRES_AT: process.env.GOG_TOKEN_EXPIRES_AT,
        GOG_TOKEN_TYPE: process.env.GOG_TOKEN_TYPE,
        GOG_TOKEN_SCOPE: process.env.GOG_TOKEN_SCOPE,
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

// ============================================================================
// Tool Registry
// ============================================================================

const toolRegistry: Map<string, ToolDefinition> = new Map();

toolRegistry.set(bashCommandTool.name, bashCommandTool);

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
