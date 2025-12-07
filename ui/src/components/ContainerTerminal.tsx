"use client";

import { useEffect, useRef, useState } from "react";
import { DraggableWindow } from "@/components/ui/DraggableWindow";

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

    return () => {
      ws.close();
      term.dispose();
    };
  }, [isReady, containerId, containerName]);

  // Handle resize with ResizeObserver
  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      // Small delay to ensure layout is done
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (e) {
          // Ignore fit errors if terminal is not ready
        }
      });
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isReady]); // Re-run when terminal is ready

  return (
    <DraggableWindow
      title={`${containerName} - Shell`}
      initialWidth={800}
      initialHeight={500}
      onClose={onClose}
      headerRight={
        <div className="flex items-center gap-1.5 mr-2">
          <div className="w-2 h-2 rounded-full bg-red-500/50" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
          <div className="w-2 h-2 rounded-full bg-green-500/50" />
        </div>
      }
    >
      <div className="w-full h-full bg-[#0f0f0f] p-1">
        {error ? (
          <div className="flex items-center justify-center h-full text-red-400 font-mono text-sm">
            {error}
          </div>
        ) : !isReady ? (
          <div className="flex items-center justify-center h-full text-muted font-mono text-sm animate-pulse">
            Initializing terminal...
          </div>
        ) : (
          <div ref={terminalRef} className="w-full h-full" />
        )}
      </div>
    </DraggableWindow>
  );
}
