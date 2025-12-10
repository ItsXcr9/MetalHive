"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
  BarChart,
  Bar
} from "recharts";
import { 
  Activity, Wifi, ArrowUpDown, AlertTriangle, Network, 
  TrendingUp, TrendingDown, Cpu, MemoryStick, Gauge, Server,
  Bell, Zap, X, FileText, Layers, Clock
} from "lucide-react";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://localhost:8800";

interface MetricsPanelProps {
  selectedNode: string | null;
  compact?: boolean;
}

// Types
interface ProcessBandwidth {
  process_name: string;
  pid: number;
  bytes_sent: number;
  bytes_received: number;
  total_bytes: number;
  bytes_per_sec: number;
  flows: number;
}

interface ConnectionStats {
  active_connections: number;
  established: number;
  listen: number;
  time_wait: number;
  close_wait: number;
  total_retransmits: number;
  packet_drops: number;
  open_rate_per_sec: number;
  close_rate_per_sec: number;
}

interface FlowEdge {
  source_process: string;
  dest_ip: string;
  dest_port: number;
  protocol: string;
  bytes_total: number;
  connection_count: number;
  state: string;
}

interface NetworkStats {
  hostname: string | null;
  timestamp: string;
  bandwidth: ProcessBandwidth[];
  latency: { p50: number; p90: number; p99: number; min_ms: number; max_ms: number; samples: number };
  connections: ConnectionStats;
  top_flows: FlowEdge[];
}

interface ProcessHealth {
  process_name: string;
  pid: number;
  cpu_percent: number;
  memory_mb: number;
  memory_percent: number;
  open_fds: number;
  threads: number;
  socket_count: number;
}

interface SystemContext {
  memory_used_percent: number;
  memory_available_mb: number;
  oom_risk: boolean;
  swap_used_percent: number;
  softirq_net_percent: number;
  cpu_system_percent: number;
  avg_socket_queue_depth: number;
  max_socket_queue_depth: number;
  socket_backlog_pressure: number;
  top_cpu_processes: ProcessHealth[];
  top_memory_processes: ProcessHealth[];
}

interface MetricsSample {
  timestamp: string;
  latency_p50: number;
  latency_p90: number;
  latency_p99: number;
  retransmits: number;
  packet_drops: number;
  active_connections: number;
  open_rate: number;
  close_rate: number;
}

interface TrendComparison {
  metric: string;
  current_5min: number;
  last_1hour: number;
  delta_percent: number;
  trend: string;
  severity: string;
}

interface TrendsResponse {
  latency_p99: TrendComparison;
  latency_p50: TrendComparison;
  retransmits: TrendComparison;
  packet_drops: TrendComparison;
  connections: TrendComparison;
}

interface AnomalyEvent {
  timestamp: string;
  event_type: string;
  severity: string;
  process: string | null;
  description: string;
  value: number;
  threshold: number;
}

interface AnomaliesResponse {
  anomalies: AnomalyEvent[];
  count: number;
}

// Phase 3: Drilldown types
interface FlowDetail {
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
  state: string;
  bytes_sent: number;
  bytes_received: number;
  rtt_ms: number;
  retransmits: number;
}

interface HistogramBucket {
  range_start_ms: number;
  range_end_ms: number;
  count: number;
  percentage: number;
}

interface SyscallBreakdown {
  read_count: number;
  write_count: number;
  sendmsg_count: number;
  recvmsg_count: number;
  poll_epoll_count: number;
}

interface ProcessDrilldown {
  health: ProcessHealth;
  flows: FlowDetail[];
  rtt_histogram: HistogramBucket[];
  rtt_stats: { p50: number; p90: number; p99: number; min_ms: number; max_ms: number; samples: number };
  syscalls: SyscallBreakdown;
  recent_anomalies: AnomalyEvent[];
  total_bytes_sent: number;
  total_bytes_received: number;
  connection_count: number;
}

// Fetch functions
async function fetchNetworkStats(hostname?: string): Promise<NetworkStats> {
  const url = hostname ? `${METRICS_API}/api/v3/ebpf/network/stats?hostname=${hostname}` : `${METRICS_API}/api/v3/ebpf/network/stats`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
}

