"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { runCommand, fetchNodes, fetchContainers, getExecutionHistory } from "@/lib/api";
import { 
  Send, PlayCircle, Clock, CheckCircle, XCircle, 
  Server, Box, ChevronDown, ChevronUp, ShieldCheck, Loader2, Terminal, RefreshCw, Trash2
} from "lucide-react";

type TargetType = "nodes" | "containers";

interface Node {
  hostname: string;
  status: string;
}

interface Container {
  id: string;
  name: string;
  state: string;
}

interface StreamingLine {
  hostname: string;
  line: string;
  is_stderr: boolean;
  timestamp: string;
}

interface CommandEntry {
  id: string;
  command: string;
  status: "pending" | "running" | "completed" | "failed";
  timestamp: string;
  targetType: string;
  targets: string[];
  results: NodeResult[];
}

interface NodeResult {
  hostname: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export function ShellPanel() {
  const [command, setCommand] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("containers");
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedContainers, setSelectedContainers] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<"parallel" | "serial" | "rolling">("parallel");
  const [sudo, setSudo] = useState(false);
  const [timeout, setTimeout] = useState(30);
  const [history, setHistory] = useState<CommandEntry[]>([]);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [isOutputVisible, setIsOutputVisible] = useState(false);
  const [streamingOutput, setStreamingOutput] = useState<StreamingLine[]>([]);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Fetch nodes
  const { data: nodesData } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => fetchNodes(),
  });

  // Fetch containers
  const { data: containersData } = useQuery({
    queryKey: ["containers"],
    queryFn: () => fetchContainers(),
  });

  // Load persisted execution history on mount
  const { data: historyData } = useQuery({
    queryKey: ["executionHistory"],
    queryFn: () => getExecutionHistory(),
    staleTime: 30000,
  });

  // Initialize history from persisted data on first load
  useEffect(() => {
    if (historyData?.executions && history.length === 0) {
      const persistedHistory: CommandEntry[] = historyData.executions.slice(0, 10).map((exec: any) => ({
        id: exec.id,
        command: exec.command,
        status: exec.status === "completed" ? "completed" : exec.status === "failed" ? "failed" : "pending",
        timestamp: exec.started_at || new Date().toISOString(),
        targetType: exec.target_nodes?.length > 0 ? "nodes" : "containers",
        targets: exec.target_nodes || [],
        results: (exec.results || []).map((r: any) => ({
          hostname: r.hostname || r.node_hostname || "unknown",
          exitCode: r.exit_code ?? 0,
          stdout: r.stdout || "",
          stderr: r.stderr || "",
          duration: r.duration_ms || 0,
        })),
      }));
      setHistory(persistedHistory);
    }
  }, [historyData]);

  const nodes: Node[] = nodesData?.nodes || [];
  const containers: Container[] = (containersData?.containers || []).filter(
    (c: Container) => c.state === "running"
  );

  const mutation = useMutation({
    mutationFn: runCommand,
    onSuccess: (data) => {
      const savedCommand = command;
      setCommand("");
      
      // If status is "streaming", connect WebSocket for real-time output
      if (data.status === "streaming") {
        startStreaming(data.execution_id, savedCommand, selectedNodes);
      } else {
        // Container commands or completed - add to history with results
        const entry: CommandEntry = {
          id: data.execution_id,
          command: savedCommand,
          status: data.status === "completed" ? "completed" : data.status === "failed" || data.status === "no_responses" ? "failed" : "running",
          timestamp: new Date().toISOString(),
          targetType: data.target_type || targetType,
          targets: targetType === "containers" ? selectedContainers : selectedNodes,
          results: data.results?.map((r: any) => ({
            hostname: r.hostname || r.container || "unknown",
            exitCode: r.exit_code ?? 0,
            stdout: r.stdout || r.output || "",
            stderr: r.stderr || r.error || "",
            duration: r.duration_ms || 0,
          })) || [],
        };
        setHistory((prev) => [entry, ...prev]);
      }
    },
  });

  // Start WebSocket streaming for an execution
  const startStreaming = (executionId: string, cmd: string, targets: string[]) => {
    setIsStreaming(true);
    setIsOutputVisible(true);
    setCurrentExecutionId(executionId);
    setStreamingOutput([]);
    
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.hostname}:8080/api/v1/exec/${executionId}/stream`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "complete") {
          // Command completed - stop spinner but keep window open
          setIsStreaming(false);
          const result = data.data;
          const entry: CommandEntry = {
            id: executionId,
            command: cmd,
            status: result.exit_code === 0 ? "completed" : "failed",
            timestamp: new Date().toISOString(),
            targetType: "nodes",
            targets: targets,
            results: [{
              hostname: result.hostname,
              exitCode: result.exit_code,
              stdout: result.stdout,
              stderr: result.stderr,
              duration: result.duration_ms || 0,
            }],
          };
          setHistory((prev) => [entry, ...prev]);
          
          // If we received no streaming lines (fast command), populate from result
          setStreamingOutput((prev) => {
            if (prev.length === 0 && (result.stdout || result.stderr)) {
              const lines: StreamingLine[] = [];
              if (result.stdout) {
                result.stdout.split('\n').forEach((line: string) => {
                  if (line) lines.push({
                    hostname: result.hostname,
                    line: line,
                    is_stderr: false,
                    timestamp: new Date().toISOString()
                  });
                });
              }
              if (result.stderr) {
                result.stderr.split('\n').forEach((line: string) => {
                  if (line) lines.push({
                    hostname: result.hostname,
                    line: line,
                    is_stderr: true,
                    timestamp: new Date().toISOString()
                  });
                });
              }
              return lines;
            }
            return prev;
          });
          
        } else if (data.type === "timeout") {
          setIsStreaming(false);
          setStreamingOutput((prev) => [...prev, {
            hostname: "system",
            line: "⚠️ Execution timeout",
            is_stderr: true,
            timestamp: new Date().toISOString(),
          }]);
        } else if (data.line !== undefined) {
          // Streaming output line
          setStreamingOutput((prev) => [...prev, {
            hostname: data.hostname,
            line: data.line,
            is_stderr: data.is_stderr,
            timestamp: data.timestamp,
          }]);
          // Auto-scroll
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };
    
    ws.onerror = () => {
      setIsStreaming(false);
      setStreamingOutput((prev) => [...prev, {
        hostname: "system",
        line: "❌ WebSocket connection error",
        is_stderr: true,
        timestamp: new Date().toISOString(),
      }]);
    };
    
    ws.onclose = () => {
      setIsStreaming(false);
      wsRef.current = null;
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const targets = targetType === "containers" ? selectedContainers : selectedNodes;
    
    mutation.mutate({
      command: command.trim(),
      nodes: targetType === "nodes" ? targets : undefined,
      containers: targetType === "containers" ? targets : undefined,
      strategy,
      sudo,
      timeout_secs: timeout,
    });
  };

  const toggleTarget = (id: string) => {
    if (targetType === "containers") {
      setSelectedContainers(prev => 
        prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      );
    } else {
      setSelectedNodes(prev => 
        prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]
      );
    }
  };

  const selectAll = () => {
    if (targetType === "containers") {
      setSelectedContainers(containers.map(c => c.id));
    } else {
      setSelectedNodes(nodes.map(n => n.hostname));
    }
  };

  const clearSelection = () => {
    if (targetType === "containers") {
      setSelectedContainers([]);
    } else {
      setSelectedNodes([]);
    }
  };

  const currentSelection = targetType === "containers" ? selectedContainers : selectedNodes;
  const currentItems = targetType === "containers" 
    ? containers.map(c => ({ id: c.id, name: c.name }))
    : nodes.map(n => ({ id: n.hostname, name: n.hostname }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-glow-blue relative overflow-hidden">
          <Terminal size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-200 to-teal-400">HiveShell</h1>
          <p className="text-sm text-secondary/80">
            Execute commands across your fleet
          </p>
        </div>
      </div>

      {/* Command Input Card */}
      <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6 bg-gradient-to-b from-white/5 to-transparent">
        {/* Target Type Selector */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-secondary">Target Type</label>
            <div className="p-1 rounded-lg bg-black/40 border border-white/5 flex">
              <button
                type="button"
                onClick={() => setTargetType("containers")}
                className={`text-xs py-1.5 px-4 rounded-md flex items-center gap-2 transition-all ${
                  targetType === "containers" 
                    ? "bg-emerald-500 text-white shadow-lg" 
                    : "text-secondary hover:text-white"
                }`}
              >
                <Box size={14} /> Containers
              </button>
              <button
                type="button"
                onClick={() => setTargetType("nodes")}
                className={`text-xs py-1.5 px-4 rounded-md flex items-center gap-2 transition-all ${
                  targetType === "nodes" 
                    ? "bg-emerald-500 text-white shadow-lg" 
                    : "text-secondary hover:text-white"
                }`}
              >
                <Server size={14} /> Nodes
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-white/10 hidden md:block" />

          {/* Target Selection Dropdown */}
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setShowTargetDropdown(!showTargetDropdown)}
              className={`w-full text-left px-4 py-2 rounded-xl border transition-all flex items-center justify-between group ${
                showTargetDropdown 
                  ? "bg-white/10 border-emerald-500/50" 
                  : "bg-black/20 border-white/10 hover:border-white/20 hover:bg-black/30"
              }`}
            >
              <span className={`text-sm ${currentSelection.length > 0 ? "text-emerald-300" : "text-muted"}`}>
                {currentSelection.length === 0 
                  ? `Select ${targetType}...` 
                  : `${currentSelection.length} ${targetType} selected`}
              </span>
              {showTargetDropdown ? <ChevronUp size={16} className="text-emerald-400" /> : <ChevronDown size={16} className="text-secondary group-hover:text-white" />}
            </button>

            {showTargetDropdown && (
              <div className="absolute z-20 w-full mt-2 glass-card-intense overflow-hidden animate-scale-in origin-top">
                <div className="p-3 border-b border-white/5 bg-white/5 flex gap-3">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-white/5 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-secondary hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {currentItems.map((item) => (
                    <label
                      key={item.id}
                      onClick={() => toggleTarget(item.id)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 cursor-pointer group transition-colors select-none"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        currentSelection.includes(item.id)
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-white/20 group-hover:border-white/40"
                      }`}>
                        {currentSelection.includes(item.id) && <CheckCircle size={12} className="text-white" />}
                      </div>
                      <span className={`text-sm font-mono truncate transition-colors ${
                         currentSelection.includes(item.id) ? "text-white" : "text-secondary group-hover:text-white"
                      }`}>{item.name}</span>
                    </label>
                  ))}
                  {currentItems.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted">
                      No {targetType} available
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Strategy & Options Row */}
        <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-3">
            <label className="text-xs uppercase tracking-wider font-semibold text-secondary/70">Strategy</label>
            <div className="flex bg-black/20 p-1 rounded-lg">
              {(["parallel", "serial", "rolling"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategy(s)}
                  className={`text-xs py-1 px-3 rounded-md capitalize transition-all ${
                    strategy === s 
                      ? "bg-white/10 text-white shadow-sm" 
                      : "text-muted hover:text-secondary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="h-6 w-px bg-white/10 hidden sm:block" />

          <button
            type="button"
            onClick={() => setSudo(!sudo)}
            className={`text-xs py-1.5 px-3 rounded-lg border flex items-center gap-2 transition-all ${
              sudo 
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-glow-yellow" 
                : "border-white/10 text-secondary hover:border-white/20 hover:text-white"
            }`}
          >
            <ShieldCheck size={14} />
            Sudo Privileges
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-secondary">Timeout</label>
            <div className="relative">
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout(parseInt(e.target.value) || 30)}
                className="w-16 bg-black/20 border border-white/10 rounded-md py-1 px-2 text-right text-sm focus:border-emerald-500/50 outline-none transition-colors"
                min={1}
                max={300}
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted">s</span>
            </div>
          </div>
        </div>

        {/* Command Input */}
        <div className="relative group">
           <div className="absolute inset-x-0 bottom-0 top-1/2 bg-emerald-500/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
           <div className="flex gap-0 rounded-xl overflow-hidden shadow-lg border border-white/10 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
            <div className="bg-black/40 px-4 flex items-center border-r border-white/5">
              <span className="text-emerald-400 font-mono text-lg animate-pulse">$</span>
            </div>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter command..."
              className="flex-1 bg-black/40 text-white px-4 py-3 font-mono text-sm outline-none placeholder:text-white/20"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={mutation.isPending || !command.trim() || currentSelection.length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {mutation.isPending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <PlayCircle size={18} />
                  Run
                </>
              )}
            </button>
           </div>
        </div>

        {currentSelection.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Select at least one {targetType.slice(0, -1)} to execute the command
          </div>
        )}
      </form>

      {/* Streaming Output (shown while command is running on nodes) */}
      {isOutputVisible && (
        <div className="glass-card overflow-hidden border-emerald-500/20 shadow-glow-blue animate-fade-in">
          <div className="flex items-center gap-3 p-3 bg-white/5 border-b border-white/5">
            {isStreaming ? (
               <Loader2 size={16} className="text-emerald-400 animate-spin" />
            ) : (
               <div className="w-2 h-2 rounded-full bg-gray-500" />
            )}
            <h3 className="text-sm font-semibold text-emerald-300">
               {isStreaming ? "Live Output Stream" : "Execution Finished"}
            </h3>
            <div className="ml-auto flex items-center gap-3">
               <span className="text-xs font-mono text-muted bg-white/5 px-2 py-0.5 rounded">
               ID: {currentExecutionId?.slice(0, 8)}
               </span>
               <button 
                  onClick={() => setIsOutputVisible(false)}
                  className="p-1 hover:bg-white/10 rounded-lg text-secondary hover:text-white transition-colors"
                  title="Close Output"
               >
                  <XCircle size={18} />
               </button>
            </div>
          </div>
          <div 
            ref={outputRef}
            className="bg-[#0c0c0c] p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-1 custom-scrollbar min-h-[100px]"
          >
            {streamingOutput.length === 0 ? (
              <span className="text-muted italic opacity-50">Waiting for output...</span>
            ) : (
              streamingOutput.map((line, idx) => (
                <div key={idx} className={`flex gap-3 ${line.is_stderr ? 'text-red-400' : 'text-emerald-100/90'}`}>
                  <span className="text-white/30 w-24 shrink-0 text-right truncate text-[10px] mt-0.5">[{line.hostname}]</span>
                  <span className="break-all border-l border-white/10 pl-3">{line.line}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Execution History */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock size={18} className="text-emerald-400" />
          Execution History
        </h2>
        
        {history.length === 0 ? (
          <div className="glass-panel text-center py-12 border-dashed border-white/10">
            <Terminal className="mx-auto text-white/10 mb-4" size={48} />
            <p className="text-muted">No commands executed yet</p>
          </div>
        ) : (
          history.map((entry) => (
            <ExecutionEntry key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function ExecutionEntry({ entry }: { entry: CommandEntry }) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    pending: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", label: "Pending" },
    running: { icon: Loader2, color: "text-blue-400 animate-spin", bg: "bg-blue-500/10 border-blue-500/20", label: "Running" },
    completed: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Success" },
    failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", label: "Failed" },
  };

  const config = statusConfig[entry.status];
  const Icon = config.icon;

  return (
    <div className={`glass-card transition-all duration-300 ${expanded ? 'bg-white/10 border-white/20' : 'hover:bg-white/5'}`}>
      <div
        className="flex items-center gap-4 cursor-pointer p-1"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`p-2 rounded-lg ${config.bg}`}>
          <Icon size={18} className={config.color} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
             <code className="text-sm font-mono text-emerald-200 bg-black/30 px-2 py-0.5 rounded break-all truncate max-w-md">
               {entry.command}
             </code>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              {entry.targetType === 'nodes' ? <Server size={12} /> : <Box size={12} />}
              {entry.targets.length} targets
            </span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>{new Date(entry.timestamp).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {!expanded && entry.status === 'completed' && (
             <span className="text-xs text-emerald-400/80 hidden sm:inline-block">Click to view output</span>
           )}
           <ChevronDown size={16} className={`text-muted transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && entry.results.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-3 animate-slide-in">
          {entry.results.map((result, idx) => (
            <div key={idx} className="bg-black/30 rounded-lg overflow-hidden border border-white/5 text-xs font-mono">
              <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/5">
                {result.exitCode === 0 ? (
                  <CheckCircle className="text-emerald-400" size={12} />
                ) : (
                  <XCircle className="text-red-400" size={12} />
                )}
                <span className="font-medium text-secondary">{result.hostname}</span>
                <span className={`ml-auto px-1.5 rounded ${result.exitCode === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  exit: {result.exitCode}
                </span>
              </div>
              <div className="p-3 overflow-x-auto">
                {result.stdout && (
                  <div className="text-emerald-100/90 whitespace-pre-wrap">{result.stdout}</div>
                )}
                {result.stderr && (
                  <div className="text-red-300/90 whitespace-pre-wrap mt-2 pt-2 border-t border-white/10">{result.stderr}</div>
                )}
                {!result.stdout && !result.stderr && (
                  <span className="text-white/20 italic">No output</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
