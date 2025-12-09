"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Key, Eye, EyeOff, Plus, Trash2, History, FolderTree, Loader2, RefreshCw, Check, AlertCircle } from "lucide-react";
import { listConfigs, setConfig, deleteConfig, getConfigHistory } from "@/lib/api";

interface ConfigEntry {
  path: string;
  value: string;
  is_secret?: boolean;
  updated_at?: string;
}

export function ConfigPanel() {
  const [namespace, setNamespace] = useState("/");
  const [newPath, setNewPath] = useState("");
  const [newValue, setNewValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [storedConfigs, setStoredConfigs] = useState<ConfigEntry[]>([]);

  const queryClient = useQueryClient();

  // Fetch existing configs on mount
  useEffect(() => {
    listConfigs()
      .then((data) => setStoredConfigs(data.configs || []))
      .catch((err) => console.error("Failed to fetch configs:", err));
  }, []);

  // Fetch config history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["config-history", historyPath],
    queryFn: () => historyPath ? getConfigHistory(historyPath) : Promise.resolve({ history: [], total: 0 }),
    enabled: !!historyPath,
  });

  // Set config mutation
  const setConfigMutation = useMutation({
    mutationFn: (data: { path: string; value: string; secret?: boolean }) => setConfig(data),
    onSuccess: (_, variables) => {
      // Add to local state
      setStoredConfigs(prev => {
        const existing = prev.find(c => c.path === variables.path);
        if (existing) {
          return prev.map(c => c.path === variables.path ? { ...c, value: variables.value, is_secret: variables.secret } : c);
        }
        return [...prev, { path: variables.path, value: variables.value, is_secret: variables.secret }];
      });
      setNewPath("");
      setNewValue("");
      setIsSecret(false);
      setConfigError(null);
    },
    onError: (error: any) => {
      setConfigError(error.message || "Failed to set config");
    },
  });

  // Delete config mutation
  const deleteConfigMutation = useMutation({
    mutationFn: (path: string) => deleteConfig(path),
    onSuccess: (_, path) => {
      setStoredConfigs(prev => prev.filter(c => c.path !== path));
    },
    onError: (error: any) => {
      setConfigError(error.message || "Failed to delete config");
    },
  });

  const handleAddConfig = () => {
    if (!newPath.trim() || !newValue.trim()) {
      setConfigError("Path and value are required");
      return;
    }
    const fullPath = namespace === "/" ? newPath : `${namespace.replace(/\/$/, "")}/${newPath}`;
    setConfigMutation.mutate({ path: fullPath, value: newValue, secret: isSecret });
  };

  const handleDeleteConfig = (path: string) => {
    if (confirm(`Are you sure you want to delete "${path}"?`)) {
      deleteConfigMutation.mutate(path);
    }
  };

  // Filter configs by namespace
  const filteredConfigs = storedConfigs.filter(c => {
    if (namespace === "/") return true;
    return c.path.startsWith(namespace);
  });

  // Get unique namespaces from stored configs
  const namespaces = ["/", ...new Set(storedConfigs.map(c => {
    const parts = c.path.split("/").filter(Boolean);
    if (parts.length > 1) return `/${parts[0]}/`;
    return "/";
  }))].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HiveVault</h1>
          <p className="text-sm text-muted mt-1">
            Centralized configuration and secrets management across all nodes
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSecrets(!showSecrets)}
            className="btn btn-secondary"
          >
            {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
            {showSecrets ? "Hide Secrets" : "Show Secrets"}
          </button>
        </div>
      </div>

      {/* Error display */}
      {configError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle size={18} className="text-red-400" />
          <span className="text-red-400">{configError}</span>
          <button onClick={() => setConfigError(null)} className="ml-auto text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Namespace Browser */}
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <FolderTree size={18} />
            Namespaces
          </h3>
          <div className="space-y-1">
            {namespaces.map((ns) => (
              <button
                key={ns}
                onClick={() => setNamespace(ns)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  namespace === ns
                    ? "bg-blue-500/20 text-blue-400"
                    : "hover:bg-surface-hover"
                }`}
              >
                {ns}
              </button>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted mb-2">Common namespaces:</p>
            {["/production/", "/staging/", "/global/", "/secrets/"].map((ns) => (
              <button
                key={ns}
                onClick={() => setNamespace(ns)}
                className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                  namespace === ns
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-muted hover:bg-surface-hover hover:text-secondary"
                }`}
              >
                {ns}
              </button>
            ))}
          </div>
        </div>

        {/* Config List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Add New Config */}
          <div className="card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus size={18} />
              Add Configuration
              <span className="text-xs text-muted ml-2">Namespace: {namespace}</span>
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="path/to/KEY_NAME"
                  className="input font-mono w-full"
                />
              </div>
              <div className="flex-1">
                <input
                  type={isSecret ? "password" : "text"}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Value"
                  className="input w-full"
                />
              </div>
              <label className="flex items-center gap-2 px-3">
                <input
                  type="checkbox"
                  checked={isSecret}
                  onChange={(e) => setIsSecret(e.target.checked)}
                  className="rounded"
                />
                <Key size={16} className="text-yellow-400" />
                <span className="text-sm">Secret</span>
              </label>
              <button 
                onClick={handleAddConfig} 
                className="btn btn-primary"
                disabled={setConfigMutation.isPending}
              >
                {setConfigMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add
              </button>
            </div>
          </div>

          {/* Config Table */}
          <div className="card overflow-hidden p-0">
            {filteredConfigs.length === 0 ? (
              <div className="p-8 text-center text-muted">
                <Settings size={48} className="mx-auto mb-4 opacity-50" />
                <p className="font-medium">No configurations found</p>
                <p className="text-sm mt-1">Add your first configuration above</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Value</th>
                    <th>Type</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConfigs.map((config) => (
                    <tr key={config.path}>
                      <td>
                        <code className="text-sm text-blue-400">{config.path}</code>
                      </td>
                      <td>
                        <code className="text-sm">
                          {config.is_secret && !showSecrets
                            ? "••••••••"
                            : config.value}
                        </code>
                      </td>
                      <td>
                        {config.is_secret ? (
                          <span className="badge badge-warning">
                            <Key size={12} className="mr-1" />
                            Secret
                          </span>
                        ) : (
                          <span className="badge badge-info">Config</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button 
                            className="btn-ghost p-1.5 rounded text-blue-400" 
                            title="History"
                            onClick={() => setHistoryPath(config.path)}
                          >
                            <History size={14} />
                          </button>
                          <button 
                            className="btn-ghost p-1.5 rounded text-red-400" 
                            title="Delete"
                            onClick={() => handleDeleteConfig(config.path)}
                            disabled={deleteConfigMutation.isPending}
                          >
                            {deleteConfigMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Multi-node info */}
          <div className="card bg-blue-500/10 border-blue-500/30">
            <h3 className="font-semibold flex items-center gap-2 text-blue-400">
              <Check size={18} />
              Multi-Node Configuration
            </h3>
            <p className="text-sm text-secondary mt-2">
              Configurations stored in HiveVault are shared across all nodes via DragonflyDB (Redis-compatible).
              Access configs from any agent by reading from the controller's Redis endpoint.
            </p>
            <p className="text-xs text-muted mt-2">
              Agent access: <code className="bg-surface px-1.5 py-0.5 rounded">redis-cli -h controller-host -p 6379 GET "hivevault:$PATH"</code>
            </p>
          </div>
        </div>
      </div>

      {/* History Modal */}
      {historyPath && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">History: {historyPath}</h3>
              <button onClick={() => setHistoryPath(null)} className="btn-ghost p-2 rounded">&times;</button>
            </div>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin" />
              </div>
            ) : historyData?.history && historyData.history.length > 0 ? (
              <div className="space-y-2">
                {historyData.history.map((item: any, idx: number) => (
                  <div key={idx} className="p-3 rounded bg-surface-hover text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">{item.action || "set"}</span>
                      <span className="text-xs text-muted">{item.timestamp || item.changed_at}</span>
                    </div>
                    <code className="text-xs">{item.value || item.previous_value || "N/A"}</code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted text-center py-8">No history found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
