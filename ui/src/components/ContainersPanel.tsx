"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchContainers, startContainer, stopContainer, restartContainer, removeContainer, getContainerLogs, deployStack } from "@/lib/api";
import { Box, Play, Square, RefreshCw, Trash2, Terminal, X, Loader2, MonitorUp, Rocket } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ContainerTerminal } from "./ContainerTerminal";
import { DraggableWindow } from "@/components/ui/DraggableWindow";

interface ContainersPanelProps {
  selectedNode: string | null;
}

export function ContainersPanel({ selectedNode }: ContainersPanelProps) {
  const queryClient = useQueryClient();
  const [logsModal, setLogsModal] = useState<{ id: string; name: string; logs: string } | null>(null);
  const [shellModal, setShellModal] = useState<{ id: string; name: string } | null>(null);
  const [deployModal, setDeployModal] = useState(false);
  const [stackName, setStackName] = useState("");
  const [composeYaml, setComposeYaml] = useState(`version: '3.8'
services:
  example:
    image: nginx:alpine
    ports:
      - "8888:80"
`);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ success: boolean; message: string; output?: string } | null>(null);
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["containers", selectedNode],
    queryFn: () => fetchContainers(selectedNode),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const containers = data?.containers || [];

  const handleDeployStack = async () => {
    if (!stackName.trim()) {
      alert("Please enter a stack name");
      return;
    }
    
    setDeploying(true);
    setDeployResult(null);
    
    try {
      const result = await deployStack({
        name: stackName,
        compose_yaml: composeYaml,
      });
      setDeployResult({ success: true, message: result.message, output: result.output });
      // Refresh containers after deployment
      setTimeout(() => refetch(), 2000);
    } catch (err: any) {
      setDeployResult({ success: false, message: err.message || "Deployment failed" });
    }
    
    setDeploying(false);
  };

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
          <button onClick={() => setDeployModal(true)} className="btn btn-primary">
            <Rocket size={16} />
            Deploy Stack
          </button>
        </div>
      </div>

      {/* Container List */}
      <div className="space-y-3">
        {/* Header - Hidden on mobile, visible on desktop */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
          <div className="col-span-4">Container</div>
          <div className="col-span-2">Image</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2">Node</div>
          <div className="col-span-3 text-right">Actions</div>
        </div>

        {containers.length === 0 ? (
          <div className="card text-center py-12">
            <Box className="mx-auto text-muted mb-4" size={48} />
            <p className="text-lg font-medium">No containers found</p>
            <p className="text-sm text-muted mt-2">
              Deploy a stack to get started
            </p>
          </div>
        ) : (
          containers.map((container: any) => (
            <ContainerCard 
              key={container.id} 
              container={container} 
              onRefetch={refetch}
              onShowLogs={(id, name, logs) => setLogsModal({ id, name, logs })}
              onOpenShell={(id, name) => setShellModal({ id, name })}
            />
          ))
        )}
      </div>

      {/* Logs Modal */}
      {logsModal && (
        <DraggableWindow
          title={`Logs: ${logsModal.name}`}
          initialWidth={800}
          initialHeight={600}
          onClose={() => setLogsModal(null)}
        >
          <LogViewer logs={logsModal.logs} />
        </DraggableWindow>
      )}

      {/* Shell Terminal Modal */}
      {shellModal && (
        <ContainerTerminal
          containerId={shellModal.id}
          containerName={shellModal.name}
          onClose={() => setShellModal(null)}
        />
      )}

      {/* Deploy Stack Modal */}
      {deployModal && (
        <DraggableWindow
          title="Deploy Stack"
          initialWidth={700}
          initialHeight={600}
          onClose={() => {
            setDeployModal(false);
            setDeployResult(null);
          }}
        >
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Stack Name</label>
              <input
                type="text"
                value={stackName}
                onChange={(e) => setStackName(e.target.value)}
                placeholder="my-stack"
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Docker Compose YAML</label>
              <textarea
                value={composeYaml}
                onChange={(e) => setComposeYaml(e.target.value)}
                className="w-full h-64 px-3 py-2 bg-surface border border-border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="version: '3.8'
services:
  ..."
              />
            </div>
            
            {deployResult && (
              <div className={`p-3 rounded-lg ${deployResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                <p className={`font-medium ${deployResult.success ? 'text-green-400' : 'text-red-400'}`}>
                  {deployResult.success ? '✅ ' : '❌ '}{deployResult.message}
                </p>
                {deployResult.output && (
                  <pre className="mt-2 text-xs text-muted overflow-auto max-h-32">{deployResult.output}</pre>
                )}
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeployModal(false);
                  setDeployResult(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDeployStack}
                disabled={deploying || !stackName.trim() || !composeYaml.trim()}
                className="btn btn-primary"
              >
                {deploying ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket size={16} />
                    Deploy
                  </>
                )}
              </button>
            </div>
          </div>
        </DraggableWindow>
      )}
    </div>
  );
}


function ContainerCard({ 
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

  const isRunning = container.state === "running";

  return (
    <div className={`card p-0 overflow-hidden transition-all duration-300 group
      ${isRunning 
        ? "hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)]" 
        : "border-red-500/20 bg-red-500/5 hover:border-red-500/50 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]"
      }`}
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 items-center">
        
        {/* Name & ID */}
        <div className="col-span-1 md:col-span-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
            <Box size={20} className="text-blue-400 group-hover:text-blue-300 transition-colors" />
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate text-base">{container.name}</p>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="font-mono bg-surface-hover px-1.5 py-0.5 rounded">{container.id?.slice(0, 12)}</span>
            </div>
          </div>
        </div>

        {/* Image */}
        <div className="col-span-1 md:col-span-2">
           <span className="text-sm text-secondary truncate block" title={container.image}>
            {container.image}
           </span>
        </div>

        {/* Status */}
        <div className="col-span-1 md:col-span-1">
          <span className={`badge ${container.state === "running" ? "badge-success" : "badge-danger"}`}>
            {container.state}
          </span>
        </div>

        {/* Node */}
        <div className="col-span-1 md:col-span-2">
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <MonitorUp size={14} />
            <span>{container.node || "--"}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="col-span-1 md:col-span-3 flex items-center justify-start md:justify-end gap-1">
          <button 
            onClick={() => handleAction("start", startContainer)}
            disabled={loading !== null}
            className="btn-ghost p-2 rounded-lg text-green-400 hover:bg-green-500/10 disabled:opacity-50 transition-colors" 
            title="Start"
          >
            {loading === "start" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          </button>
          <button 
            onClick={() => handleAction("stop", stopContainer)}
            disabled={loading !== null}
            className="btn-ghost p-2 rounded-lg text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50 transition-colors" 
            title="Stop"
          >
            {loading === "stop" ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
          </button>
          <button 
            onClick={() => handleAction("restart", restartContainer)}
            disabled={loading !== null}
            className="btn-ghost p-2 rounded-lg text-blue-400 hover:bg-blue-500/10 disabled:opacity-50 transition-colors" 
            title="Restart"
          >
            {loading === "restart" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
          <div className="w-px h-6 bg-border mx-1" />
          <button 
            onClick={() => onOpenShell(container.id, container.name)}
            disabled={loading !== null || container.state !== "running"}
            className="btn-ghost p-2 rounded-lg text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-50 transition-colors" 
            title="Shell"
          >
            <Terminal size={16} />
          </button>
          <button 
            onClick={handleLogs}
            disabled={loading !== null}
            className="btn-ghost p-2 rounded-lg text-purple-400 hover:bg-purple-500/10 disabled:opacity-50 transition-colors" 
            title="Logs"
          >
            {loading === "logs" ? <Loader2 size={16} className="animate-spin" /> : <MonitorUp size={16} />}
          </button>
          <div className="w-px h-6 bg-border mx-1" />
          <button 
            onClick={() => {
              if (confirm(`Are you sure you want to remove ${container.name}?`)) {
                handleAction("remove", removeContainer);
              }
            }}
            disabled={loading !== null}
            className="btn-ghost p-2 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors" 
            title="Remove"
          >
            {loading === "remove" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        </div>
      </div>
      
      {/* Ports Footer - Optional, visible if ports exist */}
      {container.ports && container.ports.length > 0 && (
        <div className="bg-surface-hover/50 px-4 py-2 border-t border-border flex items-center gap-2 text-xs font-mono text-muted">
          <span className="text-secondary">Ports:</span>
          {container.ports.join(", ")}
        </div>
      )}
    </div>
  );
}

function LogViewer({ logs }: { logs: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on mount
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div ref={viewportRef} className="p-4 h-full overflow-auto text-xs font-mono text-secondary whitespace-pre-wrap">
      {logs || "No logs available"}
    </div>
  );
}
