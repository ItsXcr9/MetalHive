"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchNodes, registerNode } from "@/lib/api";
import { Server, Cpu, HardDrive, MemoryStick, Plus, X, Copy, Check } from "lucide-react";

interface NodesPanelProps {
  selectedNode: string | null;
  onSelectNode: (node: string | null) => void;
}

export function NodesPanel({ selectedNode, onSelectNode }: NodesPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => fetchNodes(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-400">Failed to load nodes</p>
        <p className="text-sm text-muted mt-2">Please check your connection</p>
      </div>
    );
  }

  const nodes = data?.nodes || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Fleet Nodes</h1>
        <button 
          className="btn btn-primary flex items-center gap-2"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={18} /> Add Node
        </button>
      </div>

      {/* Node Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {nodes.length === 0 ? (
          <div className="col-span-full card text-center py-12">
            <Server className="mx-auto text-muted mb-4" size={48} />
            <p className="text-lg font-medium">No nodes registered</p>
            <p className="text-sm text-muted mt-2">
              Add a node to get started with MetalHive
            </p>
          </div>
        ) : (
          nodes.map((node: any) => (
            <NodeCard
              key={node.hostname}
              node={node}
              isSelected={selectedNode === node.hostname}
              onSelect={() => onSelectNode(node.hostname)}
            />
          ))
        )}
      </div>

      {/* Add Node Modal */}
      {showAddModal && (
        <AddNodeModal 
          onClose={() => setShowAddModal(false)} 
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["nodes"] });
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddNodeModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [hostname, setHostname] = useState("");
  const [ip, setIp] = useState("");
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: registerNode,
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname.trim()) return;
    mutation.mutate({ hostname: hostname.trim(), ip: ip.trim() });
  };

  // Controller URL for agent installation
  const controllerUrl = typeof window !== 'undefined' 
    ? `http://${window.location.hostname}:8080`
    : 'http://YOUR_CONTROLLER_IP:8080';

  const agentInstallScript = `# On your remote node, run:
curl -fsSL https://get.metalhive.io/agent | bash -s -- \\
  --controller ${controllerUrl} \\
  --hostname ${hostname || 'YOUR_HOSTNAME'}

# Or with Docker:
docker run -d --name metalhive-agent \\
  --privileged \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -e CONTROLLER_URL=${controllerUrl} \\
  -e HOSTNAME=${hostname || 'YOUR_HOSTNAME'} \\
  ghcr.io/xcr9/metalhive-agent:latest`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(agentInstallScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Add Node</h2>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {/* Manual Registration */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted">Step 1: Register Node</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Hostname *</label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="e.g., node-01, server-prod"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">IP Address (optional)</label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="e.g., 192.168.1.100"
                className="input w-full"
              />
            </div>
          </div>

          {/* Agent Installation */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted">Step 2: Install Agent on Remote Node</h3>
            <div className="relative">
              <pre className="terminal text-xs overflow-x-auto p-4 rounded-lg max-h-48">
                {agentInstallScript}
              </pre>
              <button
                type="button"
                onClick={copyToClipboard}
                className="absolute top-2 right-2 btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-muted">
              The agent will automatically connect to your controller and start sending metrics.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={mutation.isPending || !hostname.trim()}
              className="btn btn-primary"
            >
              {mutation.isPending ? "Registering..." : "Register Node"}
            </button>
          </div>

          {mutation.isError && (
            <p className="text-red-400 text-sm">Failed to register node. Please try again.</p>
          )}
        </form>
      </div>
    </div>
  );
}

function NodeCard({ 
  node, 
  isSelected, 
  onSelect 
}: { 
  node: any; 
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isOnline = node.online !== false;
  
  return (
    <div
      className={`card cursor-pointer transition-all ${
        isSelected ? "border-blue-500 ring-1 ring-blue-500/30" : ""
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isOnline ? "bg-green-500/10" : "bg-red-500/10"
          }`}>
            <Server className={isOnline ? "text-green-500" : "text-red-500"} size={20} />
          </div>
          <div>
            <h3 className="font-semibold">{node.hostname}</h3>
            <p className="text-xs text-muted">{node.ip || node.agent_id || "No IP"}</p>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`status-dot ${isOnline ? "status-online" : "status-offline"}`} />
        <span className={`text-sm ${isOnline ? "text-green-400" : "text-red-400"}`}>
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>

      {/* Labels */}
      {node.labels && Object.keys(node.labels).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {Object.entries(node.labels).slice(0, 3).map(([key, value]) => (
            <span key={key} className="badge badge-info text-xs">
              {key}={String(value)}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border">
        <div className="text-center">
          <Cpu className="mx-auto text-muted mb-1" size={16} />
          <p className="text-xs text-muted">CPU</p>
          <p className="text-sm font-medium">--</p>
        </div>
        <div className="text-center">
          <MemoryStick className="mx-auto text-muted mb-1" size={16} />
          <p className="text-xs text-muted">Memory</p>
          <p className="text-sm font-medium">--</p>
        </div>
        <div className="text-center">
          <HardDrive className="mx-auto text-muted mb-1" size={16} />
          <p className="text-xs text-muted">Disk</p>
          <p className="text-sm font-medium">--</p>
        </div>
      </div>
    </div>
  );
}
