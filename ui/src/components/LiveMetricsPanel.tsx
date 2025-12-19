"use client";

import { useQuery } from "@tanstack/react-query";
import { UnifiedMetricsService, metricsKeys } from "@/lib/UnifiedMetricsService";
import { Cpu, MemoryStick, HardDrive, Network, RefreshCw } from "lucide-react";

interface MetricGaugeProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  trend?: "increasing" | "stable" | "decreasing";
}

function MetricGauge({ label, value, icon, color, trend }: MetricGaugeProps) {
  const getColor = (val: number) => {
    if (val > 90) return "from-red-500 to-red-600";
    if (val > 80) return "from-orange-500 to-orange-600";
    if (val > 70) return "from-amber-500 to-amber-600";
    return color;
  };

  return (
    <div className="flex flex-col items-center p-4 bg-surface-hover rounded-xl">
      <div className="flex items-center gap-2 mb-2 text-muted">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      
      {/* Circular Progress */}
      <div className="relative w-20 h-20">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-border"
          />
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 213.6} 213.6`}
            className={`text-${value > 80 ? "red" : value > 60 ? "amber" : "emerald"}-400`}
            style={{
              stroke: value > 80 ? "#ef4444" : value > 60 ? "#f59e0b" : "#10b981",
              transition: "stroke-dasharray 0.5s ease"
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold">{value.toFixed(0)}%</span>
        </div>
      </div>
      
      {/* Trend Indicator */}
      {trend && trend !== "stable" && (
        <div className={`mt-1 text-xs ${trend === "increasing" ? "text-red-400" : "text-green-400"}`}>
          {trend === "increasing" ? "↑" : "↓"} {trend}
        </div>
      )}
    </div>
  );
}

export function LiveMetricsPanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: metricsKeys.fleet(),
    queryFn: () => UnifiedMetricsService.getFleetMetrics(),
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Live Metrics</h3>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-surface-hover rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { cpu, memory, disk, network } = data || {
    cpu: { current: 0, trend: "stable" as const },
    memory: { current: 0, trend: "stable" as const },
    disk: { current: 0, trend: "stable" as const },
    network: { bytesIn: 0, bytesOut: 0, connections: 0 },
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Live Metrics</h3>
        <button 
          onClick={() => refetch()}
          className="p-1.5 hover:bg-surface rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} className="text-muted" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricGauge
          label="CPU"
          value={cpu.current}
          icon={<Cpu size={16} />}
          color="from-blue-500 to-blue-600"
          trend={cpu.trend}
        />
        <MetricGauge
          label="Memory"
          value={memory.current}
          icon={<MemoryStick size={16} />}
          color="from-purple-500 to-purple-600"
          trend={memory.trend}
        />
        <MetricGauge
          label="Disk"
          value={disk.current}
          icon={<HardDrive size={16} />}
          color="from-cyan-500 to-cyan-600"
          trend={disk.trend}
        />
        <div className="flex flex-col items-center p-4 bg-surface-hover rounded-xl">
          <div className="flex items-center gap-2 mb-2 text-muted">
            <Network size={16} />
            <span className="text-xs font-medium">Network</span>
          </div>
          <div className="text-center mt-2">
            <p className="text-sm">
              <span className="text-green-400">↓ {formatBytes(network.bytesIn)}</span>
            </p>
            <p className="text-sm">
              <span className="text-blue-400">↑ {formatBytes(network.bytesOut)}</span>
            </p>
            <p className="text-xs text-muted mt-1">
              {network.connections} connections
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