async function fetchNetworkHistory(hostname?: string): Promise<{ samples: MetricsSample[] }> {
  const url = hostname ? `${METRICS_API}/api/v3/ebpf/network/history?samples=60&hostname=${hostname}` : `${METRICS_API}/api/v3/ebpf/network/history?samples=60`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
}

async function fetchSystemContext(): Promise<SystemContext> {
  const response = await fetch(`${METRICS_API}/api/v3/ebpf/network/context`);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
}

async function fetchTrends(hostname?: string): Promise<TrendsResponse> {
  const url = hostname ? `${METRICS_API}/api/v3/ebpf/network/trends?hostname=${hostname}` : `${METRICS_API}/api/v3/ebpf/network/trends`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
}

async function fetchAnomalies(hostname?: string): Promise<AnomaliesResponse> {
  const url = hostname ? `${METRICS_API}/api/v3/ebpf/network/anomalies?hostname=${hostname}` : `${METRICS_API}/api/v3/ebpf/network/anomalies`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
}

async function fetchProcessDrilldown(pid: number): Promise<ProcessDrilldown> {
  const response = await fetch(`${METRICS_API}/api/v3/ebpf/process/${pid}/drilldown`);
  if (!response.ok) throw new Error("Failed to fetch drilldown");
  return response.json();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function MetricsPanel({ selectedNode, compact = false }: MetricsPanelProps) {
  const hostname = selectedNode || undefined;
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

  const { data: networkStats, isLoading, error } = useQuery({
    queryKey: ["network-stats", selectedNode],
    queryFn: () => fetchNetworkStats(hostname),
    refetchInterval: 3000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["network-history", selectedNode],
    queryFn: () => fetchNetworkHistory(hostname),
    refetchInterval: 5000,
  });

  const { data: contextData } = useQuery({
    queryKey: ["system-context"],
    queryFn: fetchSystemContext,
    refetchInterval: 5000,
  });

  const { data: trendsData } = useQuery({
    queryKey: ["network-trends", selectedNode],
    queryFn: () => fetchTrends(hostname),
    refetchInterval: 10000,
  });

  const { data: anomaliesData } = useQuery({
    queryKey: ["network-anomalies", selectedNode],
    queryFn: () => fetchAnomalies(hostname),
    refetchInterval: 5000,
  });

  const { data: drilldownData, isLoading: drilldownLoading } = useQuery({
    queryKey: ["process-drilldown", selectedPid],
    queryFn: () => fetchProcessDrilldown(selectedPid!),
    enabled: selectedPid !== null,
  });

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

  const { bandwidth = [], connections, top_flows = [] } = networkStats || {};
  const samples = historyData?.samples || [];
  const context = contextData;
  const trends = trendsData;
  const anomalies: AnomalyEvent[] = anomaliesData?.anomalies || [];

  const chartData = samples.map((s: MetricsSample) => ({
    time: new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    p50: s.latency_p50,
    p90: s.latency_p90,
    p99: s.latency_p99,
    drops: s.packet_drops,
    openRate: s.open_rate,
    closeRate: s.close_rate,
  }));

  const criticalAnomalies = anomalies.filter((a: AnomalyEvent) => a.severity === "critical");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Drilldown Modal */}
      {selectedPid !== null && (
        <DrilldownModal 
          pid={selectedPid} 
          data={drilldownData} 
          loading={drilldownLoading} 
          onClose={() => setSelectedPid(null)} 
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between glass-header p-4 -mx-4 -mt-4 mb-4 rounded-b-xl sticky top-0 z-40">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Network size={24} />
            </span>
            <span className="gradient-text">Network Metrics</span>
          </h1>
          <p className="text-sm text-muted mt-1 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400 header-glow-success'}`} />
            {selectedNode ? `Server: ${selectedNode}` : "Fleet-wide Overview"} 
            <span className="text-slate-600">•</span> 
            {samples.length} samples
          </p>
        </div>
        {anomalies.length > 0 && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${criticalAnomalies.length > 0 ? "bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse-subtle" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"}`}>
            <Bell size={16} />
            <span className="text-sm font-semibold">{criticalAnomalies.length > 0 ? `${criticalAnomalies.length} Critical` : `${anomalies.length} Alerts`}</span>
          </div>
        )}
      </div>

      {/* Critical Alerts */}
      {criticalAnomalies.length > 0 && (
        <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 animate-slide-in">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-400" />
            <span className="font-semibold text-red-400 tracking-wide uppercase text-xs">Critical Alerts</span>
          </div>
          <div className="grid gap-2">
            {criticalAnomalies.slice(0, 3).map((a: AnomalyEvent, i: number) => (
              <div key={i} className="flex items-center justify-between bg-red-500/10 p-2 rounded border border-red-500/10">
                <span className="text-sm text-red-200">{a.description}</span>
                <span className="text-xs text-red-400 font-mono">{new Date(a.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Heads-Up Display (HUD) Context */}
      {context && (
        <div className="glass-panel p-3 flex flex-wrap gap-4 items-center justify-between animate-slide-in" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-2 px-2 border-r border-slate-700/50">
            <Server size={16} className="text-cyan-400" />
            <span className="font-semibold text-sm text-slate-300">System Context</span>
            {context.oom_risk && <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400 rounded-full animate-pulse border border-red-500/30">OOM RISK</span>}
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-2">
            <ContextTile icon={<MemoryStick size={14} />} label="Memory" value={`${context.memory_used_percent.toFixed(0)}%`} isAlert={context.memory_used_percent > 80} />
            <ContextTile icon={<Cpu size={14} />} label="CPU Sys" value={`${context.cpu_system_percent.toFixed(1)}%`} isAlert={context.cpu_system_percent > 50} />
            <ContextTile label="SoftIRQ" value={`${context.softirq_net_percent.toFixed(1)}%`} isAlert={context.softirq_net_percent > 30} />
            <ContextTile icon={<Gauge size={14} />} label="Queue" value={`${context.avg_socket_queue_depth}/${context.max_socket_queue_depth}`} />
            <ContextTile label="Pressure" value={`${context.socket_backlog_pressure.toFixed(0)}%`} isAlert={context.socket_backlog_pressure > 50} />
            <ContextTile label="Swap" value={`${context.swap_used_percent.toFixed(0)}%`} isAlert={context.swap_used_percent > 50} />
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 animate-slide-in" style={{ animationDelay: '200ms' }}>
        <StatCard icon={<Activity size={16} />} label="Connections" value={connections?.active_connections ?? 0} color="text-blue-400" />
        <StatCard icon={<Wifi size={16} />} label="Established" value={connections?.established ?? 0} color="text-green-400" />
        <StatCard label="Time Wait" value={connections?.time_wait ?? 0} color="text-yellow-400" />
        <StatCard label="Close Wait" value={connections?.close_wait ?? 0} color="text-orange-400" isAlert={(connections?.close_wait ?? 0) > 10} />
        <StatCard icon={<TrendingUp size={16} />} label="Open/sec" value={connections?.open_rate_per_sec?.toFixed(1) ?? "0"} color="text-cyan-400" />
        <StatCard icon={<TrendingDown size={16} />} label="Close/sec" value={connections?.close_rate_per_sec?.toFixed(1) ?? "0"} color="text-pink-400" />
        <StatCard icon={<ArrowUpDown size={16} />} label="Retransmits" value={connections?.total_retransmits ?? 0} color="text-purple-400" isAlert={(connections?.total_retransmits ?? 0) > 50} />
        <StatCard icon={<AlertTriangle size={16} />} label="Drops" value={connections?.packet_drops ?? 0} color={(connections?.packet_drops ?? 0) > 10 ? "text-red-400" : "text-green-400"} isAlert={(connections?.packet_drops ?? 0) > 10} />
      </div>

      {/* Trends */}
      {trends && (
        <div className="glass-panel p-4 animate-slide-in" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-purple-400" />
            <span className="font-semibold text-sm uppercase tracking-wider text-muted">Trend Analysis (5m vs 1h)</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <TrendTile trend={trends.latency_p99} label="p99 Latency" unit="ms" />
            <TrendTile trend={trends.latency_p50} label="p50 Latency" unit="ms" />
            <TrendTile trend={trends.retransmits} label="Retransmits" />
            <TrendTile trend={trends.packet_drops} label="Drops" />
            <TrendTile trend={trends.connections} label="Connections" />
          </div>
        </div>
      )}

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-in" style={{ animationDelay: '400ms' }}>
        <ChartCard 
          title="Latency (ms)" 
          icon={<Activity size={16} className="text-blue-400" />} 
          chartData={chartData} 
          lines={[{key: "p50", color: "#22c55e"}, {key: "p90", color: "#eab308"}, {key: "p99", color: "#ef4444"}]} 
        />
        <ChartCard 
          title="Connection Rate" 
          icon={<TrendingUp size={16} className="text-cyan-400" />} 
          chartData={chartData} 
          lines={[{key: "openRate", color: "#06b6d4"}, {key: "closeRate", color: "#ec4899"}]} 
        />
        <ChartCard 
          title="Drops" 
          icon={<AlertTriangle size={16} className="text-red-400" />} 
          chartData={chartData} 
          lines={[{key: "drops", color: "#ef4444"}]} 
        />
      </div>

      {/* Top Processes */}
      {context && context.top_cpu_processes.length > 0 && (
        <div className="glass-card p-6 animate-slide-in" style={{ animationDelay: '500ms' }}>
          <h3 className="font-semibold mb-6 flex items-center gap-2 text-sm uppercase tracking-wider text-muted">
            <Cpu size={16} className="text-orange-400" />
            Top Network Processes by CPU
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {context.top_cpu_processes.slice(0, 5).map((proc: ProcessHealth, i: number) => (
              <div 
                key={i} 
                onClick={() => setSelectedPid(proc.pid)}
                className="group p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:border-blue-500/30 hover:bg-slate-800/60 cursor-pointer transition-all hover:-translate-y-1"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-blue-400 text-sm truncate font-medium group-hover:text-blue-300">{proc.process_name}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${proc.cpu_percent > 50 ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                    {proc.cpu_percent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-muted group-hover:text-slate-400">
                  <span>{proc.memory_mb.toFixed(0)}MB Mem</span>
                  <span>{proc.socket_count} Socks</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bandwidth Table */}
      <div className="glass-card p-6 animate-slide-in" style={{ animationDelay: '600ms' }}>
        <h3 className="font-semibold mb-6 flex items-center gap-2 text-sm uppercase tracking-wider text-muted">
          <ArrowUpDown size={16} className="text-purple-400" />
          Bandwidth by Process
        </h3>
        {bandwidth.length === 0 ? (
          <p className="text-center text-muted py-8 italic">No active bandwidth data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted border-b border-white/5 font-medium text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-2">Process</th>
                  <th className="text-right py-3 px-2">Sent</th>
                  <th className="text-right py-3 px-2">Recv</th>
                  <th className="py-3 px-2 text-left pl-6">Total Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {bandwidth.slice(0, 10).map((proc: ProcessBandwidth, i: number) => {
                  const maxBytes = bandwidth[0]?.total_bytes || 1;
                  const barWidth = Math.max(2, (proc.total_bytes / maxBytes) * 100);
                  return (
                    <tr 
                      key={i} 
                      onClick={() => setSelectedPid(proc.pid)}
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-2 font-mono text-blue-400 font-medium">{proc.process_name}</td>
                      <td className="py-3 px-2 text-right text-slate-300">{formatBytes(proc.bytes_sent)}</td>
                      <td className="py-3 px-2 text-right text-green-400">{formatBytes(proc.bytes_received)}</td>
                      <td className="py-3 px-2 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-slate-800/50 rounded-full h-1.5 overflow-hidden w-32">
                            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${barWidth}%` }} />
                          </div>
                          <span className="text-xs text-muted w-16 text-right font-mono">{formatBytes(proc.total_bytes)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Flows Grid */}
      <div className="glass-card p-6 animate-slide-in" style={{ animationDelay: '700ms' }}>
        <h3 className="font-semibold mb-6 flex items-center gap-2 text-sm uppercase tracking-wider text-muted">
          <Network size={16} className="text-cyan-400" />
          Active Flows
        </h3>
        {top_flows.length === 0 ? (
          <p className="text-center text-muted py-8 italic">No active flows</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {top_flows.slice(0, 16).map((flow: FlowEdge, i: number) => (
              <div key={i} className={`p-3 rounded-lg bg-slate-800/20 border-l-[3px] ${flow.state === "ESTABLISHED" ? "border-l-green-500 bg-green-500/5" : "border-l-yellow-500 bg-yellow-500/5"} hover:bg-white/5 transition-colors text-xs`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="font-mono text-blue-400 font-medium truncate max-w-[100px]">{flow.source_process}</span>
                  <span className="text-muted text-[10px]">→</span>
                  <span className="font-mono text-slate-300 truncate">{flow.dest_ip === "0.0.0.0" ? "*" : flow.dest_ip.split(".").pop()}:{flow.dest_port}</span>
                </div>
                <div className="flex justify-between text-muted border-t border-white/5 pt-2 mt-1">
                  <span>{flow.connection_count} conns</span>
                  <span className={flow.state === "ESTABLISHED" ? "text-green-400 font-medium" : "text-yellow-400 font-medium"}>{flow.state.slice(0, 5)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Phase 3: Drilldown Modal Component
function DrilldownModal({ pid, data, loading, onClose }: { pid: number; data?: ProcessDrilldown; loading: boolean; onClose: () => void }) {
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
        <div className="glass-card p-8 rounded-2xl flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-blue-400 animate-pulse">Analyzing process...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const histogramData = data.rtt_histogram.map(b => ({
    range: `${b.range_start_ms}-${b.range_end_ms}`, // Simplified label
    count: b.count,
    percentage: b.percentage
  }));

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="glass-modal max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-3 text-white">
              <span className="p-2 rounded-lg bg-pink-500/20 text-pink-400">
                <Layers size={20} />
              </span>
              Process Drilldown: <span className="text-blue-400 font-mono">{data.health.process_name}</span>
            </h2>
            <p className="text-sm text-muted mt-1 ml-11">PID: <span className="font-mono text-slate-300">{pid}</span> • {data.connection_count} active connections</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-muted hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {/* Health Snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={<Cpu size={16} />} label="CPU Usage" value={`${data.health.cpu_percent.toFixed(1)}%`} color={data.health.cpu_percent > 50 ? "text-red-400" : "text-green-400"} />
            <StatCard icon={<MemoryStick size={16} />} label="Memory" value={`${data.health.memory_mb.toFixed(0)}MB`} color="text-blue-400" />
            <StatCard icon={<FileText size={16} />} label="Open FDs" value={data.health.open_fds} color="text-purple-400" />
            <StatCard icon={<Network size={16} />} label="Sockets" value={data.health.socket_count} color="text-cyan-400" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Syscall Breakdown */}
            <div className="glass-panel p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm uppercase text-muted">
                <Clock size={16} className="text-orange-400" />
                Syscall Activity
              </h3>
              <div className="grid grid-cols-5 gap-3 text-xs">
                {Object.entries({
                  read: { val: data.syscalls.read_count, col: "text-blue-400" },
                  write: { val: data.syscalls.write_count, col: "text-green-400" },
                  send: { val: data.syscalls.sendmsg_count, col: "text-purple-400" },
                  recv: { val: data.syscalls.recvmsg_count, col: "text-cyan-400" },
                  poll: { val: data.syscalls.poll_epoll_count, col: "text-yellow-400" }
                }).map(([key, info]) => (
                  <div key={key} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center hover:border-slate-600 transition-colors">
                    <p className={`text-lg font-bold ${info.col} mb-1`}>{info.val.toLocaleString()}</p>
                    <p className="text-muted uppercase tracking-wider text-[10px]">{key}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* RTT Histogram */}
            <div className="glass-panel p-5">
              <h3 className="font-semibold mb-4 text-sm uppercase text-muted">Latency Distribution (RTT)</h3>
              <div className="h-40">
                {histogramData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={histogramData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#64748b' }} stroke="rgba(255,255,255,0.1)" />
                      <YAxis stroke="rgba(255,255,255,0.1)" fontSize={10} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                          border: '1px solid rgba(255,255,255,0.1)', 
                          borderRadius: '8px' 
                        }} 
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted text-sm">No latency data available</div>
                )}
              </div>
            </div>
          </div>

          {/* Flows Table */}
          {data.flows.length > 0 && (
            <div className="glass-panel p-0 overflow-hidden">
              <div className="p-4 border-b border-white/10 bg-white/5">
                <h3 className="font-semibold text-sm uppercase text-muted">Active Connections ({data.flows.length})</h3>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10 shadow-sm">
                    <tr className="text-muted font-medium text-left">
                      <th className="py-3 px-4">Remote Address</th>
                      <th className="py-3 px-4">State</th>
                      <th className="py-3 px-4 text-right">RTT (ms)</th>
                      <th className="py-3 px-4 text-right">Traffic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.flows.slice(0, 50).map((f, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {f.dst_ip}:{f.dst_port}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${f.state === "ESTABLISHED" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                            {f.state}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-purple-300">{f.rtt_ms.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-muted">
                          Running
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Anomalies */}
          {data.recent_anomalies.length > 0 && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <h3 className="font-semibold mb-3 text-red-400 flex items-center gap-2">
                <AlertTriangle size={16} />
                Recent Anomalies
              </h3>
              <div className="space-y-2">
                {data.recent_anomalies.map((a, i) => (
                  <p key={i} className="text-sm text-red-200 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {a.description}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({ icon, label, value, color = "text-white", isAlert = false }: { icon?: React.ReactNode; label: string; value: number | string; color?: string; isAlert?: boolean }) {
  return (
    <div className={`glass-card hover-lift p-4 flex flex-col justify-between h-full group ${isAlert ? "border-red-500/30 bg-red-500/5" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className={`${color} opacity-80 group-hover:opacity-100 transition-opacity`}>{icon}</span>}
        <span className="text-xs text-muted uppercase tracking-wider font-medium truncate">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color} tracking-tight`}>{value}</p>
    </div>
  );
}

function ContextTile({ icon, label, value, isAlert = false }: { icon?: React.ReactNode; label: string; value: string; isAlert?: boolean }) {
  return (
    <div className={`glass-panel p-3 flex flex-col justify-center h-full ${isAlert ? "border-orange-500/30 bg-orange-500/5" : ""}`}>
      <div className="flex items-center gap-2 text-muted mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</span>
      </div>
      <p className={`font-mono font-bold text-sm ${isAlert ? "text-orange-400" : "text-white"}`}>{value}</p>
    </div>
  );
}

function TrendTile({ trend, label, unit = "" }: { trend: TrendComparison; label: string; unit?: string }) {
  const isUp = trend.trend === "up";
  const isDown = trend.trend === "down";
  const trendColor = trend.severity === "critical" ? "text-red-400" : trend.severity === "warning" ? "text-yellow-400" : "text-green-400";
  const borderColor = trend.severity === "critical" ? "border-red-500/30" : trend.severity === "warning" ? "border-yellow-500/30" : "border-white/5";
  const bgClass = trend.severity === "critical" ? "bg-red-500/5" : trend.severity === "warning" ? "bg-yellow-500/5" : "";
  
  return (
    <div className={`glass-panel p-3 ${borderColor} ${bgClass}`}>
      <div className="text-muted text-xs uppercase tracking-wider font-medium mb-1 truncate">{label}</div>
      <div className="flex items-end justify-between">
        <span className="font-bold text-lg text-white tracking-tight">{trend.current_5min.toFixed(1)}{unit}</span>
        <span className={`flex items-center text-xs font-medium ${trendColor} bg-white/5 px-1.5 py-0.5 rounded`}>
          {isUp && <TrendingUp size={12} className="mr-1" />}
          {isDown && <TrendingDown size={12} className="mr-1" />}
          {trend.delta_percent > 0 ? "+" : ""}{trend.delta_percent.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

interface ChartLine {
  key: string;
  color: string;
}

function ChartCard({ title, icon, chartData, lines }: { title: string; icon: React.ReactNode; chartData: { time: string }[]; lines: ChartLine[] }) {
  return (
    <div className="glass-card hover-lift p-4">
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider text-muted">
        {icon}
        {title}
      </h3>
      <div className="h-48">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                {lines.map((line) => (
                  <linearGradient key={line.key} id={`gradient-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={line.color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={line.color} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="time" 
                tick={{ fill: '#64748b', fontSize: 10 }} 
                axisLine={false}
                tickLine={false}
                dy={10}
              />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 10 }} 
                axisLine={false}
                tickLine={false}
                dx={-10}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  backdropFilter: 'blur(8px)'
                }}
                itemStyle={{ fontSize: '12px' }}
                labelStyle={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}
              />
              {lines.map((line) => (
                <Area 
                  key={line.key} 
                  type="monotone" 
                  dataKey={line.key} 
                  stroke={line.color} 
                  fill={`url(#gradient-${line.key})`}
                  strokeWidth={2}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted space-y-2">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-xs">Gathering metrics...</span>
          </div>
        )}
      </div>
    </div>
  );
}
