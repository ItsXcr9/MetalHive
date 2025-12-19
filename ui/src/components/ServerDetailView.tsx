"use client";

import { useQuery } from "@tanstack/react-query";
import { 
  Server, Cpu, MemoryStick, HardDrive, Network, 
  Activity, Clock, ChevronRight, ExternalLink, 
  RefreshCw, AlertTriangle, CheckCircle, Container,
  Brain, Sparkles, TrendingUp, Zap, FileText
} from "lucide-react";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://65.109.200.75:6080";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://65.109.200.75:8080";

interface ServerDetailViewProps {
  hostname: string;
  onBack: () => void;
}

interface ServerInfo {
  hostname: string;
  cpu_cores: number;
  memory_total_gb: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_free_gb: number;
}

interface MetricData {
  data: Array<{ timestamp: string; value: number }>;
}

interface NetworkStats {
  connections: {
    active_connections: number;
    established: number;
    packet_drops: number;
    total_retransmits: number;
  };
  latency: { p50: number; p90: number; p99: number };
}

interface AnomalyPrediction {
  metric: string;
  current_value: number;
  anomaly_probability: number;
  is_anomaly: boolean;
  severity: string;
  direction: string;
  recommendation: string;
}

interface ProcessFlow {
  process_name: string;
  bytes_sent: number;
  bytes_received: number;
  active_flows: number;
}

interface MLStatus {
  status: string;
  capabilities: {
    prophet_forecasting: boolean;
    isolation_forest_anomaly: boolean;
    pandas_dataframes: boolean;
  };
}

async function fetchServerData(hostname: string) {
  const [infoRes, cpuRes, memRes, networkRes] = await Promise.all([
    fetch(`${METRICS_API}/api/servers/info`),
    fetch(`${METRICS_API}/api/metrics/cpu?hostname=${hostname}&limit=30`),
    fetch(`${METRICS_API}/api/metrics/memory?hostname=${hostname}&limit=30`),
    fetch(`${METRICS_API}/api/v3/ebpf/network/stats?hostname=${hostname}`),
  ]);

  const [info, cpu, memory, network] = await Promise.all([
    infoRes.ok ? infoRes.json() : { servers: {} },
    cpuRes.ok ? cpuRes.json() : { data: [] },
    memRes.ok ? memRes.json() : { data: [] },
    networkRes.ok ? networkRes.json() : { connections: {}, latency: {} },
  ]);

  return {
    info: info.servers?.[hostname] as ServerInfo,
    cpu: cpu as MetricData,
    memory: memory as MetricData,
    network: network as NetworkStats,
  };
}

// Fetch AI/ML predictions
async function fetchAIPredictions(hostname: string) {
  try {
    const res = await fetch(`${METRICS_API}/api/v3/ai/intelligence/ml/predict/${hostname}`);
    if (!res.ok) throw new Error("Failed");
    return res.json();
  } catch {
    return { resource_predictions: {}, anomaly_predictions: {} };
  }
}

// Fetch ML engine status
async function fetchMLStatus(): Promise<MLStatus> {
  try {
    const res = await fetch(`${METRICS_API}/api/v3/ai/intelligence/ml/status`);
    if (!res.ok) throw new Error("Failed");
    return res.json();
  } catch {
    return { 
      status: "unknown", 
      capabilities: { prophet_forecasting: false, isolation_forest_anomaly: false, pandas_dataframes: false } 
    };
  }
}

// Fetch process flows from AncientReport dashboard
async function fetchProcessFlows(hostname: string) {
  try {
    const res = await fetch(`${API_URL}/api/v1/products/ancientreport/dashboard?hostname=${hostname}`);
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    return data.metrics?.process_flows || [];
  } catch {
    return [];
  }
}

