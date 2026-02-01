import OpenAI from "openai";
import { join } from "path";
import { readFileSync } from "fs";
import {
  ContextManager,
  runAgentLoopStreaming,
  DEFAULT_CONFIG,
  type StreamEvent,
} from "./agents/index.js";
import {
  getIntegrationStatus,
  loadIntegrationsFromDisk,
  setNotionApiKey,
  setGoogleTokens,
  setLinkedInCookies,
  setTelegramBotToken,
  getTelegramBotToken,
} from "./integrations/index.js";
import { startTelegramPolling, stopTelegramPolling } from "./telegram.js";

// ============================================================================
// Environment Validation
// ============================================================================

const requiredEnvVars = ["OPENAI_API_KEY"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(
      `${envVar} environment variable is not set. Check your .env file.`,
    );
  }
}

// ============================================================================
// System Context Helper
// ============================================================================

function getSystemContext(): string {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return `## System Context

- **Current Time**: ${now.toISOString()} (${now.toLocaleString("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "long" })})
- **Timezone**: ${timezone}
- **Platform**: ${process.platform} (${process.arch})
- **Node Version**: ${process.version}

Use this context when the user asks about time-sensitive information or when creating calendar events.`;
}

// ============================================================================
// Initialize Services
// ============================================================================

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

loadIntegrationsFromDisk();

const pendingGoogleStates = new Set<string>();

const contextManager = new ContextManager({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  skillsDir: join(import.meta.dir, "..", "skills"),
  skillFolders: ["google", "notion", "github", "linkedin"],
  systemPromptPath: join(import.meta.dir, "system-prompt.txt"),
});

// ============================================================================
// HTTP Server
// ============================================================================

