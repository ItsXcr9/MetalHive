"use client";

import { useQuery } from "@tanstack/react-query";
import { Server, Cpu, MemoryStick, HardDrive, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://localhost:8800";

interface ServerInfo {
  cpu_cores: number;
  memory_total_gb: number;
  disk_total_gb: number;
  disk_free_gb: number;
  status?: "healthy" | "warning" | "critical" | "offline";
}

interface ServersResponse {
  servers: Record<string, ServerInfo>;
}

async function fetchServers(): Promise<ServersResponse> {
  try {
    const res = await fetch(`${METRICS_API}/api/servers/info`);
    if (!res.ok) throw new Error("Failed");
    return res.json();
  } catch {
    return { servers: {} };
  }
}

async function fetchMetric(type: string): Promise<number> {
  try {
    const res = await fetch(`${METRICS_API}/api/metrics/${type}?period=5m`);
    if (!res.ok) return 0;
    const data = await res.json();
    if (!data.data?.length) return 0;
    return data.data.reduce((sum: number, p: { value: number }) => sum + p.value, 0) / data.data.length;
  } catch {
    return 0;
  }
}

interface FleetOverviewProps {
  selectedNode: string | null;
  onSelectNode: (node: string | null) => void;
}

export function FleetOverview({ selectedNode, onSelectNode }: FleetOverviewProps) {
  const { data: serversData, isLoading, refetch } = useQuery({
    queryKey: ["servers-info"],
    queryFn: fetchServers,
    refetchInterval: 30000,
  });

  const { data: avgCpu = 0 } = useQuery({
    queryKey: ["fleet-cpu-avg"],
    queryFn: () => fetchMetric("cpu"),
    refetchInterval: 30000,
  });

  const { data: avgMemory = 0 } = useQuery({
    queryKey: ["fleet-memory-avg"],
    queryFn: () => fetchMetric("memory"),
    refetchInterval: 30000,
  });

  const servers = serversData?.servers || {};
  const serverList = Object.entries(servers).map(([hostname, info]) => ({
    hostname,
    ...info,
  }));

  const totalNodes = serverList.length;
  const healthyNodes = serverList.filter(s => !s.status || s.status === "healthy").length;
  const warningNodes = serverList.filter(s => s.status === "warning").length;
  const criticalNodes = serverList.filter(s => s.status === "critical" || s.status === "offline").length;
  const fleetHealth = totalNodes > 0 ? (healthyNodes / totalNodes) * 100 : 100;
  const healthColor = fleetHealth >= 90 ? "text-green-400" : fleetHealth >= 70 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-6">
      {/* Fleet Summary */}
      <div className="card bg-gradient-to-r from-surface to-surface-hover">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <Server className="text-blue-400" size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Fleet Overview</h2>
                <p className="text-sm text-muted">
                  {selectedNode ? `Viewing: ${selectedNode}` : "All Servers"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 ml-4 border-l border-border pl-6">
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted text-xs mb-1">
                  <Server size={14} /> Nodes
                </div>
                <p className="text-xl font-bold">{totalNodes}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted text-xs mb-1">
                  <Cpu size={14} /> CPU
                </div>
                <p className={`text-xl font-bold ${avgCpu > 80 ? "text-red-400" : avgCpu > 60 ? "text-yellow-400" : "text-green-400"}`}>
                  {avgCpu.toFixed(1)}%
                </p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted text-xs mb-1">
                  <MemoryStick size={14} /> RAM
                </div>
                <p className={`text-xl font-bold ${avgMemory > 80 ? "text-red-400" : avgMemory > 60 ? "text-yellow-400" : "text-green-400"}`}>
                  {avgMemory.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${fleetHealth >= 90 ? "bg-green-500" : fleetHealth >= 70 ? "bg-yellow-500" : "bg-red-500"}`} />
              <span className={`font-semibold ${healthColor}`}>{Math.round(fleetHealth)}% Healthy</span>
            </div>

            <select
              value={selectedNode || "all"}
              onChange={(e) => onSelectNode(e.target.value === "all" ? null : e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Servers</option>
              {serverList.map((s) => (
                <option key={s.hostname} value={s.hostname}>{s.hostname}</option>
              ))}
            </select>

            <button onClick={() => refetch()} className="p-2 hover:bg-surface rounded-lg" title="Refresh">
              <RefreshCw size={18} className="text-muted" />
            </button>
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-green-500/10 border-green-500/30">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-green-400" size={20} />
            <span className="text-sm text-muted">Healthy</span>
          </div>
          <p className="text-2xl font-bold">{healthyNodes}<span className="text-sm font-normal text-muted">/{totalNodes}</span></p>
        </div>
        <div className="p-4 rounded-xl border bg-yellow-500/10 border-yellow-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-yellow-400" size={20} />
            <span className="text-sm text-muted">Warning</span>
          </div>
          <p className="text-2xl font-bold">{warningNodes}<span className="text-sm font-normal text-muted">/{totalNodes}</span></p>
        </div>
        <div className="p-4 rounded-xl border bg-red-500/10 border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="text-red-400" size={20} />
            <span className="text-sm text-muted">Critical</span>
          </div>
          <p className="text-2xl font-bold">{criticalNodes}<span className="text-sm font-normal text-muted">/{totalNodes}</span></p>
        </div>
        <div className="p-4 rounded-xl border bg-purple-500/10 border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="text-purple-400" size={20} />
            <span className="text-sm text-muted">Resources</span>
          </div>
          <p className="text-2xl font-bold">
            {serverList.reduce((sum, s) => sum + (s.cpu_cores || 0), 0)}
            <span className="text-sm font-normal text-muted ml-1">cores</span>
          </p>
          <p className="text-xs text-muted">{serverList.reduce((sum, s) => sum + (s.memory_total_gb || 0), 0).toFixed(0)} GB RAM</p>
        </div>
      </div>

      {/* Server Grid */}
      {!selectedNode && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Server Grid</h3>
          {isLoading ? (
            <div className="text-center py-8 text-muted">Loading servers...</div>
          ) : serverList.length === 0 ? (
            <div className="text-center py-8 text-muted">No servers registered yet.</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {serverList.map((server) => (
                <div
                  key={server.hostname}
                  onClick={() => onSelectNode(server.hostname)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-105 ${
                    selectedNode === server.hostname 
                      ? "ring-2 ring-primary border-primary" 
                      : "border-green-500/50 bg-green-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Server size={16} className="text-muted" />
                      <span className="font-medium text-sm truncate max-w-[100px]" title={server.hostname}>
                        {server.hostname}
                      </span>
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted">CPU</span><span>{server.cpu_cores || "?"} cores</span></div>
                    <div className="flex justify-between"><span className="text-muted">RAM</span><span>{server.memory_total_gb?.toFixed(1) || "?"} GB</span></div>
                    <div className="flex justify-between"><span className="text-muted">Disk</span><span>{server.disk_free_gb?.toFixed(0) || "?"} GB free</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
