"use client";

import { useQuery } from "@tanstack/react-query";
import { UnifiedMetricsService, metricsKeys } from "@/lib/UnifiedMetricsService";
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Sparkles,
  TrendingUp,
  TrendingDown,
  Activity
} from "lucide-react";

export function FleetHealthBar() {
  const { data, isLoading } = useQuery({
    queryKey: metricsKeys.summary(),
    queryFn: () => UnifiedMetricsService.getFleetSummary(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="h-16 animate-pulse bg-surface-hover rounded-xl" />
    );
  }

  const { totalNodes = 0, healthyNodes = 0, warningNodes = 0, criticalNodes = 0, totalAnomalies = 0, mlStatus = false } = data || {};
  
  const healthPercent = totalNodes > 0 ? (healthyNodes / totalNodes) * 100 : 100;
  const warningPercent = totalNodes > 0 ? (warningNodes / totalNodes) * 100 : 0;
  const criticalPercent = totalNodes > 0 ? (criticalNodes / totalNodes) * 100 : 0;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-lg">Fleet Health</h3>
        <div className="flex items-center gap-4 text-sm">
          {/* ML Status */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${mlStatus ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"}`}>
            <Sparkles size={14} />
            <span>ML {mlStatus ? "Active" : "Inactive"}</span>
          </div>
          {/* Anomaly Count */}
          {totalAnomalies > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/20 text-red-400">
              <AlertTriangle size={14} />
              <span>{totalAnomalies} Anomal{totalAnomalies === 1 ? "y" : "ies"}</span>
            </div>
          )}
        </div>
      </div>

      {/* Health Bar */}
      <div className="relative h-8 bg-surface-hover rounded-lg overflow-hidden flex">
        {healthPercent > 0 && (
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-sm font-medium transition-all"
            style={{ width: `${healthPercent}%` }}
          >
            {healthyNodes > 0 && (
              <span className="flex items-center gap-1">
                <CheckCircle size={14} /> {healthyNodes}
              </span>
            )}
          </div>
        )}
        {warningPercent > 0 && (
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-amber-600 flex items-center justify-center text-white text-sm font-medium transition-all"
            style={{ width: `${warningPercent}%` }}
          >
            {warningNodes > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle size={14} /> {warningNodes}
              </span>
            )}
          </div>
        )}
        {criticalPercent > 0 && (
          <div 
            className="h-full bg-gradient-to-r from-red-500 to-red-600 flex items-center justify-center text-white text-sm font-medium transition-all"
            style={{ width: `${criticalPercent}%` }}
          >
            {criticalNodes > 0 && (
              <span className="flex items-center gap-1">
                <XCircle size={14} /> {criticalNodes}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between mt-3 text-sm text-muted">
        <span>{totalNodes} Total Nodes</span>
        <div className="flex items-center gap-4">
          <span className="text-emerald-400">{healthyNodes} Healthy</span>
          <span className="text-amber-400">{warningNodes} Warning</span>
          <span className="text-red-400">{criticalNodes} Critical</span>
        </div>
      </div>
    </div>
  );
}
