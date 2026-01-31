"use client";

import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolCommand?: string;
  toolSuccess?: boolean;
  toolOutput?: string;
  toolError?: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);

  const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:3001";

  function stopSpeech() {
    ttsAbortControllerRef.current?.abort();
    ttsAbortControllerRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }

    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
  }

  async function speakText(text: string) {
    if (!speechEnabled) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    stopSpeech();

    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;

    try {
      const response = await fetch(`${BACKEND_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("TTS failed:", errorText);
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      audioObjectUrlRef.current = objectUrl;

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      audioRef.current.onended = () => {
        if (audioObjectUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          audioObjectUrlRef.current = null;
        }
      };

      audioRef.current.src = objectUrl;

      try {
        await audioRef.current.play();
      } catch (error) {
        console.error("Audio playback failed:", error);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("TTS request failed:", error);
    } finally {
      if (ttsAbortControllerRef.current === controller) {
        ttsAbortControllerRef.current = null;
      }
    }
  }

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return () => stopSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!speechEnabled) stopSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechEnabled]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    stopSpeech();

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const apiMessages = newMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await fetch(`${BACKEND_URL}/api/chat`, {
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

    if (assistantContent.trim()) {
      void speakText(assistantContent);
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    if (msg.role === "tool") {
      return (
        <div
          key={index}
          className="bg-amber-500/10 border border-amber-500/20 text-foreground p-4 rounded-lg max-w-[90%]"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔧</span>
            <span className="font-semibold text-sm uppercase tracking-wide">
              Tool: {msg.toolName}
            </span>
            {msg.toolSuccess !== undefined && (
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded",
                  msg.toolSuccess
                    ? "bg-green-500/20 text-green-700 dark:text-green-400"
                    : "bg-destructive/20 text-destructive",
                )}
              >
                {msg.toolSuccess ? "Success" : "Failed"}
              </span>
            )}
          </div>
          <div className="bg-muted rounded p-2 mb-2">
            <code className="text-sm font-mono break-all">
              {msg.toolCommand}
            </code>
          </div>
          {msg.toolOutput && (
            <div className="mt-2">
              <div className="text-xs font-semibold mb-1 opacity-70">
                Output:
              </div>
              <pre className="bg-muted rounded p-2 text-xs font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                {msg.toolOutput}
              </pre>
            </div>
          )}
          {msg.toolError && (
            <div className="mt-2">
              <div className="text-xs font-semibold mb-1 text-destructive">
                Error:
              </div>
              <pre className="bg-destructive/10 rounded p-2 text-xs font-mono text-destructive whitespace-pre-wrap">
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
        className={cn(
          "p-4 rounded-lg max-w-[80%]",
          msg.role === "user"
            ? "bg-primary text-primary-foreground ml-auto"
            : "bg-muted text-foreground",
        )}
      >
        <div className="whitespace-pre-wrap">{msg.content}</div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="flex-1 overflow-y-auto p-4 bg-background">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg, i) => renderMessage(msg, i))}
          {loading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="bg-muted text-foreground p-4 rounded-lg max-w-[80%]">
              Thinking...
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-border p-4 bg-background">
        <div className="mx-auto max-w-2xl flex gap-2">
          <Button
            type="button"
            variant={speechEnabled ? "secondary" : "outline"}
            onClick={() => setSpeechEnabled((v) => !v)}
            disabled={loading && !speechEnabled}
            aria-pressed={speechEnabled}
            title={speechEnabled ? "Speech enabled" : "Speech disabled"}
          >
            Speech: {speechEnabled ? "On" : "Off"}
          </Button>
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={loading}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
