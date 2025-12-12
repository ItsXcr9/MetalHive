"use client";

import { useQuery } from "@tanstack/react-query";
import { Cpu, MemoryStick, HardDrive, ExternalLink, Activity, AlertTriangle } from "lucide-react";

const ANCIENTREPORT_URL = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://localhost:6080";

interface BasicStatsCardProps {
  hostname: string;
  showAdvancedLink?: boolean;
}

interface BasicMetrics {
  cpu_percent: number;
  memory_percent: number;
  container_count: number;
  disk_percent: number;
  status: 'healthy' | 'warning' | 'critical';
}

async function fetchBasicMetrics(hostname: string): Promise<BasicMetrics> {
  try {
    const response = await fetch(`${ANCIENTREPORT_URL}/api/v3/ebpf/network/stats?hostname=${hostname}`);
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    
    // Extract basic metrics from network stats
    const connections = data.connections || {};
    const drops = connections.packet_drops || 0;
    const retransmits = connections.total_retransmits || 0;
    
    // Determine status based on drops and retransmits
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (drops > 100 || retransmits > 100) status = 'critical';
    else if (drops > 10 || retransmits > 10) status = 'warning';
    
    return {
      cpu_percent: 0, // Will be populated from node stats
      memory_percent: 0,
      container_count: 0,
      disk_percent: 0,
      status
    };
  } catch {
    return {
      cpu_percent: 0,
      memory_percent: 0,
      container_count: 0,
      disk_percent: 0,
      status: 'warning'
    };
  }
}

export function BasicStatsCard({ hostname, showAdvancedLink = true }: BasicStatsCardProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["basic-metrics", hostname],
    queryFn: () => fetchBasicMetrics(hostname),
    refetchInterval: 10000,
  });

  const ancientReportUrl = `${ANCIENTREPORT_URL}?server=${encodeURIComponent(hostname)}`;

  if (isLoading) {
    return (
      <div className="glass-card p-4 animate-pulse">
        <div className="h-16 bg-slate-700/30 rounded-lg" />
      </div>
    );
  }

  const statusColors = {
    healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    critical: 'bg-red-500/20 text-red-400 border-red-500/30'
  };

  const statusIcons = {
    healthy: <Activity size={14} className="text-green-400" />,
    warning: <AlertTriangle size={14} className="text-yellow-400" />,
    critical: <AlertTriangle size={14} className="text-red-400" />
  };

  return (
    <div className="glass-card p-4 space-y-4">
      {/* Basic Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Cpu size={14} className="text-blue-400" />
            <span className="text-xs text-muted uppercase">CPU</span>
          </div>
          <p className="text-lg font-bold text-blue-400">--</p>
        </div>
        
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <MemoryStick size={14} className="text-purple-400" />
            <span className="text-xs text-muted uppercase">Memory</span>
          </div>
          <p className="text-lg font-bold text-purple-400">--</p>
        </div>
        
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <HardDrive size={14} className="text-orange-400" />
            <span className="text-xs text-muted uppercase">Disk</span>
          </div>
          <p className="text-lg font-bold text-orange-400">--</p>
        </div>
        
        <div className={`p-3 rounded-lg border text-center ${statusColors[metrics?.status || 'healthy']}`}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            {statusIcons[metrics?.status || 'healthy']}
            <span className="text-xs uppercase">Status</span>
          </div>
          <p className="text-lg font-bold capitalize">{metrics?.status || 'healthy'}</p>
        </div>
      </div>

      {/* Advanced Metrics Link */}
      {showAdvancedLink && (
        <a 
          href={ancientReportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full p-3 rounded-lg bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 hover:border-blue-400/50 text-blue-400 hover:text-blue-300 transition-all hover:shadow-lg hover:shadow-blue-500/10 group"
        >
          <span className="font-medium">📊 View Advanced Metrics in AncientReport</span>
          <ExternalLink size={16} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </a>
      )}
    </div>
  );
}

export default BasicStatsCard;
