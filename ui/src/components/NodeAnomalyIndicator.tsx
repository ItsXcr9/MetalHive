"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Activity, Sparkles } from "lucide-react";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://65.109.200.75:6800";

interface AnomalyPrediction {
  metric: string;
  hostname: string;
  current_value: number;
  anomaly_probability: number;
  is_anomaly: boolean;
  severity: string;
  direction: string;
  recommendation: string;
}

async function fetchNodeAnomalies(hostname: string): Promise<Record<string, AnomalyPrediction>> {
  try {
    const res = await fetch(`${METRICS_API}/api/v3/ai/intelligence/ml/predict/${hostname}`);
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    return data.anomaly_predictions || {};
  } catch {
    return {};
  }
}

interface NodeAnomalyIndicatorProps {
  hostname: string;
  compact?: boolean;
}

export function NodeAnomalyIndicator({ hostname, compact = false }: NodeAnomalyIndicatorProps) {
  const { data: anomalies = {}, isLoading } = useQuery({
    queryKey: ["node-anomaly", hostname],
    queryFn: () => fetchNodeAnomalies(hostname),
    refetchInterval: 60000,
    enabled: !!hostname,
  });

  const anomalyList = Object.values(anomalies).filter((a) => a.is_anomaly);
  const hasAnomalies = anomalyList.length > 0;
  const highSeverity = anomalyList.some((a) => a.severity === "critical" || a.severity === "high");

  if (isLoading) {
    return (
      <div className="flex items-center gap-1">
        <div className="w-4 h-4 animate-pulse bg-surface-hover rounded-full" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {hasAnomalies ? (
          <div className="flex items-center gap-1" title={`${anomalyList.length} anomalies detected`}>
            <AlertTriangle 
              className={highSeverity ? "text-red-400" : "text-yellow-400"} 
              size={14} 
            />
            <span className={`text-xs font-medium ${highSeverity ? "text-red-400" : "text-yellow-400"}`}>
              {anomalyList.length}
            </span>
          </div>
        ) : (
          <CheckCircle className="text-green-400" size={14} />
        )}
      </div>
    );
  }

  return (
    <div className={`p-2 rounded-lg border ${
      hasAnomalies 
        ? highSeverity 
          ? "bg-red-500/10 border-red-500/30" 
          : "bg-yellow-500/10 border-yellow-500/30"
        : "bg-green-500/10 border-green-500/30"
    }`}>
      <div className="flex items-center gap-2">
        {hasAnomalies ? (
          <>
            <AlertTriangle 
              className={highSeverity ? "text-red-400" : "text-yellow-400"} 
              size={16} 
            />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${highSeverity ? "text-red-400" : "text-yellow-400"}`}>
                {anomalyList.length} anomal{anomalyList.length === 1 ? "y" : "ies"} detected
              </p>
              <p className="text-xs text-muted truncate">
                {anomalyList.map((a) => a.metric).join(", ")}
              </p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle className="text-green-400" size={16} />
            <div className="flex-1">
              <p className="text-xs font-medium text-green-400">
                No anomalies
              </p>
              <p className="text-xs text-muted">
                All metrics normal
              </p>
            </div>
          </>
        )}
        <Sparkles size={12} className="text-muted opacity-50" />
      </div>
    </div>
  );
}

// Time-to-Full prediction component
interface TimeToFullProps {
  metric: "memory" | "disk";
  hostname: string;
  currentPercent: number;
  predictedTrend?: string;
}

export function TimeToFullPrediction({ metric, hostname, currentPercent, predictedTrend }: TimeToFullProps) {
  // Simple calculation based on trend
  // In a real scenario, this would use actual predictions from the ML model
  const getTrendDescription = () => {
    if (currentPercent > 90) return "Critical - very limited capacity";
    if (currentPercent > 80) return "Warning - consider cleanup";
    if (currentPercent > 70 && predictedTrend === "increasing") return "Trending up - monitor closely";
    return "Healthy capacity";
  };

  const getEstimatedTimeToFull = () => {
    if (currentPercent < 50) return "> 30 days";
    if (currentPercent < 70) return "~14-30 days";
    if (currentPercent < 85) return "~7-14 days";
    if (currentPercent < 95) return "< 7 days";
    return "< 24 hours";
  };

  const getColor = () => {
    if (currentPercent > 90) return "text-red-400";
    if (currentPercent > 80) return "text-orange-400";
    if (currentPercent > 70) return "text-yellow-400";
    return "text-green-400";
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <Activity size={12} className={getColor()} />
      <span className={getColor()}>
        {metric === "disk" ? "Disk" : "Memory"}: {getTrendDescription()}
      </span>
      {currentPercent > 60 && (
        <span className="text-muted">
          (TTF: {getEstimatedTimeToFull()})
        </span>
      )}
    </div>
  );
}
