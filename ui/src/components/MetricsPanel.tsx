"use client";

import { useQuery } from "@tanstack/react-query";
import { 
  Activity, Wifi, AlertTriangle, Network, 
  Cpu, MemoryStick, HardDrive, ExternalLink, Container
} from "lucide-react";

const ANCIENTREPORT_URL = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://localhost:6080";

interface MetricsPanelProps {
  selectedNode: string | null;
  compact?: boolean;
}

interface NetworkStats {
  hostname: string | null;
  timestamp: string;
  connections: {
    active_connections: number;
    established: number;
    packet_drops: number;
    total_retransmits: number;
  };
  latency: { p50: number; p90: number; p99: number };
}

async function fetchNetworkStats(hostname?: string): Promise<NetworkStats> {
  const url = hostname 
    ? `${ANCIENTREPORT_URL}/api/v3/ebpf/network/stats?hostname=${hostname}` 
    : `${ANCIENTREPORT_URL}/api/v3/ebpf/network/stats`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
}

export function MetricsPanel({ selectedNode, compact = false }: MetricsPanelProps) {
  const hostname = selectedNode || undefined;

  const { data: networkStats, isLoading, error } = useQuery({
    queryKey: ["network-stats", selectedNode],
    queryFn: () => fetchNetworkStats(hostname),
    refetchInterval: 5000,
  });

  const ancientReportUrl = `${ANCIENTREPORT_URL}${selectedNode ? `?server=${encodeURIComponent(selectedNode)}` : ''}`;

  // Determine health status
  const getStatus = () => {
    if (!networkStats) return 'unknown';
    const drops = networkStats.connections?.packet_drops || 0;
    const retransmits = networkStats.connections?.total_retransmits || 0;
    if (drops > 100 || retransmits > 100) return 'critical';
    if (drops > 10 || retransmits > 10) return 'warning';
    return 'healthy';
  };
  
  const status = getStatus();
  const statusColors = {
    healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  };

  if (compact) {
    return (
      <div className="flex items-center justify-around h-full text-center">
        <div>
          <p className="text-2xl font-bold text-blue-400">{networkStats?.connections?.active_connections ?? "--"}</p>
          <p className="text-xs text-muted">Connections</p>
        </div>
        <div>
          <p className={`text-2xl font-bold ${(networkStats?.connections?.packet_drops ?? 0) > 10 ? "text-red-400" : "text-green-400"}`}>
            {networkStats?.connections?.packet_drops ?? 0}
          </p>
          <p className="text-xs text-muted">Drops</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-purple-400">{networkStats?.latency?.p50?.toFixed(1) ?? "--"}ms</p>
          <p className="text-xs text-muted">p50</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 glass-card">
        <AlertTriangle className="mr-2" size={20} />
        Failed to load metrics
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between glass-header p-4 -mx-4 -mt-4 mb-4 rounded-b-xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Network size={24} />
            </span>
            <span className="gradient-text">Quick Stats</span>
          </h1>
          <p className="text-sm text-muted mt-1 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === 'healthy' ? 'bg-green-400' : status === 'warning' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            {selectedNode ? `Server: ${selectedNode}` : "Fleet-wide Overview"}
          </p>
        </div>
      </div>

      {/* Basic Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity size={18} className="text-blue-400" />
            <span className="text-xs text-muted uppercase">Connections</span>
          </div>
          <p className="text-3xl font-bold text-blue-400">
            {networkStats?.connections?.active_connections ?? "--"}
          </p>
        </div>

        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Wifi size={18} className="text-green-400" />
            <span className="text-xs text-muted uppercase">Established</span>
          </div>
          <p className="text-3xl font-bold text-green-400">
            {networkStats?.connections?.established ?? "--"}
          </p>
        </div>

        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-orange-400" />
            <span className="text-xs text-muted uppercase">Drops</span>
          </div>
          <p className={`text-3xl font-bold ${(networkStats?.connections?.packet_drops ?? 0) > 10 ? "text-red-400" : "text-green-400"}`}>
            {networkStats?.connections?.packet_drops ?? 0}
          </p>
        </div>

        <div className={`glass-card p-4 text-center border ${statusColors[status]}`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Container size={18} />
            <span className="text-xs uppercase">Status</span>
          </div>
          <p className="text-3xl font-bold capitalize">{status}</p>
        </div>
      </div>

      {/* AncientReport Link - Prominent CTA */}
      <a 
        href={ancientReportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-3 w-full p-6 rounded-xl bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 hover:border-blue-400/50 text-blue-400 hover:text-blue-300 transition-all hover:shadow-xl hover:shadow-blue-500/10 group"
      >
        <Network size={24} className="text-blue-400" />
        <div className="text-left">
          <span className="text-lg font-semibold block">📊 View Advanced Metrics in AncientReport</span>
          <span className="text-sm text-muted">Charts, trends, processes, flows, anomalies & more</span>
        </div>
        <ExternalLink size={20} className="ml-auto group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
      </a>

      {/* Info Note */}
      <div className="text-center text-sm text-muted p-4 glass-panel rounded-lg">
        <p>Advanced metrics, time-series charts, and detailed analysis have been moved to <strong>AncientReport</strong> for a better observability experience.</p>
      </div>
    </div>
  );
}

export default MetricsPanel;
