"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMetrics } from "@/lib/api";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area 
} from "recharts";

interface MetricsPanelProps {
  selectedNode: string | null;
  compact?: boolean;
}

export function MetricsPanel({ selectedNode, compact = false }: MetricsPanelProps) {
  // Placeholder data - would come from API
  const cpuData = generateMetricData("cpu");
  const memoryData = generateMetricData("memory");
  const networkData = generateMetricData("network");
  const diskData = generateMetricData("disk");

  if (compact) {
    return (
      <div className="w-full h-full">
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
  data: { time: string; value: number }[]; 
  color: string; 
  unit: string;
}) {
  const currentValue = data[data.length - 1]?.value ?? 0;
  const avgValue = data.reduce((sum, d) => sum + d.value, 0) / data.length;

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

// Generate placeholder metric data
function generateMetricData(type: string): { time: string; value: number }[] {
  const data = [];
  const now = new Date();
  
  for (let i = 30; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000);
    let value: number;

    switch (type) {
      case "cpu":
        value = 30 + Math.random() * 40 + Math.sin(i / 5) * 10;
        break;
      case "memory":
        value = 50 + Math.random() * 20 + Math.sin(i / 8) * 5;
        break;
      case "network":
        value = 5 + Math.random() * 10;
        break;
      case "disk":
        value = 2 + Math.random() * 5;
        break;
      default:
        value = Math.random() * 100;
    }

    data.push({
      time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      value: Math.max(0, value),
    });
  }

  return data;
}
