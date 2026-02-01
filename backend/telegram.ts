import OpenAI from "openai";
import {
  type ContextManager,
  runAgentLoopStreaming,
  type StreamEvent,
  DEFAULT_CONFIG,
} from "./agents/index.js";

// ============================================================================
// Types
// ============================================================================

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
      username?: string;
      first_name?: string;
    };
    text?: string;
    date: number;
  };
}

interface TelegramUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
}

// ============================================================================
// Telegram Service
// ============================================================================

class TelegramService {
  private token: string | null = null;
  private openai: OpenAI | null = null;
  private contextManager: ContextManager | null = null;
  private polling = false;
  private stopping = false;
  private currentToken: string | null = null;
  private lastUpdateId = 0;
  private conversationHistory = new Map<
    number,
    OpenAI.Chat.ChatCompletionMessageParam[]
  >();
  private maxHistoryLength = 50;
  private pollLoopPromise: Promise<void> | null = null;

  async start(token: string, openai: OpenAI, contextManager: ContextManager) {
    if (this.currentToken === token && this.polling) {
      console.log(
        "[Telegram] Polling already running with same token, skipping",
      );
      return;
    }

    if (this.polling) {
      console.log(
        "[Telegram] Polling already running, stopping previous instance",
      );
      await this.stop();
      await this.sleep(1000);
    }

    this.token = token;
    this.currentToken = token;
    this.openai = openai;
    this.contextManager = contextManager;
    this.polling = true;
    this.stopping = false;
    this.lastUpdateId = 0;

    console.log("[Telegram] Starting polling service");
    this.pollLoopPromise = this.pollLoop().catch((error) => {
      console.error("[Telegram] Poll loop error:", error);
      this.polling = false;
      this.currentToken = null;
    });
  }

  async stop() {
    if (!this.polling) {
      return;
    }

    this.stopping = true;
    this.polling = false;
    console.log("[Telegram] Stopping polling service");

    if (this.pollLoopPromise) {
      try {
        await Promise.race([this.pollLoopPromise, this.sleep(5000)]);
      } catch {
        // Ignore errors from poll loop
      }
      this.pollLoopPromise = null;
    }

    this.currentToken = null;
    this.stopping = false;
  }

  private async pollLoop() {
    let retryDelay = 1000;
    const maxRetryDelay = 60000;
    const currentToken = this.token;

    while (this.polling && this.token === currentToken) {
      if (this.stopping) {
        break;
      }

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`,
        );

        if (!response.ok) {
          const errorText = await response.text();
          let errorData: { error_code?: number; description?: string } = {};
          try {
            errorData = JSON.parse(errorText);
          } catch {
            // Not JSON, use as-is
          }

          if (errorData.error_code === 409) {
            console.warn(
              "[Telegram] Conflict: Another instance is polling. Waiting before retry...",
            );
            await this.sleep(5000);
            retryDelay = 1000;
            continue;
          }

          console.error(
            `[Telegram] API error (${response.status}):`,
            errorText,
          );
          retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
          await this.sleep(retryDelay);
          continue;
        }

        const data = (await response.json()) as TelegramUpdatesResponse;

        if (!data.ok) {
          if (data.description?.includes("Conflict")) {
            console.warn(
              "[Telegram] Conflict: Another instance is polling. Waiting before retry...",
            );
            await this.sleep(5000);
            retryDelay = 1000;
            continue;
          }

          console.error("[Telegram] API returned error:", data.description);
          retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
          await this.sleep(retryDelay);
          continue;
        }

        retryDelay = 1000;

        if (data.result && data.result.length > 0) {
          for (const update of data.result) {
            if (this.stopping || this.token !== currentToken) {
              break;
            }

            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);

            const message = update.message;
            const messageText = message?.text;
            if (message && messageText) {
              this.handleMessage({
                message_id: message.message_id,
                chat: message.chat,
                text: messageText,
                date: message.date,
              }).catch((error) => {
                console.error("[Telegram] Error handling message:", error);
                this.sendMessage(
                  message.chat.id,
                  "Sorry, I encountered an error processing your message.",
                ).catch((err) =>
                  console.error("[Telegram] Error sending error message:", err),
                );
              });
            }
          }
        }
      } catch (error) {
        if (this.stopping || this.token !== currentToken) {
          break;
        }
        console.error("[Telegram] Poll error:", error);
        retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
        await this.sleep(retryDelay);
      }
    }

    console.log("[Telegram] Poll loop exited");
  }

  private async handleMessage(message: {
    message_id: number;
    chat: { id: number; type: string; username?: string; first_name?: string };
    text: string;
    date: number;
  }) {
    if (!this.openai || !this.contextManager) {
      throw new Error("Telegram service not properly initialized");
    }

    const chatId = message.chat.id;
    const messageText = message.text.trim();

    if (!messageText) {
      return;
    }

    console.log(
      `[Telegram] Received message from chat ${chatId}: ${messageText}`,
    );

    let history = this.conversationHistory.get(chatId);
    if (!history) {
      history = [];
      this.conversationHistory.set(chatId, history);
    }

    history.push({
      role: "user",
      content: messageText,
    });

    if (history.length > this.maxHistoryLength) {
      history = history.slice(-this.maxHistoryLength);
      this.conversationHistory.set(chatId, history);
    }

    const selectedSkills = await this.contextManager.selectSkillsForMessages(
      history.filter(
        (m) => m.role === "user" || m.role === "assistant",
      ) as Array<{ role: string; content: string }>,
    );

    const messagesWithContext = this.contextManager.buildContextMessages(
      selectedSkills,
      history,
    );

    let assistantResponse = "";

    const sendEvent = (data: StreamEvent) => {
      if (data.type === "content" && data.content) {
        assistantResponse += data.content;
      }
    };

    try {
      await runAgentLoopStreaming(this.openai, messagesWithContext, sendEvent, {
        ...DEFAULT_CONFIG,
        model: "gpt-4o-mini",
      });

      if (assistantResponse.trim()) {
        await this.sendMessage(chatId, assistantResponse.trim());
        history.push({
          role: "assistant",
          content: assistantResponse.trim(),
        });
        this.conversationHistory.set(chatId, history);
      } else {
        await this.sendMessage(
          chatId,
          "I received your message but couldn't generate a response.",
        );
      }
    } catch (error) {
      console.error("[Telegram] Agent loop error:", error);
      await this.sendMessage(
        chatId,
        "Sorry, I encountered an error processing your request.",
      );
    }
  }

  private async sendMessage(chatId: number, text: string): Promise<void> {
    if (!this.token) {
      throw new Error("Telegram token not set");
    }

    const maxMessageLength = 4096;
    const messages = this.splitMessage(text, maxMessageLength);

    for (const message of messages) {
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Telegram API error (${response.status}): ${errorText}`,
        );
      }
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const messages: string[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
      const chunk = text.slice(currentIndex, currentIndex + maxLength);
      messages.push(chunk);
      currentIndex += maxLength;
    }

    return messages;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const telegramService = new TelegramService();

export function startTelegramPolling(
  token: string,
  openai: OpenAI,
  contextManager: ContextManager,
): Promise<void> {
  return telegramService.start(token, openai, contextManager);
}

export function stopTelegramPolling(): Promise<void> {
  return telegramService.stop();
}
