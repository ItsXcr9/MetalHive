"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { runCommand, fetchNodes, fetchContainers } from "@/lib/api";
import { 
  Send, PlayCircle, Clock, CheckCircle, XCircle, 
  Server, Box, ChevronDown, ChevronUp, ShieldCheck
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

  const nodes: Node[] = nodesData?.nodes || [];
  const containers: Container[] = (containersData?.containers || []).filter(
    (c: Container) => c.state === "running"
  );

  const mutation = useMutation({
    mutationFn: runCommand,
    onSuccess: (data) => {
      const entry: CommandEntry = {
        id: data.execution_id,
        command: command,
        status: data.status === "completed" ? "completed" : "running",
        timestamp: new Date().toISOString(),
        targetType: data.target_type || targetType,
        targets: targetType === "containers" ? selectedContainers : selectedNodes,
        results: data.results?.map(r => ({
          hostname: r.container,
          exitCode: r.exit_code || 0,
          stdout: r.output || "",
          stderr: r.error || "",
          duration: 0,
        })) || [],
      };
      setHistory((prev) => [entry, ...prev]);
      setCommand("");
    },
  });

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
      <div>
        <h1 className="text-2xl font-bold">HiveShell</h1>
        <p className="text-sm text-muted mt-1">
          Execute commands across your fleet - nodes or containers
        </p>
      </div>

      {/* Command Input Card */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        {/* Target Type Selector */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">Target:</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTargetType("containers")}
              className={`btn text-xs py-1.5 px-3 flex items-center gap-2 ${
                targetType === "containers" ? "btn-primary" : "btn-secondary"
              }`}
            >
              <Box size={14} /> Containers
            </button>
            <button
              type="button"
              onClick={() => setTargetType("nodes")}
              className={`btn text-xs py-1.5 px-3 flex items-center gap-2 ${
                targetType === "nodes" ? "btn-primary" : "btn-secondary"
              }`}
            >
              <Server size={14} /> Nodes
            </button>
          </div>
        </div>

        {/* Target Selection Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTargetDropdown(!showTargetDropdown)}
            className="w-full input flex items-center justify-between text-left"
          >
            <span className={currentSelection.length === 0 ? "text-muted" : ""}>
              {currentSelection.length === 0 
                ? `Select ${targetType}...` 
                : `${currentSelection.length} ${targetType} selected`}
            </span>
            {showTargetDropdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showTargetDropdown && (
            <div className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
              <div className="p-2 border-b border-border flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-muted hover:underline"
                >
                  Clear
                </button>
              </div>
              {currentItems.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={currentSelection.includes(item.id)}
                    onChange={() => toggleTarget(item.id)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-sm font-mono truncate">{item.name}</span>
                </label>
              ))}
              {currentItems.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted">
                  No {targetType} available
                </div>
              )}
            </div>
          )}
        </div>

        {/* Strategy & Options Row */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Strategy:</label>
            <div className="flex gap-1">
              {(["parallel", "serial", "rolling"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategy(s)}
                  className={`btn text-xs py-1 px-2 capitalize ${
                    strategy === s ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSudo(!sudo)}
              className={`btn text-xs py-1.5 px-3 flex items-center gap-2 ${
                sudo ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50" : "btn-secondary"
              }`}
            >
              <ShieldCheck size={14} />
              Sudo
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">Timeout:</label>
            <input
              type="number"
              value={timeout}
              onChange={(e) => setTimeout(parseInt(e.target.value) || 30)}
              className="input w-20 text-center text-sm py-1"
              min={1}
              max={300}
            />
            <span className="text-sm text-muted">sec</span>
          </div>
        </div>

        {/* Command Input */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-mono">$</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter command..."
              className="input pl-8 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={mutation.isPending || !command.trim() || currentSelection.length === 0}
            className="btn btn-primary"
          >
            {mutation.isPending ? (
              <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <>
                <PlayCircle size={18} />
                Execute
              </>
            )}
          </button>
        </div>

        {currentSelection.length === 0 && (
          <p className="text-xs text-yellow-400">⚠️ Select at least one {targetType.slice(0, -1)} to execute the command</p>
        )}
      </form>

      {/* Execution History */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Execution History</h2>
        
        {history.length === 0 ? (
          <div className="card text-center py-12">
            <Clock className="mx-auto text-muted mb-4" size={48} />
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

function ExecutionEntry({ entry }: { entry: CommandEntry }) {
  const [expanded, setExpanded] = useState(true);

  const statusIcon = {
    pending: <Clock className="text-yellow-400" size={18} />,
    running: <div className="animate-spin h-4 w-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full" />,
    completed: <CheckCircle className="text-green-400" size={18} />,
    failed: <XCircle className="text-red-400" size={18} />,
  };

  return (
    <div className="card">
      <div
        className="flex items-center gap-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {statusIcon[entry.status]}
        <div className="flex-1">
          <p className="font-mono text-sm">{entry.command}</p>
          <p className="text-xs text-muted">
            {entry.targetType}: {entry.targets.length} targets • {new Date(entry.timestamp).toLocaleString()}
          </p>
        </div>
        <span className={`badge ${
          entry.status === "completed" ? "badge-success" :
          entry.status === "failed" ? "badge-danger" :
          entry.status === "running" ? "badge-info" :
          "badge-warning"
        }`}>
          {entry.status}
        </span>
      </div>

      {expanded && entry.results.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          {entry.results.map((result, idx) => (
            <div key={idx} className="terminal">
              <div className="flex items-center gap-2 mb-2">
                {result.exitCode === 0 ? (
                  <CheckCircle className="text-green-400" size={14} />
                ) : (
                  <XCircle className="text-red-400" size={14} />
                )}
                <span className="text-sm font-medium font-mono">{result.hostname}</span>
                <span className="text-xs text-muted">(exit: {result.exitCode})</span>
              </div>
              {result.stdout && (
                <pre className="terminal-output text-sm whitespace-pre-wrap">{result.stdout}</pre>
              )}
              {result.stderr && (
                <pre className="terminal-error text-sm whitespace-pre-wrap">{result.stderr}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
