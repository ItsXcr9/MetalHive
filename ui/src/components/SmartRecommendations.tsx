"use client";

import { useQuery } from "@tanstack/react-query";
import { 
  Lightbulb, 
  AlertTriangle, 
  TrendingUp,
  CheckCircle,
  Zap,
  Server,
  RefreshCw
} from "lucide-react";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://65.109.200.75:6800";

interface Recommendation {
  type: "warning" | "optimization" | "info" | "success";
  metric: string;
  recommendation: string;
  severity: string;
}

async function fetchRecommendations(hostname: string): Promise<Recommendation[]> {
  try {
    const res = await fetch(`${METRICS_API}/api/v3/ai/intelligence/ml/predict/${hostname}`);
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    
    const recommendations: Recommendation[] = [];
    
    // Extract recommendations from anomaly predictions
    if (data.anomaly_predictions) {
      Object.values(data.anomaly_predictions).forEach((anomaly: any) => {
        if (anomaly.is_anomaly) {
          recommendations.push({
            type: "warning",
            metric: anomaly.metric,
            recommendation: anomaly.recommendation,
            severity: anomaly.severity
          });
        } else if (anomaly.recommendation && anomaly.direction === "above_normal") {
          recommendations.push({
            type: "optimization",
            metric: anomaly.metric,
            recommendation: anomaly.recommendation,
            severity: "medium"
          });
        }
      });
    }
    
    // Add optimization suggestions from resource predictions
    if (data.resource_predictions) {
      Object.values(data.resource_predictions).forEach((pred: any) => {
        if (pred.trend === "increasing" && pred.current_value > 70) {
          recommendations.push({
            type: "optimization",
            metric: pred.metric,
            recommendation: `${pred.metric} is trending up (${pred.current_value.toFixed(0)}%). Consider scaling or optimization.`,
            severity: pred.current_value > 85 ? "high" : "medium"
          });
        }
      });
    }
    
    // Add success message if no issues
    if (recommendations.length === 0) {
      recommendations.push({
        type: "success",
        metric: "system",
        recommendation: "All metrics are within normal ranges. No immediate action required.",
        severity: "low"
      });
    }
    
    return recommendations.slice(0, 4); // Return max 4 recommendations
  } catch {
    return [{
      type: "info",
      metric: "system",
      recommendation: "Unable to fetch recommendations. Check API connectivity.",
      severity: "low"
    }];
  }
}

interface SmartRecommendationsProps {
  selectedNode?: string | null;
}

export function SmartRecommendations({ selectedNode }: SmartRecommendationsProps) {
  const hostname = selectedNode || "xcr9";
  
  const { data: recommendations = [], isLoading, refetch } = useQuery({
    queryKey: ["smart-recommendations", hostname],
    queryFn: () => fetchRecommendations(hostname),
    refetchInterval: 120000,
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "warning": return <AlertTriangle className="text-red-400" size={18} />;
      case "optimization": return <TrendingUp className="text-yellow-400" size={18} />;
      case "success": return <CheckCircle className="text-green-400" size={18} />;
      default: return <Lightbulb className="text-blue-400" size={18} />;
    }
  };

  const getTypeBg = (type: string) => {
    switch (type) {
      case "warning": return "bg-red-500/10 border-red-500/30";
      case "optimization": return "bg-yellow-500/10 border-yellow-500/30";
      case "success": return "bg-green-500/10 border-green-500/30";
      default: return "bg-blue-500/10 border-blue-500/30";
    }
  };

  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Zap size={18} className="text-yellow-400" />
            Smart Recommendations
          </h3>
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-surface-hover rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Zap size={18} className="text-yellow-400" />
          Smart Recommendations
          <span className="text-xs text-muted">for {hostname}</span>
        </h3>
        <button 
          onClick={() => refetch()} 
          className="p-1.5 hover:bg-surface-hover rounded-lg"
          title="Refresh"
        >
          <RefreshCw size={14} className="text-muted" />
        </button>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec, index) => (
          <div 
            key={index} 
            className={`p-3 rounded-lg border ${getTypeBg(rec.type)}`}
          >
            <div className="flex items-start gap-3">
              {getTypeIcon(rec.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Server size={14} className="text-muted" />
                  <span className="text-xs text-muted capitalize">{rec.metric}</span>
                  {rec.severity !== "low" && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      rec.severity === "high" ? "bg-red-500/20 text-red-400" :
                      rec.severity === "critical" ? "bg-red-600/30 text-red-300" :
                      "bg-yellow-500/20 text-yellow-400"
                    }`}>
                      {rec.severity}
                    </span>
                  )}
                </div>
                <p className="text-sm">{rec.recommendation}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
