"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Brain, 
  Sparkles, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Server,
  Activity,
  Zap,
  Target
} from "lucide-react";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://65.109.200.75:6800";

interface AnomalyPrediction {
  metric: string;
  hostname: string;
  current_value: number;
  anomaly_probability: number;
  is_anomaly: boolean;
  severity: string;
  direction: string;
  z_score: number;
  recommendation: string;
  method: string;
}

interface ResourcePrediction {
  metric: string;
  current_value: number;
  predicted_values: number[];
  trend: string;
  confidence: number;
}

interface MLStatus {
  status: string;
  capabilities: {
    prophet_forecasting: boolean;
    isolation_forest_anomaly: boolean;
    pandas_dataframes: boolean;
  };
}

interface Incident {
  id: string;
  alert_count: number;
  severity: string;
  affected_hosts: string[];
  root_cause_candidates: string[];
  start_time: string;
  end_time: string;
}

async function fetchMLPredictions(hostname: string) {
  try {
    const res = await fetch(`${METRICS_API}/api/v3/ai/intelligence/ml/predict/${hostname}`);
    if (!res.ok) throw new Error("Failed");
    return res.json();
  } catch {
    return { resource_predictions: {}, anomaly_predictions: {} };
  }
}

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

async function fetchAlertCorrelation(): Promise<{ incidents: Incident[]; total_alerts: number }> {
  try {
    const res = await fetch(`${METRICS_API}/api/v3/ai/intelligence/correlate/recent?hours=24`);
    if (!res.ok) throw new Error("Failed");
    return res.json();
  } catch {
    return { incidents: [], total_alerts: 0 };
  }
}

interface FleetIntelligenceProps {
  selectedNode: string | null;
}

