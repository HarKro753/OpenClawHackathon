"use client";

import { useState } from "react";

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolCommand?: string;
  toolSuccess?: boolean;
  toolOutput?: string;
  toolError?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const apiMessages = newMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: apiMessages }),
    });

    if (!response.body) {
      setLoading(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";
    let currentMessages = [...newMessages];
    let toolMessage: Message | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "tool_call") {
              toolMessage = {
                role: "tool",
                content: "",
                toolName: parsed.name,
                toolCommand: parsed.command,
              };
              currentMessages = [...currentMessages, toolMessage];
              setMessages([...currentMessages]);
            } else if (parsed.type === "tool_result") {
              if (toolMessage) {
                toolMessage.toolSuccess = parsed.success;
                toolMessage.toolOutput = parsed.output;
                toolMessage.toolError = parsed.error;
                toolMessage.content = parsed.success
                  ? parsed.output
                  : `Error: ${parsed.error}`;
                setMessages([...currentMessages]);
              }
            } else if (parsed.type === "content") {
              if (parsed.content) {
                assistantContent += parsed.content;
                const lastMsg = currentMessages[currentMessages.length - 1];
                if (lastMsg?.role === "assistant") {
                  lastMsg.content = assistantContent;
                  setMessages([...currentMessages]);
                } else {
                  const assistantMessage: Message = {
                    role: "assistant",
                    content: assistantContent,
                  };
                  currentMessages = [...currentMessages, assistantMessage];
                  setMessages([...currentMessages]);
                }
              }
            } else if (parsed.type === "error") {
              const errorMessage: Message = {
                role: "assistant",
                content: `Error: ${parsed.error}`,
              };
              currentMessages = [...currentMessages, errorMessage];
              setMessages([...currentMessages]);
            } else if (parsed.content) {
              assistantContent += parsed.content;
              const lastMsg = currentMessages[currentMessages.length - 1];
              if (lastMsg?.role === "assistant") {
                lastMsg.content = assistantContent;
                setMessages([...currentMessages]);
              } else {
                currentMessages = [
                  ...currentMessages,
                  { role: "assistant", content: assistantContent },
                ];
                setMessages([...currentMessages]);
              }
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }

    setLoading(false);
  };

  const renderMessage = (msg: Message, index: number) => {
    if (msg.role === "tool") {
      return (
        <div
          key={index}
          className="bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 p-4 rounded-lg max-w-[90%]"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔧</span>
            <span className="font-semibold text-sm uppercase tracking-wide">
              Tool: {msg.toolName}
            </span>
            {msg.toolSuccess !== undefined && (
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  msg.toolSuccess
                    ? "bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200"
                    : "bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200"
                }`}
              >
                {msg.toolSuccess ? "Success" : "Failed"}
              </span>
            )}
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/50 rounded p-2 mb-2">
            <code className="text-sm font-mono break-all">
              {msg.toolCommand}
            </code>
          </div>
          {msg.toolOutput && (
            <div className="mt-2">
              <div className="text-xs font-semibold mb-1 opacity-70">
                Output:
              </div>
              <pre className="bg-zinc-100 dark:bg-zinc-800 rounded p-2 text-xs font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                {msg.toolOutput}
              </pre>
            </div>
          )}
          {msg.toolError && (
            <div className="mt-2">
              <div className="text-xs font-semibold mb-1 text-red-600 dark:text-red-400">
                Error:
              </div>
              <pre className="bg-red-50 dark:bg-red-950/50 rounded p-2 text-xs font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap">
                {msg.toolError}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={index}
        className={`p-4 rounded-lg ${
          msg.role === "user"
            ? "bg-blue-500 text-white ml-auto max-w-[80%]"
            : "bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white max-w-[80%]"
        }`}
      >
        <div className="whitespace-pre-wrap">{msg.content}</div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg, i) => renderMessage(msg, i))}
          {loading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white p-4 rounded-lg max-w-[80%]">
              Thinking...
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4">
        <div className="mx-auto max-w-2xl flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            className="rounded-lg bg-blue-500 px-6 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
