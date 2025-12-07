"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { askAI } from "@/lib/api";
import { Brain, Send, Sparkles, AlertTriangle, Lightbulb, Loader2 } from "lucide-react";

interface AIPanelProps {
  compact?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  recommendations?: string[];
}

export function AIPanel({ compact = false }: AIPanelProps) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "👋 Hi! I'm MetalMind, your AI assistant for fleet management. Ask me anything about your infrastructure, containers, or how to optimize your deployments.",
    },
  ]);

  const mutation = useMutation({
    mutationFn: askAI,
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response || "I couldn't generate a response. Please try again.",
          recommendations: data.recommendations,
        },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please check your AI configuration.",
        },
      ]);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || mutation.isPending) return;

    const userMessage = query.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setQuery("");

    mutation.mutate({ query: userMessage });
  };

  if (compact) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 max-h-48 overflow-y-auto">
          {messages.slice(-3).map((msg, i) => (
            <div
              key={i}
              className={`text-sm ${
                msg.role === "user" ? "text-blue-400" : "text-secondary"
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask MetalMind..."
            className="input text-sm flex-1"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn btn-primary p-2"
          >
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
          <Brain size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">MetalMind AI</h1>
          <p className="text-sm text-muted">Powered by Gemini 2.0</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          "Analyze fleet health",
          "Why is memory high?",
          "Optimize my containers",
          "Security recommendations",
        ].map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => setQuery(suggestion)}
            className="btn btn-secondary text-xs py-1.5"
          >
            <Sparkles size={12} />
            {suggestion}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                msg.role === "user"
                  ? "bg-blue-500"
                  : "bg-gradient-to-br from-purple-500 to-blue-600"
              }`}
            >
              {msg.role === "user" ? "Y" : <Brain size={16} />}
            </div>
            <div
              className={`flex-1 max-w-[80%] ${
                msg.role === "user" ? "text-right" : ""
              }`}
            >
              <div
                className={`inline-block p-4 rounded-xl ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-surface border border-border"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>

              {msg.recommendations && msg.recommendations.length > 0 && (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-xs font-medium text-yellow-400 mb-2 flex items-center gap-1">
                    <Lightbulb size={12} />
                    Recommendations
                  </p>
                  <ul className="space-y-1">
                    {msg.recommendations.map((rec, j) => (
                      <li key={j} className="text-xs text-secondary">
                        • {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}

        {mutation.isPending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <Brain size={16} className="animate-pulse" />
            </div>
            <div className="p-4 rounded-xl bg-surface border border-border">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask MetalMind anything about your fleet..."
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={mutation.isPending || !query.trim()}
          className="btn btn-primary"
        >
          {mutation.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </div>
  );
}
