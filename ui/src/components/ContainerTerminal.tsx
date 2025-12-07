"use client";

import { useEffect, useRef, useState } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";

// Dynamic import for xterm to avoid SSR issues
let Terminal: any = null;
let FitAddon: any = null;

interface ContainerTerminalProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export function ContainerTerminal({ containerId, containerName, onClose }: ContainerTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terminalInstance = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<any>(null);

  useEffect(() => {
    // Dynamically import xterm modules
    const loadXterm = async () => {
      try {
        const xtermModule = await import("@xterm/xterm");
        const fitModule = await import("@xterm/addon-fit");
        Terminal = xtermModule.Terminal;
        FitAddon = fitModule.FitAddon;
        setIsReady(true);
      } catch (err) {
        setError("Failed to load terminal");
        console.error("Failed to load xterm:", err);
      }
    };
    loadXterm();
  }, []);

  useEffect(() => {
    if (!isReady || !terminalRef.current || !Terminal || !FitAddon) return;

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#0f0f0f",
        foreground: "#e0e0e0",
        cursor: "#10b981",
        selection: "rgba(16, 185, 129, 0.3)",
        black: "#000000",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#6272a4",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#f8f8f2",
      },
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    terminalInstance.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to WebSocket
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
    const ws = new WebSocket(`${wsUrl}/api/v1/containers/${containerId}/exec`);
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln(`\x1b[1;32mConnected to ${containerName}\x1b[0m`);
      term.writeln(`\x1b[0;90mType 'exit' to close the session\x1b[0m`);
      term.writeln("");
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onerror = () => {
      term.writeln("\x1b[1;31mConnection error\x1b[0m");
      setError("Connection error");
    };

    ws.onclose = () => {
      term.writeln("\x1b[0;90m\nSession closed\x1b[0m");
    };

    // Handle user input
    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);

    // Focus terminal
    term.focus();

    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
    };
  }, [isReady, containerId, containerName]);

  // Refit on fullscreen change
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current.fit(), 100);
    }
  }, [isFullscreen]);

  return (
    <div 
      className={`fixed z-50 ${
        isFullscreen 
          ? "inset-0" 
          : "bottom-0 right-0 w-[800px] h-[500px] m-4"
      } bg-[#0f0f0f] rounded-lg border border-border shadow-2xl flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-2 text-sm font-medium">
            {containerName} - Shell
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-ghost p-1.5 rounded hover:bg-surface-hover"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 rounded hover:bg-red-500/20 text-red-400"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 p-2 overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full text-red-400">
            {error}
          </div>
        ) : !isReady ? (
          <div className="flex items-center justify-center h-full text-muted">
            Loading terminal...
          </div>
        ) : (
          <div ref={terminalRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
