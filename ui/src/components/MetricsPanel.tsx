"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
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
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
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
    <div className="space-y-6">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network size={24} className="text-blue-400" />
            Network Metrics
          </h1>
          <p className="text-sm text-muted mt-1">
            {selectedNode ? `Server: ${selectedNode}` : "Fleet-wide"} • {samples.length} samples
          </p>
        </div>
        {anomalies.length > 0 && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${criticalAnomalies.length > 0 ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-yellow-500/20 text-yellow-400"}`}>
            <Bell size={14} />
            <span className="text-sm font-medium">{criticalAnomalies.length > 0 ? `${criticalAnomalies.length} Critical` : `${anomalies.length} Alerts`}</span>
          </div>
        )}
      </div>

      {/* Critical Alerts */}
      {criticalAnomalies.length > 0 && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-400" />
            <span className="font-semibold text-red-400">Critical Alerts</span>
          </div>
          {criticalAnomalies.slice(0, 3).map((a: AnomalyEvent, i: number) => (
            <p key={i} className="text-sm text-red-300">{a.description}</p>
          ))}
        </div>
      )}

      {/* Context */}
      {context && (
        <div className="card bg-gradient-to-r from-slate-900/50 to-slate-800/50">
          <div className="flex items-center gap-2 mb-3">
            <Server size={16} className="text-cyan-400" />
            <span className="font-semibold text-sm">System Context</span>
            {context.oom_risk && <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full animate-pulse">OOM Risk!</span>}
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
            <ContextTile icon={<MemoryStick size={14} />} label="Memory" value={`${context.memory_used_percent.toFixed(0)}%`} isAlert={context.memory_used_percent > 80} />
            <ContextTile icon={<Cpu size={14} />} label="CPU Sys" value={`${context.cpu_system_percent.toFixed(1)}%`} isAlert={context.cpu_system_percent > 50} />
            <ContextTile label="SoftIRQ" value={`${context.softirq_net_percent.toFixed(1)}%`} isAlert={context.softirq_net_percent > 30} />
            <ContextTile icon={<Gauge size={14} />} label="Queue" value={`${context.avg_socket_queue_depth}/${context.max_socket_queue_depth}`} />
            <ContextTile label="Pressure" value={`${context.socket_backlog_pressure.toFixed(0)}%`} isAlert={context.socket_backlog_pressure > 50} />
            <ContextTile label="Swap" value={`${context.swap_used_percent.toFixed(0)}%`} isAlert={context.swap_used_percent > 50} />
          </div>
        </div>
      )}

      {/* Trends */}
      {trends && (
        <div className="card bg-gradient-to-r from-purple-900/20 to-indigo-900/20">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-purple-400" />
            <span className="font-semibold text-sm">Trends (5min vs baseline)</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <TrendTile trend={trends.latency_p99} label="p99 Latency" unit="ms" />
            <TrendTile trend={trends.latency_p50} label="p50 Latency" unit="ms" />
            <TrendTile trend={trends.retransmits} label="Retransmits" />
            <TrendTile trend={trends.packet_drops} label="Drops" />
            <TrendTile trend={trends.connections} label="Connections" />
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard icon={<Activity size={16} />} label="Connections" value={connections?.active_connections ?? 0} color="text-blue-400" />
        <StatCard icon={<Wifi size={16} />} label="Established" value={connections?.established ?? 0} color="text-green-400" />
        <StatCard label="Time Wait" value={connections?.time_wait ?? 0} color="text-yellow-400" />
        <StatCard label="Close Wait" value={connections?.close_wait ?? 0} color="text-orange-400" isAlert={(connections?.close_wait ?? 0) > 10} />
        <StatCard icon={<TrendingUp size={16} />} label="Open/sec" value={connections?.open_rate_per_sec?.toFixed(1) ?? "0"} color="text-cyan-400" />
        <StatCard icon={<TrendingDown size={16} />} label="Close/sec" value={connections?.close_rate_per_sec?.toFixed(1) ?? "0"} color="text-pink-400" />
        <StatCard icon={<ArrowUpDown size={16} />} label="Retransmits" value={connections?.total_retransmits ?? 0} color="text-purple-400" isAlert={(connections?.total_retransmits ?? 0) > 50} />
        <StatCard icon={<AlertTriangle size={16} />} label="Drops" value={connections?.packet_drops ?? 0} color={(connections?.packet_drops ?? 0) > 10 ? "text-red-400" : "text-green-400"} isAlert={(connections?.packet_drops ?? 0) > 10} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="Latency (ms)" icon={<Activity size={16} className="text-blue-400" />} chartData={chartData} lines={[{key: "p50", color: "#22c55e"}, {key: "p90", color: "#eab308"}, {key: "p99", color: "#ef4444"}]} />
        <ChartCard title="Connection Rate" icon={<TrendingUp size={16} className="text-cyan-400" />} chartData={chartData} lines={[{key: "openRate", color: "#06b6d4"}, {key: "closeRate", color: "#ec4899"}]} />
        <ChartCard title="Drops" icon={<AlertTriangle size={16} className="text-red-400" />} chartData={chartData} lines={[{key: "drops", color: "#ef4444"}]} />
      </div>

      {/* Top Processes - Clickable for Drilldown */}
      {context && context.top_cpu_processes.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Cpu size={16} className="text-orange-400" />
            Top Network Processes by CPU
            <span className="text-xs text-muted font-normal">(click for details)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
            {context.top_cpu_processes.slice(0, 5).map((proc: ProcessHealth, i: number) => (
              <div 
                key={i} 
                onClick={() => setSelectedPid(proc.pid)}
                className="p-2 rounded bg-surface-hover border border-border/50 text-xs cursor-pointer hover:border-primary/50 hover:bg-primary/10 transition-all"
              >
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-blue-400 truncate">{proc.process_name}</span>
                  <span className={`font-bold ${proc.cpu_percent > 50 ? "text-red-400" : "text-green-400"}`}>{proc.cpu_percent.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Mem: {proc.memory_mb.toFixed(0)}MB</span>
                  <span>Socks: {proc.socket_count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bandwidth Table - Clickable */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <ArrowUpDown size={16} className="text-purple-400" />
          Bandwidth by Process
        </h3>
        {bandwidth.length === 0 ? (
          <p className="text-center text-muted py-8">No data</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left py-2">Process</th>
                <th className="text-right py-2">Sent</th>
                <th className="text-right py-2">Recv</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {bandwidth.slice(0, 10).map((proc: ProcessBandwidth, i: number) => {
                const maxBytes = bandwidth[0]?.total_bytes || 1;
                const barWidth = Math.max(5, (proc.total_bytes / maxBytes) * 100);
                return (
                  <tr 
                    key={i} 
                    onClick={() => setSelectedPid(proc.pid)}
                    className="border-b border-border/50 hover:bg-surface-hover cursor-pointer"
                  >
                    <td className="py-2 font-mono text-blue-400">{proc.process_name}</td>
                    <td className="py-2 text-right">{formatBytes(proc.bytes_sent)}</td>
                    <td className="py-2 text-right text-green-400">{formatBytes(proc.bytes_received)}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-surface-hover rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="text-xs text-muted w-16 text-right">{formatBytes(proc.total_bytes)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Flows */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Network size={16} className="text-cyan-400" />
          Active Flows
        </h3>
        {top_flows.length === 0 ? (
          <p className="text-center text-muted py-8">No flows</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {top_flows.slice(0, 16).map((flow: FlowEdge, i: number) => (
              <div key={i} className={`p-2 rounded-lg bg-surface-hover border-l-2 ${flow.state === "ESTABLISHED" ? "border-l-green-500" : "border-l-yellow-500"} text-xs`}>
                <div className="flex items-center gap-1 mb-1">
                  <span className="font-mono text-blue-400">{flow.source_process}</span>
                  <span className="text-muted">→</span>
                  <span className="font-mono text-muted">{flow.dest_ip === "0.0.0.0" ? "*" : flow.dest_ip.split(".").pop()}:{flow.dest_port}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>{flow.connection_count}×</span>
                  <span className={flow.state === "ESTABLISHED" ? "text-green-400" : "text-yellow-400"}>{flow.state.slice(0, 5)}</span>
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
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={onClose}>
        <div className="bg-surface p-8 rounded-xl">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const histogramData = data.rtt_histogram.map(b => ({
    range: `${b.range_start_ms}-${b.range_end_ms}ms`,
    count: b.count,
    percentage: b.percentage
  }));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Layers size={20} className="text-purple-400" />
              Process Drilldown: {data.health.process_name}
            </h2>
            <p className="text-sm text-muted">PID: {pid} • {data.connection_count} connections</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-hover rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Health Snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Cpu size={16} />} label="CPU" value={`${data.health.cpu_percent.toFixed(1)}%`} color={data.health.cpu_percent > 50 ? "text-red-400" : "text-green-400"} />
            <StatCard icon={<MemoryStick size={16} />} label="Memory" value={`${data.health.memory_mb.toFixed(0)}MB`} color="text-blue-400" />
            <StatCard icon={<FileText size={16} />} label="FDs" value={data.health.open_fds} color="text-purple-400" />
            <StatCard icon={<Network size={16} />} label="Sockets" value={data.health.socket_count} color="text-cyan-400" />
          </div>

          {/* Syscall Breakdown */}
          <div className="card">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Clock size={16} className="text-orange-400" />
              Syscall Breakdown
            </h3>
            <div className="grid grid-cols-5 gap-2 text-xs">
              <div className="p-2 rounded bg-slate-800/50 text-center">
                <p className="text-lg font-bold text-blue-400">{data.syscalls.read_count.toLocaleString()}</p>
                <p className="text-muted">read</p>
              </div>
              <div className="p-2 rounded bg-slate-800/50 text-center">
                <p className="text-lg font-bold text-green-400">{data.syscalls.write_count.toLocaleString()}</p>
                <p className="text-muted">write</p>
              </div>
              <div className="p-2 rounded bg-slate-800/50 text-center">
                <p className="text-lg font-bold text-purple-400">{data.syscalls.sendmsg_count}</p>
                <p className="text-muted">sendmsg</p>
              </div>
              <div className="p-2 rounded bg-slate-800/50 text-center">
                <p className="text-lg font-bold text-cyan-400">{data.syscalls.recvmsg_count}</p>
                <p className="text-muted">recvmsg</p>
              </div>
              <div className="p-2 rounded bg-slate-800/50 text-center">
                <p className="text-lg font-bold text-yellow-400">{data.syscalls.poll_epoll_count}</p>
                <p className="text-muted">poll/epoll</p>
              </div>
            </div>
          </div>

          {/* RTT Histogram */}
          {histogramData.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-3">RTT Histogram</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogramData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
                    <XAxis dataKey="range" tick={{ fontSize: 10 }} stroke="#606070" />
                    <YAxis stroke="#606070" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1a24", border: "1px solid #2a2a38", borderRadius: "8px" }} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Flows */}
          {data.flows.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-3">Connections ({data.flows.length})</h3>
              <div className="max-h-48 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-muted">
                      <th className="text-left py-1">Source</th>
                      <th className="text-left py-1">Destination</th>
                      <th className="text-left py-1">State</th>
                      <th className="text-right py-1">RTT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.flows.slice(0, 20).map((f, i) => (
                      <tr key={i} className="border-t border-border/30">
                        <td className="py-1 font-mono">{f.src_ip}:{f.src_port}</td>
                        <td className="py-1 font-mono">{f.dst_ip}:{f.dst_port}</td>
                        <td className={`py-1 ${f.state === "ESTABLISHED" ? "text-green-400" : "text-yellow-400"}`}>{f.state}</td>
                        <td className="py-1 text-right">{f.rtt_ms.toFixed(2)}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Anomalies */}
          {data.recent_anomalies.length > 0 && (
            <div className="card bg-red-500/5 border border-red-500/20">
              <h3 className="font-semibold mb-2 text-red-400">Recent Anomalies</h3>
              {data.recent_anomalies.map((a, i) => (
                <p key={i} className="text-sm text-red-300">{a.description}</p>
              ))}
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
    <div className={`card p-2 ${isAlert ? "border-red-500/50" : ""}`}>
      <div className="flex items-center gap-1 mb-0.5">
        {icon && <span className={color}>{icon}</span>}
        <span className="text-xs text-muted truncate">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ContextTile({ icon, label, value, isAlert = false }: { icon?: React.ReactNode; label: string; value: string; isAlert?: boolean }) {
  return (
    <div className={`p-2 rounded bg-slate-800/50 ${isAlert ? "border border-orange-500/50" : "border border-slate-700/50"}`}>
      <div className="flex items-center gap-1 text-muted mb-0.5">{icon}<span className="truncate">{label}</span></div>
      <p className={`font-bold ${isAlert ? "text-orange-400" : "text-white"}`}>{value}</p>
    </div>
  );
}

function TrendTile({ trend, label, unit = "" }: { trend: TrendComparison; label: string; unit?: string }) {
  const isUp = trend.trend === "up";
  const isDown = trend.trend === "down";
  const trendColor = trend.severity === "critical" ? "text-red-400" : trend.severity === "warning" ? "text-yellow-400" : "text-green-400";
  const bgColor = trend.severity === "critical" ? "bg-red-500/10 border-red-500/30" : trend.severity === "warning" ? "bg-yellow-500/10 border-yellow-500/30" : "bg-slate-800/50 border-slate-700/50";
  
  return (
    <div className={`p-2 rounded border ${bgColor}`}>
      <div className="text-muted mb-1 truncate">{label}</div>
      <div className="flex items-center justify-between">
        <span className="font-bold text-white">{trend.current_5min.toFixed(1)}{unit}</span>
        <span className={`flex items-center text-xs ${trendColor}`}>
          {isUp && <TrendingUp size={12} className="mr-0.5" />}
          {isDown && <TrendingDown size={12} className="mr-0.5" />}
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
    <div className="card">
      <h3 className="font-semibold mb-3 flex items-center gap-2">{icon}{title}</h3>
      <div className="h-40">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
              <XAxis dataKey="time" tick={false} stroke="#606070" />
              <YAxis stroke="#606070" fontSize={10} />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a24", border: "1px solid #2a2a38", borderRadius: "8px" }} />
              {lines.map((line) => (
                <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={2} dot={false} />
              ))}
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">Collecting...</div>
        )}
      </div>
    </div>
  );
}
