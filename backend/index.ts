import OpenAI from "openai";
import { join } from "path";
import { readFileSync } from "fs";
import { ContextManager } from "./context.js";
import {
  getIntegrationStatus,
  loadIntegrationsFromDisk,
  setNotionApiKey,
  setGogTokens,
  setLinkedInCookies,
} from "./integrations.js";
import {
  runAgentLoopStreaming,
  type StreamEvent,
  DEFAULT_CONFIG,
} from "./agent-loop.js";

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
// Initialize Services
// ============================================================================

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

loadIntegrationsFromDisk();

const pendingGogStates = new Set<string>();

const contextManager = new ContextManager({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  skillsDir: join(import.meta.dir, "..", "skills"),
  skillFolders: ["gog", "notion", "github", "linkedin"],
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

    if (url.pathname === "/api/auth/gog/start") {
      try {
        const clientSecretPath = join(
          import.meta.dir,
          "..",
          "skills",
          "gog",
          "client_secret.json",
        );
        const clientSecret = JSON.parse(
          readFileSync(clientSecretPath, "utf-8"),
        );
        const credentials = clientSecret.installed || clientSecret.web;
        const clientId = credentials?.client_id;
        const redirectUri =
          process.env.GOG_REDIRECT_URI ||
          "http://localhost:3001/api/auth/gog/callback";

        if (!clientId) {
          return new Response(
            JSON.stringify({ error: "Missing Google OAuth client_id." }),
            { status: 500, headers },
          );
        }

        const scopes = [
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/drive",
          "https://www.googleapis.com/auth/contacts",
          "https://www.googleapis.com/auth/documents",
          "https://www.googleapis.com/auth/spreadsheets",
        ];

        const state = crypto.randomUUID();
        pendingGogStates.add(state);
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

    if (url.pathname === "/api/auth/gog/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing OAuth code." }), {
          status: 400,
          headers,
        });
      }

      if (!state || !pendingGogStates.has(state)) {
        return new Response(JSON.stringify({ error: "Invalid OAuth state." }), {
          status: 400,
          headers,
        });
      }
      pendingGogStates.delete(state);

      try {
        const clientSecretPath = join(
          import.meta.dir,
          "..",
          "skills",
          "gog",
          "client_secret.json",
        );
        const clientSecret = JSON.parse(
          readFileSync(clientSecretPath, "utf-8"),
        );
        const credentials = clientSecret.installed || clientSecret.web;
        const clientId = credentials?.client_id;
        const clientSecretValue = credentials?.client_secret;
        const redirectUri =
          process.env.GOG_REDIRECT_URI ||
          "http://localhost:3001/api/auth/gog/callback";

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

        setGogTokens({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in,
          token_type: tokenData.token_type,
          scope: tokenData.scope,
          scopes: tokenData.scope?.split(" ").filter(Boolean),
          email,
          created_at: Date.now(),
        });

        return new Response(null, {
          status: 302,
          headers: {
            ...headers,
            Location: "http://localhost:3000/integrations?gog=connected",
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
