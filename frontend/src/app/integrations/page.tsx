"use client";

import { useEffect, useState } from "react";

interface IntegrationStatus {
  notion: { connected: boolean };
  gog: { connected: boolean };
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [notionKey, setNotionKey] = useState("");
  const [savingNotion, setSavingNotion] = useState(false);
  const [notionMessage, setNotionMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch(
        "http://localhost:3001/api/integrations/status",
      );
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
      const response = await fetch(
        "http://localhost:3001/api/integrations/notion",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: notionKey.trim() }),
        },
      );

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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-white">
            Integrations
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Connect external tools to power agent commands.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                Google (gog)
              </h2>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  status?.gog.connected
                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {status?.gog.connected ? "Connected" : "Not connected"}
              </span>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Authenticate with Google so gog commands can access Gmail,
              Calendar, Drive, Docs, Sheets, and Contacts.
            </p>
            <button
              onClick={() => {
                window.location.href =
                  "http://localhost:3001/api/auth/gog/start";
              }}
              className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Connect Google
            </button>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
              You will be redirected to Google OAuth in a new page.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                Notion
              </h2>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  status?.notion.connected
                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {status?.notion.connected ? "Connected" : "Not connected"}
              </span>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Create an integration in Notion and paste the API key here.
            </p>
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Open Notion integrations
            </a>
            <div className="mt-4 flex flex-col gap-3">
              <input
                type="password"
                value={notionKey}
                onChange={(event) => setNotionKey(event.target.value)}
                placeholder="Notion API key"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white"
              />
              <button
                onClick={saveNotionKey}
                disabled={savingNotion}
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {savingNotion ? "Saving..." : "Save Notion Key"}
              </button>
              {notionMessage && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {notionMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
