"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface IntegrationStatus {
  notion: { connected: boolean };
  google: { connected: boolean; email?: string };
  linkedin: { connected: boolean };
  telegram: { connected: boolean };
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [notionKey, setNotionKey] = useState("");
  const [savingNotion, setSavingNotion] = useState(false);
  const [notionMessage, setNotionMessage] = useState<string | null>(null);
  const [linkedinLiAt, setLinkedinLiAt] = useState("");
  const [linkedinJsession, setLinkedinJsession] = useState("");
  const [savingLinkedin, setSavingLinkedin] = useState(false);
  const [linkedinMessage, setLinkedinMessage] = useState<string | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState<string | null>(null);

  const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:3001";

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/integrations/status`);
      if (!response.ok) return;
      const data = (await response.json()) as IntegrationStatus;
      setStatus(data);
    } catch {
      // Ignore status errors for now
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const saveNotionKey = async () => {
    if (!notionKey.trim()) return;
    setSavingNotion(true);
    setNotionMessage(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/integrations/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: notionKey.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        setNotionMessage(error?.error || "Failed to save Notion API key.");
      } else {
        setNotionMessage("Notion API key saved.");
        setNotionKey("");
        fetchStatus();
      }
    } catch {
      setNotionMessage("Failed to save Notion API key.");
    } finally {
      setSavingNotion(false);
    }
  };

  const saveLinkedinCookies = async () => {
    if (!linkedinLiAt.trim() || !linkedinJsession.trim()) return;
    setSavingLinkedin(true);
    setLinkedinMessage(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/integrations/linkedin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liAt: linkedinLiAt.trim(),
          jsessionId: linkedinJsession.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setLinkedinMessage(error?.error || "Failed to save LinkedIn cookies.");
      } else {
        setLinkedinMessage("LinkedIn cookies saved.");
        setLinkedinLiAt("");
        setLinkedinJsession("");
        fetchStatus();
      }
    } catch {
      setLinkedinMessage("Failed to save LinkedIn cookies.");
    } finally {
      setSavingLinkedin(false);
    }
  };

  const saveTelegramToken = async () => {
    if (!telegramToken.trim()) return;
    setSavingTelegram(true);
    setTelegramMessage(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/integrations/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: telegramToken.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        setTelegramMessage(
          error?.error || "Failed to save Telegram bot token.",
        );
      } else {
        setTelegramMessage(
          "Telegram bot connected! Start chatting with your bot on Telegram.",
        );
        setTelegramToken("");
        fetchStatus();
      }
    } catch {
      setTelegramMessage("Failed to save Telegram bot token.");
    } finally {
      setSavingTelegram(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 bg-background px-6 py-10">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              Integrations
            </h1>
            <p className="mt-2 text-muted-foreground">
              Connect external tools to power agent commands.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Google</CardTitle>
                  <Badge
                    variant={status?.google?.connected ? "success" : "secondary"}
                  >
                    {status?.google?.connected ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Authenticate with Google to access Gmail, Calendar, Sheets,
                  and Docs.
                </CardDescription>
                {status?.google?.email && (
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Connected as: {status.google.email}
                  </p>
                )}
                <Button
                  onClick={() => {
                    window.location.href = `${BACKEND_URL}/api/auth/google/start`;
                  }}
                  className="mt-5"
                >
                  {status?.google?.connected ? "Reconnect Google" : "Connect Google"}
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  You will be redirected to Google OAuth.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Notion</CardTitle>
                  <Badge
                    variant={status?.notion.connected ? "success" : "secondary"}
                  >
                    {status?.notion.connected ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Create an integration in Notion and paste the API key here.
                </CardDescription>
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
                >
                  Open Notion integrations
                </a>
                <div className="mt-4 flex flex-col gap-3">
                  <Input
                    type="password"
                    value={notionKey}
                    onChange={(event) => setNotionKey(event.target.value)}
                    placeholder="Notion API key"
                  />
                  <Button
                    onClick={saveNotionKey}
                    disabled={savingNotion}
                    variant="secondary"
                  >
                    {savingNotion ? "Saving..." : "Save Notion Key"}
                  </Button>
                  {notionMessage && (
                    <p className="text-xs text-muted-foreground">
                      {notionMessage}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">LinkedIn</CardTitle>
                  <Badge
                    variant={
                      status?.linkedin.connected ? "success" : "secondary"
                    }
                  >
                    {status?.linkedin.connected ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Open LinkedIn in a new tab and paste your session cookies to
                  enable automation.
                </CardDescription>
                <Button
                  onClick={() =>
                    window.open(
                      "https://www.linkedin.com",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  className="mt-5"
                >
                  Open LinkedIn
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  Provide both li_at and JSESSIONID from your LinkedIn cookies.
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  <Input
                    type="password"
                    value={linkedinLiAt}
                    onChange={(event) => setLinkedinLiAt(event.target.value)}
                    placeholder="li_at cookie"
                  />
                  <Input
                    type="password"
                    value={linkedinJsession}
                    onChange={(event) =>
                      setLinkedinJsession(event.target.value)
                    }
                    placeholder="JSESSIONID cookie"
                  />
                  <Button
                    onClick={saveLinkedinCookies}
                    disabled={savingLinkedin}
                    variant="secondary"
                  >
                    {savingLinkedin ? "Saving..." : "Save LinkedIn Cookies"}
                  </Button>
                  {linkedinMessage && (
                    <p className="text-xs text-muted-foreground">
                      {linkedinMessage}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Telegram</CardTitle>
                  <Badge
                    variant={
                      status?.telegram.connected ? "success" : "secondary"
                    }
                  >
                    {status?.telegram.connected ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Create a bot with @BotFather on Telegram and paste the bot
                  token below. Once saved, your bot will automatically start
                  receiving messages.
                </CardDescription>
                <Button
                  onClick={() =>
                    window.open(
                      "https://t.me/BotFather",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  className="mt-5"
                >
                  Open BotFather
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  Send{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">/newbot</code>{" "}
                  to BotFather, follow the prompts, and copy the token provided.
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  <Input
                    type="password"
                    value={telegramToken}
                    onChange={(event) => setTelegramToken(event.target.value)}
                    placeholder="Telegram bot token"
                  />
                  <Button
                    onClick={saveTelegramToken}
                    disabled={savingTelegram}
                    variant="secondary"
                  >
                    {savingTelegram ? "Saving..." : "Save Telegram Token"}
                  </Button>
                  {telegramMessage && (
                    <p className="text-xs text-muted-foreground">
                      {telegramMessage}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