export function FleetIntelligence({ selectedNode }: FleetIntelligenceProps) {
  const [expandedSection, setExpandedSection] = useState<string>("anomalies");
  
  const hostname = selectedNode || "xcr9";

  const { data: predictions, isLoading: predictionsLoading, refetch } = useQuery({
    queryKey: ["fleet-predictions", hostname],
    queryFn: () => fetchMLPredictions(hostname),
    refetchInterval: 60000,
  });

  const { data: mlStatus } = useQuery({
    queryKey: ["ml-status"],
    queryFn: fetchMLStatus,
    refetchInterval: 120000,
  });

  const { data: correlationData } = useQuery({
    queryKey: ["alert-correlation"],
    queryFn: fetchAlertCorrelation,
    refetchInterval: 60000,
  });

  const anomalies = predictions?.anomaly_predictions || {};
  const resourcePreds = predictions?.resource_predictions || {};
  const incidents = correlationData?.incidents || [];
  
  const hasAnomalies = Object.values(anomalies).some((a: any) => a.is_anomaly);
  const anomalyCount = Object.values(anomalies).filter((a: any) => a.is_anomaly).length;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-400 bg-red-500/20 border-red-500/30";
      case "high": return "text-orange-400 bg-orange-500/20 border-orange-500/30";
      case "medium": return "text-yellow-400 bg-yellow-500/20 border-yellow-500/30";
      default: return "text-green-400 bg-green-500/20 border-green-500/30";
    }
  };

  const getDirectionIcon = (direction: string) => {
    if (direction === "above_normal") return <TrendingUp className="text-red-400\" size={16} />;
    if (direction === "below_normal") return <TrendingUp className="text-blue-400 rotate-180" size={16} />;
    return <Activity className="text-green-400" size={16} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/20">
            <Brain className="text-purple-400" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Fleet Intelligence</h1>
            <p className="text-sm text-muted">
              ML-powered predictions for {selectedNode || "all nodes"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* ML Status Badge */}
          {mlStatus && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              mlStatus.status === "operational" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
            }`}>
              <Sparkles size={14} />
              <span>ML: {mlStatus.status}</span>
            </div>
          )}
          
          <button 
            onClick={() => refetch()} 
            className="p-2 hover:bg-surface rounded-lg"
            title="Refresh predictions"
          >
            <RefreshCw size={18} className={`text-muted ${predictionsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-xl border ${hasAnomalies ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
          <div className="flex items-center gap-2 mb-2">
            {hasAnomalies ? <AlertTriangle className="text-red-400" size={20} /> : <CheckCircle className="text-green-400" size={20} />}
            <span className="text-sm text-muted">Anomalies</span>
          </div>
          <p className={`text-2xl font-bold ${hasAnomalies ? "text-red-400" : "text-green-400"}`}>
            {anomalyCount} detected
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-blue-500/10 border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="text-blue-400" size={20} />
            <span className="text-sm text-muted">Metrics Monitored</span>
          </div>
          <p className="text-2xl font-bold">{Object.keys(anomalies).length}</p>
        </div>

        <div className="p-4 rounded-xl border bg-purple-500/10 border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Target className="text-purple-400" size={20} />
            <span className="text-sm text-muted">Incidents (24h)</span>
          </div>
          <p className="text-2xl font-bold">{incidents.length}</p>
        </div>

        <div className="p-4 rounded-xl border bg-cyan-500/10 border-cyan-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="text-cyan-400" size={20} />
            <span className="text-sm text-muted">ML Method</span>
          </div>
          <p className="text-lg font-bold">
            {mlStatus?.capabilities.isolation_forest_anomaly ? "IsolationForest" : "Z-Score"}
          </p>
        </div>
      </div>

      {/* Anomaly Detection Section */}
      <div className="card">
        <button
          onClick={() => setExpandedSection(expandedSection === "anomalies" ? "" : "anomalies")}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-yellow-400" size={20} />
            <h3 className="font-semibold">Anomaly Detection</h3>
            <span className="text-sm text-muted">({Object.keys(anomalies).length} metrics)</span>
          </div>
          {expandedSection === "anomalies" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {expandedSection === "anomalies" && (
          <div className="p-4 pt-0 space-y-3">
            {predictionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
              </div>
            ) : Object.keys(anomalies).length === 0 ? (
              <p className="text-center text-muted py-8">No anomaly data available</p>
            ) : (
              Object.entries(anomalies).map(([key, anomaly]: [string, any]) => (
                <div 
                  key={key}
                  className={`p-4 rounded-lg border ${getSeverityColor(anomaly.severity)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Server size={16} className="text-muted" />
                      <span className="font-medium">{anomaly.metric}</span>
                      {anomaly.is_anomaly && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/30 text-red-400">
                          ANOMALY
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getDirectionIcon(anomaly.direction)}
                      <span className="text-sm font-medium">{anomaly.current_value.toFixed(1)}%</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted mb-2">
                    <span>Probability: {(anomaly.anomaly_probability * 100).toFixed(1)}%</span>
                    <span>Z-Score: {anomaly.z_score.toFixed(2)}</span>
                    <span>Method: {anomaly.method}</span>
                  </div>
                  
                  <p className="text-sm">{anomaly.recommendation}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Alert Correlation Section */}
      <div className="card">
        <button
          onClick={() => setExpandedSection(expandedSection === "correlation" ? "" : "correlation")}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <Target className="text-purple-400" size={20} />
            <h3 className="font-semibold">Alert Correlation</h3>
            <span className="text-sm text-muted">({incidents.length} incidents)</span>
          </div>
          {expandedSection === "correlation" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {expandedSection === "correlation" && (
          <div className="p-4 pt-0">
            {incidents.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="mx-auto text-green-400 mb-2" size={32} />
                <p className="text-muted">No correlated incidents in the last 24 hours</p>
              </div>
            ) : (
              <div className="space-y-3">
                {incidents.map((incident) => (
                  <div 
                    key={incident.id}
                    className={`p-4 rounded-lg border ${getSeverityColor(incident.severity)}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{incident.id}</span>
                      <span className="text-sm text-muted">{incident.alert_count} alerts</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {incident.affected_hosts.map((host) => (
                        <span key={host} className="px-2 py-1 rounded text-xs bg-surface">
                          {host}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ML Capabilities */}
      {mlStatus && (
        <div className="card p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="text-purple-400" size={18} />
            ML Engine Capabilities
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              {mlStatus.capabilities.prophet_forecasting ? (
                <CheckCircle className="text-green-400" size={16} />
              ) : (
                <AlertTriangle className="text-yellow-400" size={16} />
              )}
              <span className="text-sm">Prophet Forecasting</span>
            </div>
            <div className="flex items-center gap-2">
              {mlStatus.capabilities.isolation_forest_anomaly ? (
                <CheckCircle className="text-green-400" size={16} />
              ) : (
                <AlertTriangle className="text-yellow-400" size={16} />
              )}
              <span className="text-sm">IsolationForest</span>
            </div>
            <div className="flex items-center gap-2">
              {mlStatus.capabilities.pandas_dataframes ? (
                <CheckCircle className="text-green-400" size={16} />
              ) : (
                <AlertTriangle className="text-yellow-400" size={16} />
              )}
              <span className="text-sm">Pandas</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
