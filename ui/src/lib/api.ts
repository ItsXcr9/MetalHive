/**
 * MetalHive API Client
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}/api/v1${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Nodes API
 */
export async function fetchNodes() {
  return fetchAPI<{ nodes: any[]; total: number }>("/nodes");
}

export async function fetchNode(hostname: string) {
  return fetchAPI<any>(`/nodes/${hostname}`);
}

export async function registerNode(data: { hostname: string; ip: string; labels?: Record<string, string> }) {
  return fetchAPI<{ message: string; hostname: string }>("/nodes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function removeNode(hostname: string) {
  return fetchAPI<{ message: string }>(`/nodes/${hostname}`, {
    method: "DELETE",
  });
}

export async function renameNode(hostname: string, displayName: string) {
  return fetchAPI<{ message: string; hostname: string; display_name: string }>(`/nodes/${hostname}`, {
    method: "PUT",
    body: JSON.stringify({ display_name: displayName }),
  });
}

/**
 * Containers API
 */
export async function fetchContainers(hostname?: string | null) {
  const params = hostname ? `?hostname=${hostname}` : "";
  return fetchAPI<{ containers: any[]; total: number }>(`/containers${params}`);
}

export async function startContainer(id: string) {
  return fetchAPI<{ message: string }>(`/containers/${id}/start`, {
    method: "POST",
  });
}

export async function stopContainer(id: string) {
  return fetchAPI<{ message: string }>(`/containers/${id}/stop`, {
    method: "POST",
  });
}

export async function restartContainer(id: string) {
  return fetchAPI<{ message: string }>(`/containers/${id}/restart`, {
    method: "POST",
  });
}

export async function removeContainer(id: string) {
  return fetchAPI<{ message: string }>(`/containers/${id}`, {
    method: "DELETE",
  });
}

export async function getContainerLogs(id: string, tail = 100) {
  return fetchAPI<{ id: string; logs: string }>(`/containers/${id}/logs?tail=${tail}`);
}

/**
 * HiveShell API
 */
export async function runCommand(data: {
  command: string;
  nodes?: string[];
  containers?: string[];
  strategy?: "parallel" | "serial" | "rolling";
  sudo?: boolean;
  timeout_secs?: number;
}) {
  return fetchAPI<{ 
    execution_id: string; 
    status: string; 
    command: string;
    target_type?: string;
    results?: Array<{
      container: string;
      success: boolean;
      exit_code?: number;
      output?: string;
      error?: string;
    }>;
  }>("/exec/run", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getExecutionStatus(id: string) {
  return fetchAPI<any>(`/exec/${id}`);
}

export async function getExecutionHistory() {
  return fetchAPI<{ executions: any[] }>("/exec/history");
}

/**
 * HiveVault API
 */
export async function listConfigs(namespace?: string) {
  const params = namespace ? `?namespace=${encodeURIComponent(namespace)}` : "";
  return fetchAPI<{ configs: any[]; total: number }>(`/config${params}`);
}

export async function getConfig(path: string) {
  return fetchAPI<{ path: string; value: string }>(`/config/${path}`);
}

export async function setConfig(data: { path: string; value: string; secret?: boolean }) {
  return fetchAPI<{ message: string; path: string }>("/config", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteConfig(path: string) {
  return fetchAPI<{ message: string }>(`/config/${path}`, {
    method: "DELETE",
  });
}

export async function getConfigHistory(path?: string) {
  const endpoint = path ? `/config/history/${path}` : "/config/history/";
  return fetchAPI<{ history: any[]; total: number }>(endpoint);
}


/**
 * Metrics API
 */
export async function fetchMetrics(hostname?: string | null, since?: string) {
  const params = new URLSearchParams();
  if (hostname) params.set("hostname", hostname);
  if (since) params.set("since", since);
  
  return fetchAPI<any>(`/metrics/system/${hostname || "all"}?${params}`);
}

/**
 * AI API
 */
export async function askAI(data: { query: string; context?: Record<string, any> }) {
  return fetchAPI<{
    query: string;
    response: string;
    confidence: number;
    sources: string[];
    recommendations: string[];
  }>("/ai/ask", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getAIReports() {
  return fetchAPI<{ reports: any[] }>("/ai/reports");
}

export async function triggerAnalysis(data?: { hostname?: string; time_range_hours?: number }) {
  return fetchAPI<any>("/ai/analyze", {
    method: "POST",
    body: JSON.stringify(data || {}),
  });
}

/**
 * System Updates API
 */
export async function triggerSystemUpdate(data: {
  type: "os" | "docker" | "security";
  strategy?: "parallel" | "rolling" | "serial";
  nodes?: string[];
  schedule?: string;
}) {
  return fetchAPI<{ update_id: string; message: string }>("/system/update", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getUpdateHistory() {
  return fetchAPI<{ updates: any[] }>("/system/updates");
}

/**
 * Stacks API
 */
export async function deployStack(data: {
  name: string;
  compose_yaml: string;
  nodes?: string[];
}) {
  return fetchAPI<{
    stack_id: string;
    name: string;
    message: string;
    output?: string;
  }>("/stacks/deploy", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listStacks() {
  return fetchAPI<{ stacks: any[]; total: number }>("/stacks");
}
