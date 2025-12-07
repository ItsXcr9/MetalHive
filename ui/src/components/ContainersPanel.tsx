"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchContainers, startContainer, stopContainer, restartContainer, removeContainer, getContainerLogs } from "@/lib/api";
import { Box, Play, Square, RefreshCw, Trash2, Terminal, X, Loader2, MonitorUp } from "lucide-react";
import { useState } from "react";
import { ContainerTerminal } from "./ContainerTerminal";

interface ContainersPanelProps {
  selectedNode: string | null;
}

export function ContainersPanel({ selectedNode }: ContainersPanelProps) {
  const queryClient = useQueryClient();
  const [logsModal, setLogsModal] = useState<{ id: string; name: string; logs: string } | null>(null);
  const [shellModal, setShellModal] = useState<{ id: string; name: string } | null>(null);
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["containers", selectedNode],
    queryFn: () => fetchContainers(selectedNode),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const containers = data?.containers || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Containers</h1>
          <p className="text-sm text-muted mt-1">
            {selectedNode ? `Showing containers on ${selectedNode}` : "Showing all containers"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn btn-secondary">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="btn btn-primary">+ Deploy Stack</button>
        </div>
      </div>

      {/* Container Table */}
      <div className="card overflow-hidden p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Container</th>
              <th>Image</th>
              <th>Status</th>
              <th>Node</th>
              <th>Ports</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {containers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12">
                  <Box className="mx-auto text-muted mb-4" size={48} />
                  <p className="text-lg font-medium">No containers found</p>
                  <p className="text-sm text-muted mt-2">
                    Deploy a stack to get started
                  </p>
                </td>
              </tr>
            ) : (
              containers.map((container: any) => (
                <ContainerRow 
                  key={container.id} 
                  container={container} 
                  onRefetch={refetch}
                  onShowLogs={(id, name, logs) => setLogsModal({ id, name, logs })}
                  onOpenShell={(id, name) => setShellModal({ id, name })}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Logs Modal */}
      {logsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setLogsModal(null)}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">Logs: {logsModal.name}</h3>
              <button onClick={() => setLogsModal(null)} className="btn-ghost p-1.5 rounded">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh]">
              <pre className="text-xs font-mono text-secondary whitespace-pre-wrap">{logsModal.logs || "No logs available"}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Shell Terminal Modal */}
      {shellModal && (
        <ContainerTerminal
          containerId={shellModal.id}
          containerName={shellModal.name}
          onClose={() => setShellModal(null)}
        />
      )}
    </div>
  );
}

function ContainerRow({ 
  container, 
  onRefetch,
  onShowLogs,
  onOpenShell
}: { 
  container: any;
  onRefetch: () => void;
  onShowLogs: (id: string, name: string, logs: string) => void;
  onOpenShell: (id: string, name: string) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: string, apiFn: (id: string) => Promise<any>) => {
    setLoading(action);
    try {
      await apiFn(container.id);
      // Wait a bit for container state to change
      setTimeout(() => {
        onRefetch();
        setLoading(null);
      }, 1000);
    } catch (err) {
      console.error(`Failed to ${action} container:`, err);
      setLoading(null);
      alert(`Failed to ${action} container`);
    }
  };

  const handleLogs = async () => {
    setLoading("logs");
    try {
      const result = await getContainerLogs(container.id);
      onShowLogs(container.id, container.name, result.logs);
    } catch (err) {
      console.error("Failed to get logs:", err);
      alert("Failed to get logs");
    }
    setLoading(null);
  };

  return (
    <tr>
      <td>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-surface-hover flex items-center justify-center">
            <Box size={16} className="text-blue-400" />
          </div>
          <div>
            <p className="font-medium">{container.name}</p>
            <p className="text-xs text-muted">{container.id?.slice(0, 12)}</p>
          </div>
        </div>
      </td>
      <td>
        <span className="text-sm">{container.image}</span>
      </td>
      <td>
        <span className={`badge ${container.state === "running" ? "badge-success" : "badge-danger"}`}>
          {container.state}
        </span>
      </td>
      <td>
        <span className="text-sm text-muted">{container.node || "--"}</span>
      </td>
      <td>
        <span className="text-sm font-mono text-muted">
          {container.ports?.join(", ") || "--"}
        </span>
      </td>
      <td>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => handleAction("start", startContainer)}
            disabled={loading !== null}
            className="btn-ghost p-1.5 rounded text-green-400 hover:bg-green-500/10 disabled:opacity-50" 
            title="Start"
          >
            {loading === "start" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
          <button 
            onClick={() => handleAction("stop", stopContainer)}
            disabled={loading !== null}
            className="btn-ghost p-1.5 rounded text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50" 
            title="Stop"
          >
            {loading === "stop" ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
          </button>
          <button 
            onClick={() => handleAction("restart", restartContainer)}
            disabled={loading !== null}
            className="btn-ghost p-1.5 rounded text-blue-400 hover:bg-blue-500/10 disabled:opacity-50" 
            title="Restart"
          >
            {loading === "restart" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button 
            onClick={handleLogs}
            disabled={loading !== null}
            className="btn-ghost p-1.5 rounded text-purple-400 hover:bg-purple-500/10 disabled:opacity-50" 
            title="Logs"
          >
            {loading === "logs" ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
          </button>
          <button 
            onClick={() => onOpenShell(container.id, container.name)}
            disabled={loading !== null || container.state !== "running"}
            className="btn-ghost p-1.5 rounded text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-50" 
            title="Shell"
          >
            <MonitorUp size={14} />
          </button>
          <button 
            onClick={() => {
              if (confirm(`Are you sure you want to remove ${container.name}?`)) {
                handleAction("remove", removeContainer);
              }
            }}
            disabled={loading !== null}
            className="btn-ghost p-1.5 rounded text-red-400 hover:bg-red-500/10 disabled:opacity-50" 
            title="Remove"
          >
            {loading === "remove" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </td>
    </tr>
  );
}
