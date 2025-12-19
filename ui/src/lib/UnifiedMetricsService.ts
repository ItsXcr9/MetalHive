/**
 * UnifiedMetricsService - Central bridge between MetalHive and AncientReport
 * Provides unified access to metrics, anomalies, and predictions
 */

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://65.109.200.75:6080";
const CONTROLLER_API = process.env.NEXT_PUBLIC_API_URL || "http://65.109.200.75:8080";

// Types
export interface MetricValue {
  timestamp: string;
  value: number;
  hostname: string;
}

export interface FleetMetrics {
  cpu: { current: number; avg: number; max: number; trend: "increasing" | "stable" | "decreasing" };
  memory: { current: number; avg: number; max: number; trend: "increasing" | "stable" | "decreasing" };
  disk: { current: number; avg: number; max: number; trend: "increasing" | "stable" | "decreasing" };
  network: { bytesIn: number; bytesOut: number; connections: number };
}

export interface NodeHealth {
  hostname: string;
  status: "healthy" | "warning" | "critical" | "offline";
  healthScore: number;
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
  };
  anomalies: number;
  lastSeen: string;
}

export interface Prediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  trend: string;
  confidence: number;
  timeToThreshold?: string;
}

export interface Alert {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  source: "metalhive" | "ancientreport";
  message: string;
  hostname?: string;
  timestamp: string;
}

// Fetch utilities with error handling
async function fetchWithFallback<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    return fallback;
  }
}

