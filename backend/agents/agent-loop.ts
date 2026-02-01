import OpenAI from "openai";
import { executeTool, formatToolResult, getToolDefinitions } from "../tools.js";
import {
  getToolIcon,
  getToolLabel,
  extractResultUrl,
  shouldSuppressOutput,
} from "../tool-metadata.js";

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
 * Streaming implementation of the agentic loop.
 *
 * This version streams content tokens as they arrive while still properly
 * handling the tool call loop.
 *
 * KEY FIX: The loop only exits when:
 * 1. finish_reason is "stop" (model explicitly done)
 * 2. No tool calls were made in this iteration
 *
 * This allows the model to:
 * - Stream thoughts/content AND still make tool calls
 * - Complete multi-step tasks without user intervention
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

      // Collect the streamed response
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

        // Stream content tokens immediately to the client
        if (delta?.content) {
          assistantContent += delta.content;
          emitEvent({
            type: "content",
            content: delta.content,
          });
        }

        // Accumulate tool call deltas
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

      // If model made tool calls, execute them and continue the loop
      if (toolCalls.size > 0) {
        console.log(`Model requested ${toolCalls.size} tool call(s)`);

        // Build and add assistant message with any content AND tool calls
        const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam = {
          role: "assistant",
          content: assistantContent || null,
          tool_calls: Array.from(toolCalls.values()).map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        };

        messages.push(assistantMessage);

        // Execute each tool call
        for (const [, toolCall] of toolCalls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.arguments);
          } catch {
            args = {};
          }

          console.log(JSON.stringify(args, null, 2));

          emitEvent({
            type: "tool_call",
            name: toolCall.name,
            icon: getToolIcon(toolCall.name),
            label: getToolLabel(toolCall.name, false),
            toolCallId: toolCall.id,
          });

          console.log(`Executing tool: ${toolCall.name}`);

          const result = await executeTool(toolCall.name, args);

          emitEvent({
            type: "tool_result",
            toolCallId: toolCall.id,
            name: toolCall.name,
            icon: getToolIcon(toolCall.name),
            label: getToolLabel(toolCall.name, true),
            url: extractResultUrl(result.output),
            success: result.success,
            // Suppress verbose output for certain tools (e.g., browser HTML)
            ...(shouldSuppressOutput(toolCall.name)
              ? {}
              : { output: result.output }),
            error: result.error,
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: formatToolResult(result),
          });
        }

        // Continue the loop - model needs to process tool results
        continue;
      }

      // No tool calls - model has finished (finish_reason should be "stop")
      // Content was already streamed above, so just add to history and exit
      if (assistantContent) {
        messages.push({
          role: "assistant",
          content: assistantContent,
        });
      } else {
        emitEvent({
          type: "content",
          content: "(No response)",
        });
      }

      // Exit the loop - task is complete
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
