"use client";

import { useQuery } from "@tanstack/react-query";
import { Server, Cpu, MemoryStick, HardDrive, CheckCircle, AlertTriangle, XCircle, RefreshCw, Loader2, Sparkles, TrendingUp } from "lucide-react";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://65.109.200.75:6800";
const CONTROLLER_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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

interface ControllerNode {
  hostname: string;
  ip: string;
  online: boolean;
  status: string;
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

async function fetchControllerNodes(): Promise<ControllerNode[]> {
  try {
    const res = await fetch(`${CONTROLLER_API}/api/v1/nodes`);
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    return data.nodes || [];
  } catch {
    return [];
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

// Fetch anomaly predictions from AncientReport AI Intelligence
async function fetchAnomalies(): Promise<{ hasAnomalies: boolean; count: number }> {
  try {
    const res = await fetch(`${METRICS_API}/api/v3/ai/intelligence/ml/predict/xcr9`);
    if (!res.ok) return { hasAnomalies: false, count: 0 };
    const data = await res.json();
    const anomalies = Object.values(data.anomaly_predictions || {}).filter((a: any) => a.is_anomaly);
    return { hasAnomalies: anomalies.length > 0, count: anomalies.length };
  } catch {
    return { hasAnomalies: false, count: 0 };
  }
}

interface FleetOverviewProps {
  selectedNode: string | null;
  onSelectNode: (node: string | null) => void;
}

export function FleetOverview({ selectedNode, onSelectNode }: FleetOverviewProps) {
  const { data: serversData, isLoading: serversLoading, refetch } = useQuery({
    queryKey: ["servers-info"],
    queryFn: fetchServers,
    refetchInterval: 30000,
  });

  // Fallback: fetch from controller if AncientReport returns empty
  const { data: controllerNodes = [] } = useQuery({
    queryKey: ["controller-nodes"],
    queryFn: fetchControllerNodes,
    refetchInterval: 30000,
  });

  const { data: avgCpu = 0, isLoading: cpuLoading } = useQuery({
    queryKey: ["fleet-cpu-avg"],
    queryFn: () => fetchMetric("cpu"),
    refetchInterval: 30000,
  });

  const { data: avgMemory = 0, isLoading: memLoading } = useQuery({
    queryKey: ["fleet-memory-avg"],
    queryFn: () => fetchMetric("memory"),
    refetchInterval: 30000,
  });

  const { data: anomalyData } = useQuery({
    queryKey: ["fleet-anomalies"],
    queryFn: fetchAnomalies,
    refetchInterval: 60000,
  });

  const servers = serversData?.servers || {};
  const serverList = Object.entries(servers).map(([hostname, info]) => ({
    hostname,
    ...info,
  }));

  // Use controller nodes if AncientReport has no data
  const totalNodes = serverList.length > 0 ? serverList.length : controllerNodes.length;
  const onlineNodes = serverList.length > 0 
    ? serverList.filter(s => !s.status || s.status === "healthy" || s.status === "warning").length
    : controllerNodes.filter(n => n.online).length;
  
  const healthyNodes = serverList.filter(s => !s.status || s.status === "healthy").length;
  const warningNodes = serverList.filter(s => s.status === "warning").length;
  const criticalNodes = serverList.filter(s => s.status === "critical" || s.status === "offline").length;
  const fleetHealth = totalNodes > 0 ? (onlineNodes / totalNodes) * 100 : 100;
  const healthColor = fleetHealth >= 90 ? "text-green-400" : fleetHealth >= 70 ? "text-yellow-400" : "text-red-400";

  // Build dropdown list from both sources
  const nodeOptions = serverList.length > 0 
    ? serverList.map(s => s.hostname)
    : controllerNodes.map(n => n.hostname);

  const isLoading = serversLoading;

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
                {isLoading ? (
                  <div className="h-7 w-8 animate-pulse bg-surface-hover rounded" />
                ) : (
                  <p className="text-xl font-bold">{totalNodes}</p>
                )}
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted text-xs mb-1">
                  <Cpu size={14} /> CPU
                </div>
                {cpuLoading ? (
                  <div className="h-7 w-12 animate-pulse bg-surface-hover rounded" />
                ) : (
                  <p className={`text-xl font-bold ${avgCpu > 80 ? "text-red-400" : avgCpu > 60 ? "text-yellow-400" : "text-green-400"}`}>
                    {avgCpu.toFixed(1)}%
                  </p>
                )}
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted text-xs mb-1">
                  <MemoryStick size={14} /> RAM
                </div>
                {memLoading ? (
                  <div className="h-7 w-12 animate-pulse bg-surface-hover rounded" />
                ) : (
                  <p className={`text-xl font-bold ${avgMemory > 80 ? "text-red-400" : avgMemory > 60 ? "text-yellow-400" : "text-green-400"}`}>
                    {avgMemory.toFixed(1)}%
                  </p>
                )}
              </div>
              {/* AI Anomaly Indicator */}
              {anomalyData && (
                <div className="text-center">
                  <div className="flex items-center gap-1 text-muted text-xs mb-1">
                    <Sparkles size={14} /> AI
                  </div>
                  <p className={`text-xl font-bold flex items-center gap-1 ${anomalyData.hasAnomalies ? "text-red-400" : "text-green-400"}`}>
                    {anomalyData.hasAnomalies ? (
                      <><AlertTriangle size={16} /> {anomalyData.count}</>
                    ) : (
                      <><CheckCircle size={16} /> OK</>
                    )}
                  </p>
                </div>
              )}
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
              {nodeOptions.map((hostname) => (
                <option key={hostname} value={hostname}>{hostname}</option>
              ))}
            </select>

            <button onClick={() => refetch()} className="p-2 hover:bg-surface rounded-lg" title="Refresh">
              <RefreshCw size={18} className={`text-muted ${isLoading ? 'animate-spin' : ''}`} />
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
          {isLoading ? (
            <div className="h-8 w-16 animate-pulse bg-surface-hover rounded" />
          ) : (
            <p className="text-2xl font-bold">{healthyNodes}<span className="text-sm font-normal text-muted">/{totalNodes}</span></p>
          )}
        </div>
        <div className="p-4 rounded-xl border bg-yellow-500/10 border-yellow-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-yellow-400" size={20} />
            <span className="text-sm text-muted">Warning</span>
          </div>
          {isLoading ? (
            <div className="h-8 w-16 animate-pulse bg-surface-hover rounded" />
          ) : (
            <p className="text-2xl font-bold">{warningNodes}<span className="text-sm font-normal text-muted">/{totalNodes}</span></p>
          )}
        </div>
        <div className="p-4 rounded-xl border bg-red-500/10 border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="text-red-400" size={20} />
            <span className="text-sm text-muted">Critical</span>
          </div>
          {isLoading ? (
            <div className="h-8 w-16 animate-pulse bg-surface-hover rounded" />
          ) : (
            <p className="text-2xl font-bold">{criticalNodes}<span className="text-sm font-normal text-muted">/{totalNodes}</span></p>
          )}
        </div>
        <div className="p-4 rounded-xl border bg-purple-500/10 border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="text-purple-400" size={20} />
            <span className="text-sm text-muted">Resources</span>
          </div>
          {isLoading ? (
            <div className="h-8 w-20 animate-pulse bg-surface-hover rounded" />
          ) : (
            <>
              <p className="text-2xl font-bold">
                {serverList.reduce((sum, s) => sum + (s.cpu_cores || 0), 0)}
                <span className="text-sm font-normal text-muted ml-1">cores</span>
              </p>
              <p className="text-xs text-muted">{serverList.reduce((sum, s) => sum + (s.memory_total_gb || 0), 0).toFixed(0)} GB RAM</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