// Core Service Functions
export const UnifiedMetricsService = {
  /**
   * Get aggregated fleet metrics from all nodes using real-time data
   */
  async getFleetMetrics(): Promise<FleetMetrics> {
    // Fetch server info for disk and list of hostnames
    const serverInfo = await fetchWithFallback<{ servers: Record<string, any> }>(
      `${METRICS_API}/api/servers/info`,
      { servers: {} }
    );

    const servers = Object.entries(serverInfo.servers || {});
    
    if (servers.length === 0) {
      return {
        cpu: { current: 0, avg: 0, max: 0, trend: "stable" },
        memory: { current: 0, avg: 0, max: 0, trend: "stable" },
        disk: { current: 0, avg: 0, max: 0, trend: "stable" },
        network: { bytesIn: 0, bytesOut: 0, connections: 0 },
      };
    }

    // Fetch real-time CPU and memory metrics for each server in parallel
    const metricPromises = servers.map(async ([hostname, info]) => {
      const [cpuData, memData] = await Promise.all([
        fetchWithFallback<{ data: Array<{ value: number }> }>(
          `${METRICS_API}/api/metrics/cpu?hostname=${hostname}&limit=1`,
          { data: [] }
        ),
        fetchWithFallback<{ data: Array<{ value: number }> }>(
          `${METRICS_API}/api/metrics/memory?hostname=${hostname}&limit=1`,
          { data: [] }
        ),
      ]);

      // Calculate disk usage from static info
      const diskUsed = info.disk_used_gb || 0;
      const diskTotal = info.disk_total_gb || 1;
      const diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

      return {
        hostname,
        cpu: cpuData.data?.[0]?.value || 0,
        memory: memData.data?.[0]?.value || 0,
        disk: diskPercent,
      };
    });

    const nodeMetrics = await Promise.all(metricPromises);

    // Calculate fleet aggregates
    const cpuValues = nodeMetrics.map(n => n.cpu);
    const memValues = nodeMetrics.map(n => n.memory);
    const diskValues = nodeMetrics.map(n => n.disk);

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : 0;

    return {
      cpu: { current: avg(cpuValues), avg: avg(cpuValues), max: max(cpuValues), trend: "stable" },
      memory: { current: avg(memValues), avg: avg(memValues), max: max(memValues), trend: "stable" },
      disk: { current: avg(diskValues), avg: avg(diskValues), max: max(diskValues), trend: "stable" },
      network: { bytesIn: 0, bytesOut: 0, connections: 0 },
    };
  },


  /**
   * Get health status for all nodes combining MetalHive + AncientReport data
   */
  async getNodesHealth(): Promise<NodeHealth[]> {
    const [controllerNodes, serverInfo, predictions] = await Promise.all([
      fetchWithFallback<{ nodes: any[] }>(`${CONTROLLER_API}/api/v1/nodes`, { nodes: [] }),
      fetchWithFallback<{ servers: Record<string, any> }>(`${METRICS_API}/api/servers/info`, { servers: {} }),
      fetchWithFallback<{ anomaly_predictions: Record<string, any> }>(`${METRICS_API}/api/v3/ai/intelligence/ml/predict/xcr9`, { anomaly_predictions: {} }),
    ]);

    const serversMap = serverInfo.servers || {};
    const anomalies = predictions.anomaly_predictions || {};
    const anomalyCount = Object.values(anomalies).filter((a: any) => a.is_anomaly).length;

    // Create a combined list of all hostnames
    const allHostnames = new Set<string>();
    (controllerNodes.nodes || []).forEach((n: any) => allHostnames.add(n.hostname));
    Object.keys(serversMap).forEach(h => allHostnames.add(h));

    // Fetch real-time metrics for all nodes in parallel
    const metricsPromises = Array.from(allHostnames).map(async (hostname) => {
      const info = serversMap[hostname] || {};
      const controllerNode = (controllerNodes.nodes || []).find((n: any) => n.hostname === hostname);

      // Fetch real-time CPU and memory
      const [cpuData, memData] = await Promise.all([
        fetchWithFallback<{ data: Array<{ value: number }> }>(
          `${METRICS_API}/api/metrics/cpu?hostname=${hostname}&limit=1`,
          { data: [] }
        ),
        fetchWithFallback<{ data: Array<{ value: number }> }>(
          `${METRICS_API}/api/metrics/memory?hostname=${hostname}&limit=1`,
          { data: [] }
        ),
      ]);

      const cpu = cpuData.data?.[0]?.value || 0;
      const memory = memData.data?.[0]?.value || 0;
      const diskUsed = info.disk_used_gb || 0;
      const diskTotal = info.disk_total_gb || 1;
      const disk = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

      // Calculate health score
      let healthScore = 100;
      if (cpu > 90 || memory > 90 || disk > 90) healthScore = 30;
      else if (cpu > 80 || memory > 80 || disk > 80) healthScore = 60;
      else if (cpu > 70 || memory > 70 || disk > 70) healthScore = 80;

      let status: NodeHealth["status"] = "healthy";
      if (controllerNode && !controllerNode.online) status = "offline";
      else if (healthScore < 50) status = "critical";
      else if (healthScore < 80) status = "warning";

      return {
        hostname,
        status,
        healthScore,
        metrics: { cpu, memory, disk },
        anomalies: hostname === "xcr9" ? anomalyCount : 0,
        lastSeen: controllerNode?.last_heartbeat || new Date().toISOString(),
      };
    });

    return Promise.all(metricsPromises);
  },

  /**
   * Get AI-powered predictions for a specific node
   */
  async getPredictions(hostname: string): Promise<Prediction[]> {
    const data = await fetchWithFallback<{
      resource_predictions: Record<string, any>;
      anomaly_predictions: Record<string, any>;
    }>(`${METRICS_API}/api/v3/ai/intelligence/ml/predict/${hostname}`, {
      resource_predictions: {},
      anomaly_predictions: {},
    });

    const predictions: Prediction[] = [];

    // Resource predictions
    for (const [key, pred] of Object.entries(data.resource_predictions || {})) {
      predictions.push({
        metric: key,
        currentValue: pred.current_value || 0,
        predictedValue: pred.predicted_values?.[0] || pred.current_value || 0,
        trend: pred.trend || "stable",
        confidence: pred.confidence || 0.5,
      });
    }

    // Add time-to-threshold for high usage
    for (const pred of predictions) {
      if (pred.currentValue > 80 && pred.trend === "increasing") {
        pred.timeToThreshold = "< 7 days";
      } else if (pred.currentValue > 70 && pred.trend === "increasing") {
        pred.timeToThreshold = "~14 days";
      }
    }

    return predictions;
  },

  /**
   * Get unified alerts from both MetalHive and AncientReport
   */
  async getAlerts(): Promise<Alert[]> {
    const [correlationData, controllerAlerts] = await Promise.all([
      fetchWithFallback<{ incidents: any[]; total_alerts: number }>(
        `${METRICS_API}/api/v3/ai/intelligence/correlate/recent?hours=24`,
        { incidents: [], total_alerts: 0 }
      ),
      fetchWithFallback<{ alerts: any[] }>(`${CONTROLLER_API}/api/v1/alerts`, { alerts: [] }),
    ]);

    const alerts: Alert[] = [];

    // AncientReport correlated incidents
    for (const incident of correlationData.incidents || []) {
      alerts.push({
        id: incident.id,
        severity: incident.severity || "medium",
        source: "ancientreport",
        message: `Correlated incident: ${incident.alert_count} alerts on ${incident.affected_hosts?.join(", ")}`,
        timestamp: incident.start_time || new Date().toISOString(),
      });
    }

    // MetalHive controller alerts
    for (const alert of controllerAlerts.alerts || []) {
      alerts.push({
        id: alert.id || crypto.randomUUID(),
        severity: alert.severity || "medium",
        source: "metalhive",
        message: alert.message || "Unknown alert",
        hostname: alert.hostname,
        timestamp: alert.timestamp || new Date().toISOString(),
      });
    }

    return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  /**
   * Get ML engine status
   */
  async getMlStatus(): Promise<{ operational: boolean; capabilities: string[] }> {
    const data = await fetchWithFallback<{
      status: string;
      capabilities: Record<string, boolean>;
    }>(`${METRICS_API}/api/v3/ai/intelligence/ml/status`, {
      status: "unknown",
      capabilities: {},
    });

    return {
      operational: data.status === "operational",
      capabilities: Object.entries(data.capabilities || {})
        .filter(([, v]) => v)
        .map(([k]) => k),
    };
  },

  /**
   * Get fleet summary stats
   */
  async getFleetSummary(): Promise<{
    totalNodes: number;
    healthyNodes: number;
    warningNodes: number;
    criticalNodes: number;
    totalAnomalies: number;
    mlStatus: boolean;
  }> {
    const [nodes, mlStatus] = await Promise.all([
      this.getNodesHealth(),
      this.getMlStatus(),
    ]);

    return {
      totalNodes: nodes.length,
      healthyNodes: nodes.filter(n => n.status === "healthy").length,
      warningNodes: nodes.filter(n => n.status === "warning").length,
      criticalNodes: nodes.filter(n => n.status === "critical" || n.status === "offline").length,
      totalAnomalies: nodes.reduce((sum, n) => sum + n.anomalies, 0),
      mlStatus: mlStatus.operational,
    };
  },
};

// React Query Keys for cache management
export const metricsKeys = {
  all: ["unified-metrics"] as const,
  fleet: () => [...metricsKeys.all, "fleet"] as const,
  nodes: () => [...metricsKeys.all, "nodes"] as const,
  predictions: (hostname: string) => [...metricsKeys.all, "predictions", hostname] as const,
  alerts: () => [...metricsKeys.all, "alerts"] as const,
  summary: () => [...metricsKeys.all, "summary"] as const,
};
