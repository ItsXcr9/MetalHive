"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { askAI } from "@/lib/api";
import { Brain, Send, Sparkles, AlertTriangle, Lightbulb, Loader2, Bot, User, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/atom-one-dark.css"; // Import styles for code highlighting

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mutation = useMutation({
    mutationFn: askAI,
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant", // Logic for role
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

  const markdownComponents = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p: ({ ...props }: any) => <p className="mb-2 leading-relaxed" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ul: ({ ...props }: any) => <ul className="list-disc list-inside mb-2 space-y-1 ml-1" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ol: ({ ...props }: any) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-1" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    li: ({ ...props }: any) => <li className="text-secondary/90 pl-1 marker:text-indigo-400" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h1: ({ ...props }: any) => <h1 className="text-xl font-bold text-white mb-3 mt-4 first:mt-0 pb-2 border-b border-white/10" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h2: ({ ...props }: any) => <h2 className="text-lg font-bold text-white mb-2 mt-3" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h3: ({ ...props }: any) => <h3 className="text-base font-bold text-indigo-300 mb-2 mt-2" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    strong: ({ ...props }: any) => <strong className="text-white font-semibold" {...props} />,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      const isMultiLine = String(children).includes('\n');
      
      if (!inline && match) {
         return (
          <div className="relative group my-3 rounded-lg overflow-hidden border border-white/10 bg-[#282c34] shadow-lg">
            <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/5">
                 <span className="text-xs text-secondary/70 font-mono uppercase tracking-wider">{match[1]}</span>
            </div>
            <div className="p-3 overflow-x-auto text-sm font-mono">
                 <code className={className} {...props}>{children}</code>
            </div>
          </div>
         );
      }
      return (
          <code className={`${!inline ? 'block bg-[#282c34] p-2 rounded-lg' : 'bg-white/10 text-cyan-200 px-1.5 py-0.5 rounded'} text-xs font-mono`} {...props}>
            {children}
          </code>
      )
    }
  };


  if (compact) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {messages.slice(-3).map((msg, i) => (
            <div
              key={i}
              className={`text-sm p-3 rounded-lg border ${
                msg.role === "user" 
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-100 ml-4" 
                  : "bg-surface border-border text-secondary mr-4"
              }`}
            >
               <ReactMarkdown 
                remarkPlugins={[remarkGfm]} 
                rehypePlugins={[rehypeHighlight]}
                components={markdownComponents}
               >
                 {msg.content}
               </ReactMarkdown>
            </div>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask MetalMind..."
            className="input text-sm flex-1 pr-10"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="absolute right-1 top-1 p-1.5 rounded-md hover:bg-white/10 text-cyan-400 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] glass-card overflow-hidden relative">
      {/* Header */}
      <div className="p-6 border-b border-white/5 bg-white/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-glow-purple relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Brain size={24} className="text-white relative z-10" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              MetalMind AI
            </h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-sm text-indigo-200/70">Powered by Xcr9</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-optimized custom-scrollbar">
        {/* Quick Actions */}
        {messages.length === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8 animate-float">
            {[
              { icon: Sparkles, text: "Analyze fleet health", color: "text-amber-400" },
              { icon: AlertTriangle, text: "Why is memory high?", color: "text-red-400" },
              { icon: Brain, text: "Optimize my containers", color: "text-purple-400" },
              { icon: ShieldCheck, text: "Security recommendations", color: "text-emerald-400" },
            ].map((item) => (
              <button
                key={item.text}
                onClick={() => setQuery(item.text)}
                className="flex items-center gap-3 p-4 rounded-xl bg-surface border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all hover:scale-[1.02] group text-left"
              >
                <div className={`p-2 rounded-lg bg-white/5 ${item.color}`}>
                  <item.icon size={18} />
                </div>
                <span className="text-sm font-medium text-secondary group-hover:text-primary transition-colors">
                  {item.text}
                </span>
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""} fade-in`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg mt-1 ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-cyan-500 to-blue-600"
                  : "bg-gradient-to-br from-violet-600 to-indigo-600"
              }`}
            >
              {msg.role === "user" ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
            </div>
            
            <div
              className={`flex-1 max-w-[80%] space-y-2 ${
                msg.role === "user" ? "text-right" : ""
              }`}
            >
              <div
                className={`inline-block p-4 rounded-2xl shadow-md backdrop-blur-md ${
                  msg.role === "user"
                    ? "bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-sm"
                    : "bg-surface border border-white/10 text-secondary rounded-tl-sm w-full"
                }`}
              >
                {msg.role === "user" ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                ) : (
                    <div className="markdown-content text-sm">
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]} 
                            rehypePlugins={[rehypeHighlight]}
                            components={markdownComponents}
                        >
                            {msg.content}
                        </ReactMarkdown>
                    </div>
                )}
              </div>

              {msg.recommendations && msg.recommendations.length > 0 && (
                <div className="glass-panel p-4 rounded-xl border-l-4 border-l-amber-500/50 mt-2 text-left animate-slide-in">
                  <p className="text-xs font-bold text-amber-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                    <Lightbulb size={14} />
                    Strategic Recommendations
                  </p>
                  <ul className="space-y-2">
                    {msg.recommendations.map((rec, j) => (
                      <li key={j} className="text-sm text-secondary/90 flex items-start gap-2">
                        <span className="text-amber-500/70 mt-1.5 text-[10px]">●</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}

        {mutation.isPending && (
          <div className="flex gap-4 fade-in">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg">
              <Bot size={14} className="text-white animate-pulse" />
            </div>
            <div className="p-4 rounded-2xl rounded-tl-sm bg-surface border border-white/10 w-24 flex items-center justify-center">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white/5 border-t border-white/5 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex gap-2 p-1.5 bg-black/40 border border-white/10 rounded-xl focus-within:border-white/20 transition-colors">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask MetalMind anything about your fleet..."
              className="flex-1 bg-transparent border-none text-sm px-4 py-2.5 outline-none placeholder:text-muted/60"
            />
            <button
              type="submit"
              disabled={mutation.isPending || !query.trim()}
              className="px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50 disabled:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
            >
              {mutation.isPending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