// Format bytes helper
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Circular Gauge Component
function CircularGauge({ 
  value, 
  label, 
  icon, 
  color,
  subtitle
}: { 
  value: number; 
  label: string; 
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}) {
  const strokeColor = value > 90 ? "#ef4444" : value > 75 ? "#f59e0b" : color;
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center p-4 bg-surface-hover rounded-xl">
      <div className="flex items-center gap-2 mb-3 text-muted">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      
      <div className="relative w-28 h-28">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="56"
            cy="56"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-border"
          />
          <circle
            cx="56"
            cy="56"
            r="42"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              stroke: strokeColor,
              transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease"
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{value.toFixed(1)}%</span>
        </div>
      </div>
      
      {subtitle && (
        <span className="mt-2 text-xs text-muted">{subtitle}</span>
      )}
    </div>
  );
}

// Stat Card Component  
function StatCard({ 
  label, 
  value, 
  icon, 
  trend,
  color = "blue"
}: { 
  label: string; 
  value: string | number; 
  icon: React.ReactNode;
  trend?: "up" | "down" | "stable";
  color?: string;
}) {
  const colorClasses = {
    blue: "text-blue-400",
    green: "text-green-400",
    orange: "text-orange-400",
    purple: "text-purple-400",
    red: "text-red-400",
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={colorClasses[color as keyof typeof colorClasses]}>{icon}</span>
        <span className="text-xs text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${colorClasses[color as keyof typeof colorClasses]}`}>
        {value}
      </p>
      {trend && (
        <span className={`text-xs ${trend === "up" ? "text-red-400" : trend === "down" ? "text-green-400" : "text-muted"}`}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trend}
        </span>
      )}
    </div>
  );
}

