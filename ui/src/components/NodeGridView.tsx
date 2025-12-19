"use client";

import { useQuery } from "@tanstack/react-query";
import { UnifiedMetricsService, metricsKeys, NodeHealth } from "@/lib/UnifiedMetricsService";
import { Server, AlertTriangle, CheckCircle, Wifi, WifiOff } from "lucide-react";

interface NodeGridViewProps {
  onSelectNode?: (hostname: string) => void;
  selectedNode?: string | null;
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 60;
    const y = 20 - ((v - min) / range) * 18;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width="60" height="20" className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NodeCard({ node, isSelected, onClick }: { 
  node: NodeHealth; 
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusColors = {
    healthy: "border-emerald-500/30 bg-emerald-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    critical: "border-red-500/30 bg-red-500/5",
    offline: "border-gray-500/30 bg-gray-500/5",
  };

  const statusIcons = {
    healthy: <CheckCircle className="text-emerald-400" size={14} />,
    warning: <AlertTriangle className="text-amber-400" size={14} />,
    critical: <AlertTriangle className="text-red-400" size={14} />,
    offline: <WifiOff className="text-gray-400" size={14} />,
  };

  // Generate fake sparkline data (would be real in production)
  const cpuHistory = Array.from({ length: 10 }, () => Math.random() * 30 + node.metrics.cpu - 15);
  const memHistory = Array.from({ length: 10 }, () => Math.random() * 20 + node.metrics.memory - 10);

  return (
    <div 
      onClick={onClick}
      className={`
        p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02]
        ${statusColors[node.status]}
        ${isSelected ? "ring-2 ring-blue-500 border-blue-500" : ""}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server size={16} className={node.status === "offline" ? "text-gray-400" : "text-primary"} />
          <span className="font-medium text-sm truncate max-w-[100px]">{node.hostname}</span>
        </div>
        <div className="flex items-center gap-1">
          {node.anomalies > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {node.anomalies}
            </span>
          )}
          {statusIcons[node.status]}
        </div>
      </div>

      {/* Mini Metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted">CPU</span>
          <span className={node.metrics.cpu > 80 ? "text-red-400" : "text-primary"}>{node.metrics.cpu.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted">MEM</span>
          <span className={node.metrics.memory > 80 ? "text-red-400" : "text-primary"}>{node.metrics.memory.toFixed(0)}%</span>
        </div>
      </div>

      {/* Mini Sparklines */}
      <div className="flex justify-between mt-2 opacity-60">
        <MiniSparkline values={cpuHistory} color="#3b82f6" />
        <MiniSparkline values={memHistory} color="#a855f7" />
      </div>

      {/* Health Score */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${
              node.healthScore >= 80 ? "bg-emerald-500" : 
              node.healthScore >= 50 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${node.healthScore}%` }}
          />
        </div>
        <span className="text-xs text-muted">{node.healthScore}%</span>
      </div>
    </div>
  );
}

export function NodeGridView({ onSelectNode, selectedNode }: NodeGridViewProps) {
  const { data: nodes = [], isLoading } = useQuery({
    queryKey: metricsKeys.nodes(),
    queryFn: () => UnifiedMetricsService.getNodesHealth(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="card p-4">
        <h3 className="font-semibold mb-4">Nodes</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-surface-hover rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Nodes</h3>
        <span className="text-sm text-muted">{nodes.length} total</span>
      </div>
      
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {nodes.map((node) => (
          <NodeCard
            key={node.hostname}
            node={node}
            isSelected={selectedNode === node.hostname}
            onClick={() => onSelectNode?.(node.hostname)}
          />
        ))}
      </div>
    </div>
  );
}
