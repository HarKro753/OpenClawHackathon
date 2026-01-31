"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [backendMessage, setBackendMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:3001/api/hello")
      .then((res) => res.json())
      .then((data) => {
        setBackendMessage(data.message);
        setLoading(false);
      })
      .catch(() => {
        setError(
          "Failed to connect to backend. Make sure it's running on port 3001.",
        );
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 py-32 px-16 bg-white dark:bg-black">
        <h1 className="text-4xl font-bold text-black dark:text-white">
          Bun + Next.js App
        </h1>

        <div className="flex flex-col items-center gap-4 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300">
            Backend Connection Status
          </h2>

          {loading && <p className="text-zinc-500">Connecting to backend...</p>}

          {error && <p className="text-red-500">{error}</p>}

          {backendMessage && (
            <p className="text-green-600 dark:text-green-400 font-medium">
              {backendMessage}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            Frontend:{" "}
            <code className="bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded">
              http://localhost:3000
            </code>
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Backend:{" "}
            <code className="bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded">
              http://localhost:3001
            </code>
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm text-zinc-500 dark:text-zinc-500 mt-8">
          <p>To start:</p>
          <code className="bg-zinc-100 dark:bg-zinc-900 px-3 py-2 rounded block">
            cd backend && bun run index.ts
          </code>
          <code className="bg-zinc-100 dark:bg-zinc-900 px-3 py-2 rounded block">
            cd frontend && bun run dev
          </code>
        </div>
      </main>
    </div>
  );
}