// Mini Sparkline
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 120;
  const height = 32;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ServerDetailView({ hostname, onBack }: ServerDetailViewProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["server-detail", hostname],
    queryFn: () => fetchServerData(hostname),
    refetchInterval: 10000,
  });

  // AI Predictions query
  const { data: aiData } = useQuery({
    queryKey: ["ai-predictions", hostname],
    queryFn: () => fetchAIPredictions(hostname),
    refetchInterval: 30000,
  });

  // ML Status query
  const { data: mlStatus } = useQuery({
    queryKey: ["ml-status"],
    queryFn: fetchMLStatus,
    refetchInterval: 60000,
  });

  // Process flows query
  const { data: processFlows } = useQuery({
    queryKey: ["process-flows", hostname],
    queryFn: () => fetchProcessFlows(hostname),
    refetchInterval: 30000,
  });

  const ancientReportUrl = `${METRICS_API}?server=${encodeURIComponent(hostname)}`;
  
  // Extract AI data
  const anomalies = aiData?.anomaly_predictions || {};
  const hasAnomalies = Object.values(anomalies).some((a: any) => a.is_anomaly);
  const anomalyCount = Object.values(anomalies).filter((a: any) => a.is_anomaly).length;
  const topProcesses = (processFlows || []).slice(0, 5) as ProcessFlow[];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-surface-hover rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 bg-surface-hover rounded-xl" />)}
        </div>
        <div className="h-48 bg-surface-hover rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 text-red-400" size={48} />
        <h3 className="text-lg font-semibold mb-2">Failed to load server data</h3>
        <button onClick={() => refetch()} className="btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  const { info, cpu, memory, network } = data;
  
  // Calculate current values
  const cpuCurrent = cpu.data?.[0]?.value || 0;
  const memCurrent = memory.data?.[0]?.value || 0;
  const diskUsedPercent = info ? (info.disk_used_gb / info.disk_total_gb) * 100 : 0;
  
  // Sparkline data (reverse to show oldest first)
  const cpuHistory = cpu.data?.slice(0, 20)?.reverse()?.map((d: { value: number }) => d.value) || [];
  const memHistory = memory.data?.slice(0, 20)?.reverse()?.map((d: { value: number }) => d.value) || [];

  // Determine health status
  const getHealthStatus = () => {
    if (cpuCurrent > 90 || memCurrent > 90 || diskUsedPercent > 95) return "critical";
    if (cpuCurrent > 80 || memCurrent > 80 || diskUsedPercent > 85) return "warning";
    return "healthy";
  };
  
  const healthStatus = getHealthStatus();
  const statusConfig = {
    healthy: { color: "text-green-400", bg: "bg-green-500/20", icon: <CheckCircle size={20} /> },
    warning: { color: "text-yellow-400", bg: "bg-yellow-500/20", icon: <AlertTriangle size={20} /> },
    critical: { color: "text-red-400", bg: "bg-red-500/20", icon: <AlertTriangle size={20} /> },
  };

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20">
              <Server size={32} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                {hostname}
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig[healthStatus].bg} ${statusConfig[healthStatus].color}`}>
                  {statusConfig[healthStatus].icon}
                  <span className="ml-1 capitalize">{healthStatus}</span>
                </span>
              </h1>
              <p className="text-muted mt-1 flex items-center gap-4">
                {info && (
                  <>
                    <span className="flex items-center gap-1">
                      <Cpu size={14} /> {info.cpu_cores} cores
                    </span>
                    <span className="flex items-center gap-1">
                      <MemoryStick size={14} /> {info.memory_total_gb?.toFixed(1)} GB RAM
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive size={14} /> {info.disk_total_gb?.toFixed(0)} GB Disk
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => refetch()}
              className="btn btn-ghost btn-sm"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button 
              onClick={onBack}
              className="btn btn-secondary"
            >
              ← Back to Fleet
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CircularGauge 
          value={cpuCurrent}
          label="CPU Usage"
          icon={<Cpu size={18} />}
          color="#3b82f6"
          subtitle={`${info?.cpu_cores || 0} cores`}
        />
        <CircularGauge 
          value={memCurrent}
          label="Memory"
          icon={<MemoryStick size={18} />}
          color="#8b5cf6"
          subtitle={`${info?.memory_total_gb?.toFixed(1) || 0} GB total`}
        />
        <CircularGauge 
          value={diskUsedPercent}
          label="Disk Usage"
          icon={<HardDrive size={18} />}
          color="#06b6d4"
          subtitle={`${info?.disk_free_gb?.toFixed(0) || 0} GB free`}
        />
        <div className="flex flex-col items-center p-4 bg-surface-hover rounded-xl">
          <div className="flex items-center gap-2 mb-3 text-muted">
            <Network size={18} />
            <span className="text-sm font-medium">Network</span>
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-blue-400">
              {network.connections?.active_connections || 0}
              <span className="text-xs font-normal text-muted ml-1">conns</span>
            </p>
            <p className="text-sm">
              <span className="text-green-400">{network.connections?.established || 0}</span>
              <span className="text-muted"> est</span>
            </p>
            <p className={`text-sm ${(network.connections?.packet_drops || 0) > 0 ? "text-red-400" : "text-green-400"}`}>
              {network.connections?.packet_drops || 0} drops
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Trend Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-blue-400" />
              <span className="font-medium">CPU Trend</span>
            </div>
            <span className="text-sm text-muted">Last 20 samples</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-blue-400">{cpuCurrent.toFixed(1)}%</span>
            <MiniSparkline data={cpuHistory} color="#3b82f6" />
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MemoryStick size={18} className="text-purple-400" />
              <span className="font-medium">Memory Trend</span>
            </div>
            <span className="text-sm text-muted">Last 20 samples</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-purple-400">{memCurrent.toFixed(1)}%</span>
            <MiniSparkline data={memHistory} color="#8b5cf6" />
          </div>
        </div>
      </div>

      {/* Network & Latency Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          label="Active Connections" 
          value={network.connections?.active_connections || 0}
          icon={<Activity size={18} />}
          color="blue"
        />
        <StatCard 
          label="Established" 
          value={network.connections?.established || 0}
          icon={<Network size={18} />}
          color="green"
        />
        <StatCard 
          label="Retransmits" 
          value={network.connections?.total_retransmits || 0}
          icon={<RefreshCw size={18} />}
          color="orange"
        />
        <StatCard 
          label="P50 Latency" 
          value={`${(network.latency?.p50 || 0).toFixed(1)}ms`}
          icon={<Clock size={18} />}
          color="purple"
        />
      </div>

      {/* AI Insights Section */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Brain size={22} className="text-purple-400" />
            <h3 className="font-semibold text-lg">AI Insights</h3>
          </div>
          
          {/* ML Status Badge */}
          {mlStatus && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              mlStatus.status === "operational" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
            }`}>
              <Sparkles size={14} />
              <span>ML: {mlStatus.status}</span>
            </div>
          )}
        </div>
        
        {/* Anomaly Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className={`p-3 rounded-lg border ${hasAnomalies ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
            <div className="flex items-center gap-2 mb-1">
              {hasAnomalies ? <AlertTriangle size={16} className="text-red-400" /> : <CheckCircle size={16} className="text-green-400" />}
              <span className="text-xs text-muted">Anomalies</span>
            </div>
            <p className={`text-xl font-bold ${hasAnomalies ? "text-red-400" : "text-green-400"}`}>
              {anomalyCount}
            </p>
          </div>
          
          <div className="p-3 rounded-lg border bg-blue-500/10 border-blue-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={16} className="text-blue-400" />
              <span className="text-xs text-muted">Metrics</span>
            </div>
            <p className="text-xl font-bold text-blue-400">{Object.keys(anomalies).length}</p>
          </div>
          
          <div className="p-3 rounded-lg border bg-purple-500/10 border-purple-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-purple-400" />
              <span className="text-xs text-muted">ML Method</span>
            </div>
            <p className="text-sm font-bold text-purple-400">
              {mlStatus?.capabilities?.isolation_forest_anomaly ? "IsolationForest" : "Z-Score"}
            </p>
          </div>
          
          <div className="p-3 rounded-lg border bg-cyan-500/10 border-cyan-500/30">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-cyan-400" />
              <span className="text-xs text-muted">Forecasting</span>
            </div>
            <p className="text-sm font-bold text-cyan-400">
              {mlStatus?.capabilities?.prophet_forecasting ? "Prophet" : "Linear"}
            </p>
          </div>
        </div>
        
        {/* Anomaly Details (if any) */}
        {hasAnomalies && Object.entries(anomalies).filter(([, a]: [string, any]) => a.is_anomaly).slice(0, 3).map(([key, anomaly]: [string, any]) => (
          <div key={key} className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 mb-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-red-400">{anomaly.metric}</span>
              <span className="text-sm text-muted">{anomaly.current_value?.toFixed(1)}%</span>
            </div>
            <p className="text-xs text-muted mt-1">{anomaly.recommendation}</p>
          </div>
        ))}
      </div>

      {/* Top Processes - Network Usage */}
      {topProcesses.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <FileText size={20} className="text-blue-400" />
            <h3 className="font-semibold">Top Processes by Network Usage</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Process</th>
                  <th className="text-right py-2">Sent</th>
                  <th className="text-right py-2">Received</th>
                  <th className="text-right py-2">Flows</th>
                </tr>
              </thead>
              <tbody>
                {topProcesses.map((flow, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-hover">
                    <td className="py-2 font-mono">{flow.process_name}</td>
                    <td className="py-2 text-right text-blue-400">{formatBytes(flow.bytes_sent)}</td>
                    <td className="py-2 text-right text-green-400">{formatBytes(flow.bytes_received)}</td>
                    <td className="py-2 text-right text-muted">{flow.active_flows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Advanced Metrics Link */}
      <a 
        href={ancientReportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between w-full p-6 rounded-xl bg-gradient-to-r from-blue-600/20 via-purple-600/15 to-cyan-600/20 border border-blue-500/30 hover:border-blue-400/50 transition-all hover:shadow-xl hover:shadow-blue-500/10 group"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-500/30">
            <Activity size={28} className="text-blue-400" />
          </div>
          <div>
            <span className="text-lg font-semibold block text-white">
              Advanced Observability in AncientReport
            </span>
            <span className="text-sm text-muted">
              Processes • Network Flows • eBPF Traces • Anomaly Detection • Time-series Charts
            </span>
          </div>
        </div>
        <ChevronRight size={24} className="text-muted group-hover:text-white group-hover:translate-x-1 transition-all" />
      </a>
    </div>
  );
}

export default ServerDetailView;
