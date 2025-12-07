"use client";

import { useQuery } from "@tanstack/react-query";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area 
} from "recharts";

// Use AncientReport API for metrics (via MetalHive controller proxy)
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://localhost:8800";

interface MetricsPanelProps {
  selectedNode: string | null;
  compact?: boolean;
}

interface MetricDataPoint {
  timestamp: string;
  value: number;
  time?: string;
}

async function fetchMetricData(metricType: string, period: string = "1h"): Promise<MetricDataPoint[]> {
  try {
    const response = await fetch(`${METRICS_API}/api/metrics/${metricType}?period=${period}`);
    if (!response.ok) {
      console.warn(`Failed to fetch ${metricType} metrics`);
      return [];
    }
    const data = await response.json();
    const rawData = data.data || data || [];
    
    // Transform the data based on metric type
    return rawData.map((point: Record<string, unknown>) => {
      let value = 0;
      
      if (metricType === "network") {
        // Network has sent/received in KB/s, convert to MB/s
        const sent = (point.sent as number) || 0;
        const received = (point.received as number) || 0;
        value = (sent + received) / 1024; // Convert KB/s to MB/s
      } else if (metricType === "disk") {
        // Disk has reads/writes in KB/s, convert to MB/s
        const reads = (point.reads as number) || 0;
        const writes = (point.writes as number) || 0;
        value = (reads + writes) / 1024; // Convert KB/s to MB/s
      } else {
        // CPU and Memory have value directly
        value = (point.value as number) || 0;
      }
      
      return {
        timestamp: point.timestamp as string,
        value,
        time: new Date(point.timestamp as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
    });
  } catch (error) {
    console.warn(`Error fetching ${metricType} metrics:`, error);
    return [];
  }
}

export function MetricsPanel({ selectedNode, compact = false }: MetricsPanelProps) {
  // Fetch real metrics from AncientReport
  const { data: cpuData = [] } = useQuery({
    queryKey: ["metrics", "cpu"],
    queryFn: () => fetchMetricData("cpu"),
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
  });

  const { data: memoryData = [] } = useQuery({
    queryKey: ["metrics", "memory"],
    queryFn: () => fetchMetricData("memory"),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: networkData = [] } = useQuery({
    queryKey: ["metrics", "network"],
    queryFn: () => fetchMetricData("network"),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: diskData = [] } = useQuery({
    queryKey: ["metrics", "disk"],
    queryFn: () => fetchMetricData("disk"),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // Use real data if available, otherwise show empty state
  const hasData = cpuData.length > 0;

  if (compact) {
    return (
      <div className="w-full h-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cpuData}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorCpu)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Waiting for metrics data...
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Metrics</h1>
        <p className="text-sm text-muted mt-1">
          {selectedNode ? `Showing metrics for ${selectedNode}` : "Fleet-wide metrics"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MetricCard title="CPU Usage" data={cpuData} color="#3b82f6" unit="%" />
        <MetricCard title="Memory Usage" data={memoryData} color="#22c55e" unit="%" />
        <MetricCard title="Network I/O" data={networkData} color="#a855f7" unit="MB/s" />
        <MetricCard title="Disk I/O" data={diskData} color="#eab308" unit="MB/s" />
      </div>
    </div>
  );
}

function MetricCard({ 
  title, 
  data, 
  color, 
  unit 
}: { 
  title: string; 
  data: MetricDataPoint[]; 
  color: string; 
  unit: string;
}) {
  const currentValue = data[data.length - 1]?.value ?? 0;
  const avgValue = data.length > 0 
    ? data.reduce((sum, d) => sum + d.value, 0) / data.length 
    : 0;

  if (data.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <div className="text-right">
            <p className="text-2xl font-bold text-muted">--</p>
            <p className="text-xs text-muted">No data</p>
          </div>
        </div>
        <div className="h-48 flex items-center justify-center text-muted text-sm">
          Waiting for data...
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        <div className="text-right">
          <p className="text-2xl font-bold" style={{ color }}>
            {currentValue.toFixed(1)}{unit}
          </p>
          <p className="text-xs text-muted">Avg: {avgValue.toFixed(1)}{unit}</p>
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`color-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
            <XAxis 
              dataKey="time" 
              stroke="#606070" 
              fontSize={10}
              tickLine={false}
            />
            <YAxis 
              stroke="#606070" 
              fontSize={10}
              tickLine={false}
              tickFormatter={(v) => `${v}${unit}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1a1a24",
                border: "1px solid #2a2a38",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#a0a0b0" }}
              formatter={(value: number) => [`${value.toFixed(1)}${unit}`, title]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#color-${title})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
