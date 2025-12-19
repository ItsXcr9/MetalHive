"use client";

import { useQuery } from "@tanstack/react-query";
import { UnifiedMetricsService, metricsKeys, Alert } from "@/lib/UnifiedMetricsService";
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle,
  Server,
  Activity,
  Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EventsTimelineProps {
  limit?: number;
}

function formatTimeAgo(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return "recently";
  }
}

export function EventsTimeline({ limit = 10 }: EventsTimelineProps) {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: metricsKeys.alerts(),
    queryFn: () => UnifiedMetricsService.getAlerts(),
    refetchInterval: 30000,
  });

  const displayAlerts = alerts.slice(0, limit);

  const severityConfig = {
    critical: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
    high: { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
    medium: { icon: Info, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
    low: { icon: CheckCircle, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  };

  if (isLoading) {
    return (
      <div className="card p-4">
        <h3 className="font-semibold mb-4">Recent Events</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-surface-hover rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Recent Events</h3>
        <span className="text-xs text-muted">{alerts.length} total</span>
      </div>

      {displayAlerts.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="mx-auto text-emerald-400 mb-2" size={24} />
          <p className="text-sm text-muted">No recent events</p>
          <p className="text-xs text-muted mt-1">All systems operating normally</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {displayAlerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;

            return (
              <div 
                key={alert.id}
                className={`p-3 rounded-lg border ${config.bg} ${config.border}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={config.color} size={18} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{alert.message}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                      {alert.hostname && (
                        <span className="flex items-center gap-1">
                          <Server size={12} />
                          {alert.hostname}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Activity size={12} />
                        {alert.source}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatTimeAgo(alert.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
