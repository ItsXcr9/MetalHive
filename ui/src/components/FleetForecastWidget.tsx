"use client";

import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw
} from "lucide-react";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://65.109.200.75:6800";

interface ResourcePrediction {
  metric: string;
  current_value: number;
  predicted_values: number[];
  trend: string;
  confidence: number;
}

interface AnomalyPrediction {
  metric: string;
  current_value: number;
  is_anomaly: boolean;
  severity: string;
  recommendation: string;
}

async function fetchPredictions(hostname: string): Promise<{
  resource_predictions: Record<string, ResourcePrediction>;
  anomaly_predictions: Record<string, AnomalyPrediction>;
}> {
  try {
    const res = await fetch(`${METRICS_API}/api/v3/ai/intelligence/ml/predict/${hostname}`);
    if (!res.ok) throw new Error("Failed");
    return res.json();
  } catch {
    return { resource_predictions: {}, anomaly_predictions: {} };
  }
}

interface FleetForecastWidgetProps {
  selectedNode?: string | null;
}

export function FleetForecastWidget({ selectedNode }: FleetForecastWidgetProps) {
  const hostname = selectedNode || "xcr9";
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["fleet-forecast", hostname],
    queryFn: () => fetchPredictions(hostname),
    refetchInterval: 60000,
  });

  const predictions = data?.resource_predictions || {};
  const anomalies = data?.anomaly_predictions || {};

  const getTrendIcon = (trend: string) => {
    if (trend === "increasing") return <TrendingUp className="text-red-400" size={16} />;
    if (trend === "decreasing") return <TrendingDown className="text-green-400" size={16} />;
    return <Activity className="text-blue-400" size={16} />;
  };

  const getTrendColor = (trend: string) => {
    if (trend === "increasing") return "text-red-400";
    if (trend === "decreasing") return "text-green-400";
    return "text-blue-400";
  };

  const getMetricIcon = (metric: string) => {
    if (metric.includes("cpu")) return <Cpu className="text-blue-400" size={18} />;
    if (metric.includes("memory")) return <MemoryStick className="text-purple-400" size={18} />;
    return <HardDrive className="text-cyan-400" size={18} />;
  };

  const hasAnomalies = Object.values(anomalies).some((a) => a.is_anomaly);

  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock size={18} className="text-purple-400" />
            Fleet Forecast
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse bg-surface-hover rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock size={18} className="text-purple-400" />
          Fleet Forecast
          {hasAnomalies && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">
              Anomaly
            </span>
          )}
        </h3>
        <button 
          onClick={() => refetch()} 
          className="p-1.5 hover:bg-surface-hover rounded-lg"
          title="Refresh"
        >
          <RefreshCw size={14} className="text-muted" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {Object.entries(predictions).length > 0 ? (
          Object.entries(predictions).slice(0, 3).map(([key, pred]) => (
            <div 
              key={key} 
              className="p-3 rounded-lg bg-surface-hover border border-border"
            >
              <div className="flex items-center gap-2 mb-2">
                {getMetricIcon(key)}
                <span className="text-sm text-muted capitalize">{key.replace("_", " ")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">{pred.current_value.toFixed(1)}%</span>
                <div className="flex items-center gap-1">
                  {getTrendIcon(pred.trend)}
                  <span className={`text-xs ${getTrendColor(pred.trend)}`}>
                    {pred.trend}
                  </span>
                </div>
              </div>
              {pred.predicted_values?.length > 0 && (
                <div className="mt-2 text-xs text-muted">
                  Next: {pred.predicted_values[0]?.toFixed(1)}%
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="col-span-3 text-center text-muted py-4">
            No forecast data available
          </div>
        )}
      </div>

      {/* Quick Anomaly Summary */}
      {hasAnomalies && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <Activity size={16} />
            <span>
              {Object.values(anomalies).filter((a) => a.is_anomaly).length} metrics showing anomalous behavior
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
