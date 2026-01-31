import OpenAI from "openai";
import { executeTool, formatToolResult, getToolDefinitions } from "./tools.js";

// ============================================================================
// Types
// ============================================================================

export interface AgentLoopConfig {
  maxIterations: number;
  model: string;
}

export interface StreamEvent {
  type: "tool_call" | "tool_result" | "content" | "error" | "iteration";
  [key: string]: unknown;
}

export type EventEmitter = (event: StreamEvent) => void;

export const DEFAULT_CONFIG: AgentLoopConfig = {
  maxIterations: 20,
  model: "gpt-4o-mini",
};

// ============================================================================
// Agentic Loop
// ============================================================================

/**
 * Runs the agentic loop following the clawdbot pattern:
 *
 * 1. Send messages to the model
 * 2. If model returns tool calls:
 *    - Execute ALL tool calls
 *    - Add assistant message (with tool calls) to message history
 *    - Add ALL tool results to message history
 *    - Loop back to step 1
 * 3. If model returns content without tool calls:
 *    - Stream the content and exit
 * 4. Safety: Exit if max iterations reached
 */
export async function runAgentLoop(
  openai: OpenAI,
  initialMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  emitEvent: EventEmitter,
  config: AgentLoopConfig = DEFAULT_CONFIG,
): Promise<void> {
  const tools = getToolDefinitions();
  const messages = [...initialMessages];
  let iteration = 0;

  while (iteration < config.maxIterations) {
    iteration++;

    emitEvent({
      type: "iteration",
      iteration,
      maxIterations: config.maxIterations,
    });

    console.log(`Agent loop iteration ${iteration}/${config.maxIterations}`);

    try {
      const response = await openai.chat.completions.create({
        model: config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      });

      const assistantMessage = response.choices[0]?.message;

      if (!assistantMessage) {
        emitEvent({
          type: "error",
          error: "No response from model",
        });
        break;
      }

      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        console.log(
          `Model requested ${assistantMessage.tool_calls.length} tool call(s)`,
        );

        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== "function") continue;

          const toolName = toolCall.function.name;
          let args: Record<string, unknown>;

          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            args = {};
          }

          emitEvent({
            type: "tool_call",
            name: toolName,
            arguments: args,
            command: JSON.stringify(args, null, 2),
            toolCallId: toolCall.id,
          });

          console.log(`Executing tool: ${toolName}`);

          const result = await executeTool(toolName, args);

          emitEvent({
            type: "tool_result",
            toolCallId: toolCall.id,
            name: toolName,
            success: result.success,
            output: result.output,
            error: result.error,
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: formatToolResult(result),
          });
        }

        continue;
      }

      if (assistantMessage.content) {
        const streamResponse = await openai.chat.completions.create({
          model: config.model,
          messages,
          stream: true,
        });

        for await (const chunk of streamResponse) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            emitEvent({
              type: "content",
              content,
            });
          }
        }
      } else {
        emitEvent({
          type: "content",
          content: "(No response)",
        });
      }

      break;
    } catch (error) {
      emitEvent({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  if (iteration >= config.maxIterations) {
    console.warn(`Agent loop reached max iterations (${config.maxIterations})`);
    emitEvent({
      type: "error",
      error: `Reached maximum iterations (${config.maxIterations}). The agent may not have completed its task.`,
    });
  }
}

/**
 * Alternative implementation that streams from the first request.
 * This is more efficient as it doesn't make an extra API call for the final response.
 */
export async function runAgentLoopStreaming(
  openai: OpenAI,
  initialMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  emitEvent: EventEmitter,
  config: AgentLoopConfig = DEFAULT_CONFIG,
): Promise<void> {
  const tools = getToolDefinitions();
  const messages = [...initialMessages];
  let iteration = 0;

  while (iteration < config.maxIterations) {
    iteration++;

    emitEvent({
      type: "iteration",
      iteration,
      maxIterations: config.maxIterations,
    });

    console.log(`Agent loop iteration ${iteration}/${config.maxIterations}`);

    try {
      const stream = await openai.chat.completions.create({
        model: config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        stream: true,
      });

      let assistantContent = "";
      const toolCalls: Map<
        number,
        {
          id: string;
          name: string;
          arguments: string;
        }
      > = new Map();
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

        if (delta?.content) {
          assistantContent += delta.content;
          emitEvent({
            type: "content",
            content: delta.content,
          });
        }

        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            if (!toolCalls.has(index)) {
              toolCalls.set(index, {
                id: toolCallDelta.id || "",
                name: toolCallDelta.function?.name || "",
                arguments: "",
              });
            }

            const toolCall = toolCalls.get(index)!;

            if (toolCallDelta.id) {
              toolCall.id = toolCallDelta.id;
            }
            if (toolCallDelta.function?.name) {
              toolCall.name = toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              toolCall.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }

      if (toolCalls.size > 0 && finishReason === "tool_calls") {
        console.log(`Model requested ${toolCalls.size} tool call(s)`);

        const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam = {
          role: "assistant",
          content: assistantContent || null,
          tool_calls: Array.from(toolCalls.values()).map((tc, index) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        };

        messages.push(assistantMessage);

        for (const [, toolCall] of toolCalls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.arguments);
          } catch {
            args = {};
          }

          emitEvent({
            type: "tool_call",
            name: toolCall.name,
            arguments: args,
            command: JSON.stringify(args, null, 2),
            toolCallId: toolCall.id,
          });

          console.log(`Executing tool: ${toolCall.name}`);

          const result = await executeTool(toolCall.name, args);

          emitEvent({
            type: "tool_result",
            toolCallId: toolCall.id,
            name: toolCall.name,
            success: result.success,
            output: result.output,
            error: result.error,
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: formatToolResult(result),
          });
        }

        continue;
      }

      if (!assistantContent && toolCalls.size === 0) {
        emitEvent({
          type: "content",
          content: "(No response)",
        });
      }

      break;
    } catch (error) {
      emitEvent({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  if (iteration >= config.maxIterations) {
    console.warn(`Agent loop reached max iterations (${config.maxIterations})`);
    emitEvent({
      type: "error",
      error: `Reached maximum iterations (${config.maxIterations}). The agent may not have completed its task.`,
    });
  }
}
