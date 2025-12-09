"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { 
  Shield, 
  Activity, 
  Network, 
  Server, 
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Cpu,
  HardDrive,
  ChevronDown,
  ChevronUp,
  FileText
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface AncientReportData {
  available: boolean;
  api_healthy: boolean;
  servers?: { servers: string[] };
  metrics?: {
    tcp_connections: Array<{
      process_name: string;
      local_port: number;
      remote_port: number;
      remote_ip: string;
      state: string;
      bytes_sent: number;
      bytes_received: number;
      container_id: string;
    }>;
    process_flows: Array<{
      process_name: string;
      bytes_sent: number;
      bytes_received: number;
      active_flows: number;
      container_id: string;
    }>;
    syscall_stats: Array<{
      process_name: string;
      total_count: number;
      connect_count: number;
      open_count: number;
    }>;
    total_processes?: number;  // Total running processes on system
    packet_drops?: number;  // Total RX+TX packet drops
  };
  security?: {
    overall_score: number;
    active_threats: number;
    total_open_ports: number;
    risky_ports_count: number;
    hosts_scanned: number;
  };
  ui_url?: string;
  api_url?: string;
  per_server_metrics?: {
    servers: Record<string, {
      hostname: string;
      tcp_connections: number;
      active_processes: number;
      packet_drops: number;
      open_ports: number;
      open_files: number;
      security_score: number;
    }>;
    total_servers: number;
    collection_time: string;
  };
}

async function fetchAncientReportDashboard(hostname?: string): Promise<AncientReportData> {
  const url = hostname 
    ? `${API_URL}/api/v1/products/ancientreport/dashboard?hostname=${hostname}`
    : `${API_URL}/api/v1/products/ancientreport/dashboard`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch AncientReport data");
  return res.json();
}

interface AncientReportWidgetProps {
  hostname?: string;
  compact?: boolean;
}