const server = Bun.serve({
  port: 3001,
  idleTimeout: 60,
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

    if (url.pathname === "/api/integrations/status") {
      return new Response(JSON.stringify(getIntegrationStatus()), { headers });
    }

    if (url.pathname === "/api/integrations/notion" && req.method === "POST") {
      const body = (await req.json()) as { apiKey?: string };
      if (!body.apiKey?.trim()) {
        return new Response(
          JSON.stringify({ error: "Notion API key is required." }),
          { status: 400, headers },
        );
      }

      setNotionApiKey(body.apiKey.trim());
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (
      url.pathname === "/api/integrations/linkedin" &&
      req.method === "POST"
    ) {
      const body = (await req.json()) as {
        liAt?: string;
        jsessionId?: string;
      };
      const liAt = body.liAt?.trim();
      const jsessionId = body.jsessionId?.trim();
      if (!liAt || !jsessionId) {
        return new Response(
          JSON.stringify({
            error: "LinkedIn li_at and JSESSIONID are required.",
          }),
          { status: 400, headers },
        );
      }

      setLinkedInCookies({ liAt, jsessionId });
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (
      url.pathname === "/api/integrations/telegram" &&
      req.method === "POST"
    ) {
      const body = (await req.json()) as { botToken?: string };
      const botToken = body.botToken?.trim();
      if (!botToken) {
        return new Response(
          JSON.stringify({ error: "Telegram bot token is required." }),
          { status: 400, headers },
        );
      }

      try {
        const currentToken = getTelegramBotToken();
        if (currentToken === botToken) {
          return new Response(
            JSON.stringify({ success: true, message: "Token unchanged" }),
            { headers },
          );
        }

        await stopTelegramPolling();
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setTelegramBotToken(botToken);
        await startTelegramPolling(botToken, openai, contextManager);
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (error) {
        return new Response(
          JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Failed to start Telegram bot.",
          }),
          { status: 500, headers },
        );
      }
    }

    if (url.pathname === "/api/auth/google/start") {
      try {
        const clientSecretPath = join(
          import.meta.dir,
          "..",
          "skills",
          "google",
          "client_secret.json",
        );
        const clientSecret = JSON.parse(
          readFileSync(clientSecretPath, "utf-8"),
        );
        const credentials = clientSecret.installed || clientSecret.web;
        const clientId = credentials?.client_id;
        const redirectUri = "http://localhost:3001/api/auth/google/callback";

        if (!clientId) {
          return new Response(
            JSON.stringify({ error: "Missing Google OAuth client_id." }),
            { status: 500, headers },
          );
        }

        const scopes = [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/drive",
          "https://www.googleapis.com/auth/documents",
          "https://www.googleapis.com/auth/spreadsheets",
        ];

        const state = crypto.randomUUID();
        pendingGoogleStates.add(state);
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("scope", scopes.join(" "));
        authUrl.searchParams.set("state", state);

        return new Response(null, {
          status: 302,
          headers: {
            ...headers,
            Location: authUrl.toString(),
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            error:
              error instanceof Error ? error.message : "Failed to start OAuth.",
          }),
          { status: 500, headers },
        );
      }
    }

    if (url.pathname === "/api/auth/google/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing OAuth code." }), {
          status: 400,
          headers,
        });
      }

      if (!state || !pendingGoogleStates.has(state)) {
        return new Response(JSON.stringify({ error: "Invalid OAuth state." }), {
          status: 400,
          headers,
        });
      }
      pendingGoogleStates.delete(state);

      try {
        const clientSecretPath = join(
          import.meta.dir,
          "..",
          "skills",
          "google",
          "client_secret.json",
        );
        const clientSecret = JSON.parse(
          readFileSync(clientSecretPath, "utf-8"),
        );
        const credentials = clientSecret.installed || clientSecret.web;
        const clientId = credentials?.client_id;
        const clientSecretValue = credentials?.client_secret;
        const redirectUri =
          "http://192.168.178.141:3001/api/auth/google/callback";

        if (!clientId || !clientSecretValue) {
          return new Response(
            JSON.stringify({ error: "Missing Google OAuth credentials." }),
            { status: 500, headers },
          );
        }

        const tokenResponse = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecretValue,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          },
        );

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          return new Response(
            JSON.stringify({ error: `OAuth exchange failed: ${errorText}` }),
            { status: 500, headers },
          );
        }

        const tokenData = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          token_type?: string;
          scope?: string;
        };

        let email: string | undefined;
        try {
          const userInfoResponse = await fetch(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            {
              headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
              },
            },
          );
          if (userInfoResponse.ok) {
            const userInfo = (await userInfoResponse.json()) as {
              email?: string;
            };
            if (userInfo.email) {
              email = userInfo.email;
            }
          } else {
            console.warn(
              "Failed to fetch Google user info:",
              await userInfoResponse.text(),
            );
          }
        } catch (error) {
          console.warn(
            "Failed to fetch Google user info:",
            error instanceof Error ? error.message : String(error),
          );
        }

        setGoogleTokens({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in,
          token_type: tokenData.token_type,
          scope: tokenData.scope,
          scopes: tokenData.scope?.split(" ").filter(Boolean),
          email,
          created_at: Date.now(),
        });

        // Return a simple HTML success page
        const successHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Google Connected</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
                .container { text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                h1 { color: #34a853; margin-bottom: 16px; }
                p { color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>✓ Google Connected!</h1>
                <p>You can close this window and return to the app.</p>
              </div>
            </body>
          </html>
        `;
        return new Response(successHtml, {
          headers: {
            ...headers,
            "Content-Type": "text/html",
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            error:
              error instanceof Error ? error.message : "OAuth callback failed.",
          }),
          { status: 500, headers },
        );
      }
    }

    if (url.pathname === "/api/tts" && req.method === "POST") {
      const body = (await req.json()) as {
        text?: string;
      };

      const text = body.text?.trim();
      if (!text) {
        return new Response(JSON.stringify({ error: "Text is required." }), {
          status: 400,
          headers,
        });
      }

      const humeApiKey = process.env.HUME_API_KEY?.trim();
      if (!humeApiKey) {
        return new Response(
          JSON.stringify({
            error: "HUME_API_KEY environment variable is not set.",
          }),
          { status: 500, headers },
        );
      }

      const humeResponse = await fetch("https://api.hume.ai/v0/tts/file", {
        method: "POST",
        headers: {
          "X-Hume-Api-Key": humeApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          utterances: [
            {
              text,
              voice: { name: "Ava Song", provider: "HUME_AI" as const },
            },
          ],
          format: { type: "mp3" as const },
        }),
      });

      if (!humeResponse.ok) {
        const errorText = await humeResponse.text();
        return new Response(
          JSON.stringify({
            error: `Hume TTS failed (${humeResponse.status}): ${errorText}`,
          }),
          { status: 502, headers },
        );
      }

      const audio = await humeResponse.arrayBuffer();

      return new Response(audio, {
        headers: {
          ...headers,
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = (await req.json()) as {
        messages: { role: string; content: string }[];
      };
      const { messages } = body;

      const selectedSkills =
        await contextManager.selectSkillsForMessages(messages);

      // Build messages with system context
      const systemContext = getSystemContext();
      const messagesWithContext = contextManager.buildContextMessages(
        selectedSkills,
        messages as OpenAI.Chat.ChatCompletionMessageParam[],
        systemContext,
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

// Start Telegram polling if token is configured
const telegramToken = getTelegramBotToken();
if (telegramToken) {
  startTelegramPolling(telegramToken, openai, contextManager).catch((error) => {
    console.error("Failed to start Telegram polling:", error);
  });
}