export function AncientReportWidget({ hostname, compact = false }: AncientReportWidgetProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["ancientreport-dashboard", hostname],
    queryFn: () => fetchAncientReportDashboard(hostname),
    refetchInterval: 30000,
  });
  
  const [showPerServerMetrics, setShowPerServerMetrics] = useState(false);

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-32 bg-surface-hover rounded-lg" />
      </div>
    );
  }

  if (error || !data?.available) {
    return (
      <div className="card border-dashed border-yellow-500/30">
        <div className="flex items-center gap-3 text-yellow-400">
          <AlertTriangle size={20} />
          <div>
            <p className="font-medium">AncientReport Unavailable</p>
            <p className="text-xs text-muted">eBPF monitoring not running</p>
          </div>
        </div>
      </div>
    );
  }

  const { security, metrics, servers, ui_url } = data;
  
  // Calculate totals from per-server metrics (aggregated from ClickHouse)
  // Fall back to local metrics if per_server_metrics not available
  const perServerData = data.per_server_metrics?.servers;
  
  const totalConnections = perServerData 
    ? Object.values(perServerData).reduce((sum, s: any) => sum + (s.tcp_connections || 0), 0)
    : metrics?.process_flows?.reduce((sum, p) => sum + (p.active_flows || 0), 0) || metrics?.tcp_connections?.length || 0;
  
  const totalProcesses = perServerData
    ? Object.values(perServerData).reduce((sum, s: any) => sum + (s.active_processes || 0), 0)
    : metrics?.total_processes || metrics?.process_flows?.length || 0;
  
  // Get packet drops - sum from per-server if available
  const packetDrops = perServerData
    ? Object.values(perServerData).reduce((sum, s: any) => sum + (s.packet_drops || 0), 0)
    : metrics?.packet_drops || 0;
  
  // Calculate average security score from per-server data
  const avgSecurityScore = perServerData && Object.values(perServerData).length > 0
    ? Math.round(Object.values(perServerData).reduce((sum, s: any) => sum + (s.security_score || 0), 0) / Object.values(perServerData).length)
    : security?.overall_score ?? 0;

  // Calculate score color - use security.overall_score for main display
  const score = security?.overall_score ?? 0;
  const scoreColor = score >= 80 
    ? "text-green-400" 
    : score >= 50 
      ? "text-yellow-400" 
      : "text-red-400";

  if (compact) {
    return (
      <div className="card bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Activity className="text-purple-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-sm">AncientReport</h3>
              <p className="text-xs text-muted">eBPF Observability</p>
            </div>
          </div>
          {ui_url && (
            <a 
              href={ui_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-sm btn-secondary flex items-center gap-1"
            >
              <ExternalLink size={12} /> Open
            </a>
          )}
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-surface-hover">
            <p className={`text-2xl font-bold ${scoreColor}`}>{security?.overall_score || 0}</p>
            <p className="text-xs text-muted">Security</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-surface-hover">
            <p className="text-2xl font-bold text-blue-400">{totalConnections}</p>
            <p className="text-xs text-muted">Connections</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-surface-hover">
            <p className="text-2xl font-bold text-green-400">{servers?.servers?.length || 0}</p>
            <p className="text-xs text-muted">Servers</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20">
            <Activity className="text-purple-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">AncientReport</h2>
            <p className="text-sm text-muted">eBPF-based System Observability</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} />
          </button>
          {ui_url && (
            <a 
              href={ui_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm flex items-center gap-1"
            >
              <ExternalLink size={14} /> Open Dashboard
            </a>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Security Score */}
        <div className="card text-center">
          <Shield className={`mx-auto mb-2 ${scoreColor}`} size={28} />
          <p className={`text-3xl font-bold ${scoreColor}`}>{score}</p>
          <p className="text-sm text-muted">Security Score</p>
          {security?.active_threats !== undefined && security.active_threats > 0 && (
            <p className="text-xs text-red-400 mt-1">{security.active_threats} threats</p>
          )}
        </div>

        {/* Connections */}
        <div className="card text-center">
          <Network className="mx-auto mb-2 text-blue-400" size={28} />
          <p className="text-3xl font-bold text-blue-400">{totalConnections}</p>
          <p className="text-sm text-muted">TCP Connections</p>
          <p className="text-xs text-muted mt-1">{security?.total_open_ports || 0} ports</p>
        </div>

        {/* Processes */}
        <div className="card text-center">
          <Cpu className="mx-auto mb-2 text-green-400" size={28} />
          <p className="text-3xl font-bold text-green-400">{totalProcesses}</p>
          <p className="text-sm text-muted">Active Processes</p>
        </div>

        {/* Packet Drops */}
        {/* Packet Drops */}
        <div className={`card text-center transition-all duration-300 ${packetDrops > 100 ? "bg-red-500/10 border-red-500/30" : packetDrops > 0 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-green-500/5 border-green-500/20"}`}>
          <div className="relative inline-block mx-auto mb-2">
            <Activity className={`relative z-10 ${packetDrops > 100 ? "text-red-400" : packetDrops > 0 ? "text-yellow-400" : "text-green-400"}`} size={28} />
            {packetDrops > 0 && (
               <span className="absolute -top-1 -right-1 flex h-3 w-3">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
               </span>
            )}
          </div>
          <p className={`text-3xl font-bold ${packetDrops > 100 ? "text-red-400" : packetDrops > 0 ? "text-yellow-400" : "text-green-400"}`}>
            {packetDrops.toLocaleString()}
          </p>
          <p className="text-sm text-muted">Packet Drops</p>
        </div>
      </div>

      {/* Per-Server Metrics Breakdown */}
      {data.per_server_metrics?.servers && Object.keys(data.per_server_metrics.servers).length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowPerServerMetrics(!showPerServerMetrics)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Server size={16} className="text-purple-400" />
              <span className="font-semibold">Per-Server Metrics</span>
              <span className="text-xs text-muted ml-2">
                ({Object.keys(data.per_server_metrics.servers).length} servers)
              </span>
            </div>
            {showPerServerMetrics ? (
              <ChevronUp size={20} className="text-muted" />
            ) : (
              <ChevronDown size={20} className="text-muted" />
            )}
          </button>
          
          {showPerServerMetrics && (
            <div className="mt-4 grid gap-3">
              {Object.entries(data.per_server_metrics.servers).map(([hostname, metrics]) => (
                <div 
                  key={hostname} 
                  className="p-3 rounded-lg bg-surface-hover border border-border"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Server size={14} className="text-blue-400" />
                    <span className="font-mono text-sm font-medium">{hostname}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-purple-400">
                        {(metrics.open_files || metrics.active_processes * 15).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted">Open Files</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-blue-400">{metrics.tcp_connections}</p>
                      <p className="text-xs text-muted">Connections</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-400">{metrics.active_processes}</p>
                      <p className="text-xs text-muted">Processes</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${
                        metrics.packet_drops > 100 ? "text-red-400" : 
                        metrics.packet_drops > 0 ? "text-yellow-400" : "text-green-400"
                      }`}>
                        {metrics.packet_drops}
                      </p>
                      <p className="text-xs text-muted">Drops</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Servers */}
      {servers?.servers && servers.servers.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Server size={16} /> Monitored Servers
          </h3>
          <div className="flex flex-wrap gap-2">
            {servers.servers.map((server) => (
              <span 
                key={server} 
                className="px-3 py-1 rounded-full bg-surface-hover text-sm font-mono"
              >
                {server}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Network Load by Process - Top bandwidth consumers */}
      {metrics?.process_flows && metrics.process_flows.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">Network Load by Process</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Process</th>
                  <th className="text-right py-2">Sent</th>
                  <th className="text-right py-2">Received</th>
                  <th className="text-right py-2">Total</th>
                  <th className="text-right py-2">Flows</th>
                </tr>
              </thead>
              <tbody>
                {[...metrics.process_flows]
                  .sort((a, b) => (b.bytes_sent + b.bytes_received) - (a.bytes_sent + a.bytes_received))
                  .slice(0, 8)
                  .map((flow, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-hover">
                    <td className="py-2 font-mono">{flow.process_name}</td>
                    <td className="py-2 text-right text-blue-400">{formatBytes(flow.bytes_sent)}</td>
                    <td className="py-2 text-right text-green-400">{formatBytes(flow.bytes_received)}</td>
                    <td className="py-2 text-right text-purple-400 font-medium">
                      {formatBytes(flow.bytes_sent + flow.bytes_received)}
                    </td>
                    <td className="py-2 text-right text-muted">{flow.active_flows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
