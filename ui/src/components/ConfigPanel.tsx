"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Settings, Key, Eye, EyeOff, Plus, Trash2, History, FolderTree, 
  Loader2, RefreshCw, Check, AlertCircle, Search, Copy, Edit2, 
  FileText, Lock, X, Save, ChevronRight
} from "lucide-react";
import { listConfigs, setConfig, deleteConfig, getConfigHistory } from "@/lib/api";

interface ConfigEntry {
  path: string;
  value: string;
  is_secret?: boolean;
  updated_at?: string;
}

export function ConfigPanel() {
  const [namespace, setNamespace] = useState("/");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConfigEntry | null>(null);
  
  // Local state for reveals
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [storedConfigs, setStoredConfigs] = useState<ConfigEntry[]>([]);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

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
      setShowAddModal(false);
      setEditingConfig(null);
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

  const handleDeleteConfig = (path: string) => {
    if (confirm(`Are you sure you want to delete "${path}"?`)) {
      deleteConfigMutation.mutate(path);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(id);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const toggleReveal = (path: string) => {
    setRevealedSecrets(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Filter configs
  const filteredConfigs = storedConfigs.filter(c => {
    const matchesNamespace = namespace === "/" ? true : c.path.startsWith(namespace);
    const matchesSearch = c.path.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesNamespace && matchesSearch;
  });

  // Get unique namespaces
  const namespaces = ["/", ...new Set(storedConfigs.map(c => {
    const parts = c.path.split("/").filter(Boolean);
    if (parts.length > 1) return `/${parts[0]}/`;
    return "/";
  }))].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lock className="text-primary" />
            HiveVault
          </h1>
          <p className="text-sm text-muted mt-1">
            Secure configuration and secret management
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} />
          New Secret
        </button>
      </div>

      {/* Error display */}
      {configError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 animate-pulse">
          <AlertCircle size={18} className="text-red-400" />
          <span className="text-red-400">{configError}</span>
          <button onClick={() => setConfigError(null)} className="ml-auto text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Namespace Browser */}
        <div className="card h-fit">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider text-muted">
            <FolderTree size={16} />
            Namespaces
          </h3>
          <div className="space-y-1">
            {namespaces.map((ns) => (
              <button
                key={ns}
                onClick={() => setNamespace(ns)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${
                  namespace === ns
                    ? "bg-blue-500/10 text-blue-400 font-medium"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="opacity-70">{ns === "/" ? "Root" : ns}</span>
                </div>
                {namespace === ns && <ChevronRight size={14} />}
              </button>
            ))}
          </div>
        </div>

        {/* Config List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input
              type="text"
              placeholder="Search keys..." // Fixed typo
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-10"
            />
          </div>

          <div className="space-y-3">
            {filteredConfigs.length === 0 ? (
              <div className="card text-center py-12 border-dashed">
                <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
                  <Key size={32} className="text-muted opacity-50" />
                </div>
                <h3 className="text-lg font-medium">No configs found</h3>
                <p className="text-sm text-muted mt-2">
                  {searchQuery ? "Try adjusting your search query" : "Add your first configuration to get started"}
                </p>
              </div>
            ) : (
              filteredConfigs.map((config) => (
                <div key={config.path} className="card p-4 hover:border-blue-500/30 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {config.is_secret ? (
                          <Lock size={14} className="text-yellow-400 shrink-0" />
                        ) : (
                          <FileText size={14} className="text-blue-400 shrink-0" />
                        )}
                        <code className="text-sm font-semibold text-foreground truncate" title={config.path}>
                          {config.path}
                        </code>
                        <button
                          onClick={() => handleCopy(config.path, `path-${config.path}`)}
                          className="text-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copiedPath === `path-${config.path}` ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>

                      <div className="bg-black/20 rounded p-2 font-mono text-sm relative group/value">
                        <div className="pr-16 truncate">
                          {config.is_secret && !revealedSecrets[config.path] 
                            ? "••••••••••••••••" 
                            : config.value}
                        </div>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover/value:opacity-100 transition-opacity">
                          {config.is_secret && (
                            <button 
                              onClick={() => toggleReveal(config.path)}
                              className="p-1 hover:bg-white/10 rounded"
                              title={revealedSecrets[config.path] ? "Hide" : "Reveal"}
                            >
                              {revealedSecrets[config.path] ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                          <button
                            onClick={() => handleCopy(config.value, `val-${config.path}`)}
                            className="p-1 hover:bg-white/10 rounded"
                            title="Copy Value"
                          >
                            {copiedPath === `val-${config.path}` ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          setEditingConfig(config);
                          setShowAddModal(true);
                        }}
                        className="btn btn-ghost p-2 text-muted hover:text-primary"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteConfig(config.path)}
                        className="btn btn-ghost p-2 text-muted hover:text-red-400"
                        title="Delete"
                      >
                         {deleteConfigMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                    <button 
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => setHistoryPath(config.path)}
                    >
                      <History size={12} />
                      History
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <ConfigModal
          initialData={editingConfig}
          namespace={namespace}
          onClose={() => {
            setShowAddModal(false);
            setEditingConfig(null);
          }}
          onSubmit={(data) => setConfigMutation.mutate(data)}
          isSubmitting={setConfigMutation.isPending}
        />
      )}

      {/* History Modal */}
      {historyPath && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold">Version History</h3>
                <p className="text-xs text-muted font-mono mt-1">{historyPath}</p>
              </div>
              <button onClick={() => setHistoryPath(null)} className="btn-ghost p-2 rounded-lg">
                <X size={18} />
              </button>
            </div>
            
            <div className="overflow-auto p-4 space-y-3">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-primary" size={24} />
                </div>
              ) : historyData?.history && historyData.history.length > 0 ? (
                historyData.history.map((item: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-lg bg-surface-hover border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                       <span className={`badge ${item.action === 'delete' ? 'badge-error' : 'badge-info'}`}>
                         {item.action || "UPDATE"}
                       </span>
                      <span className="text-xs text-muted">{item.timestamp || item.changed_at}</span>
                    </div>
                    <div className="bg-black/30 rounded p-2 font-mono text-xs overflow-x-auto">
                      {item.value || item.previous_value || "(empty)"}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted text-center py-8">No history recorded for this key</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigModal({ 
  initialData, 
  namespace,
  onClose, 
  onSubmit, 
  isSubmitting 
}: { 
  initialData: ConfigEntry | null;
  namespace: string;
  onClose: () => void; 
  onSubmit: (data: { path: string; value: string; secret: boolean }) => void;
  isSubmitting: boolean;
}) {
  const [path, setPath] = useState(initialData?.path || (namespace !== "/" ? namespace : ""));
  const [value, setValue] = useState(initialData?.value || "");
  const [isSecret, setIsSecret] = useState(initialData?.is_secret || false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim() || !value.trim()) return;
    onSubmit({ path: path.trim(), value, secret: isSecret });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-bold">
              {initialData ? "Edit Configuration" : "New Secret / Config"}
            </h2>
            <button type="button" onClick={onClose} className="btn-ghost p-2 rounded-lg">
              <X size={18} />
            </button>
          </div>
          
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Key Path</label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="e.g. /database/password"
                className="input w-full font-mono text-sm"
                disabled={!!initialData} // Disable path editing if existing
                autoFocus={!initialData}
              />
              <p className="text-xs text-muted mt-1">
                Use forward slashes for organization (folders)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Value</label>
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter value..."
                className="input w-full font-mono text-sm h-32 py-2"
                autoFocus={!!initialData}
              />
            </div>

            <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={(e) => setIsSecret(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <Lock size={14} className={isSecret ? "text-yellow-400" : "text-muted"} />
                  Mark as Secret
                </div>
                <p className="text-xs text-muted">
                  Secrets are masked in the UI by default
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-3 p-4 border-t border-border bg-surface-hover/50 rounded-b-xl">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary min-w-[100px]"
              disabled={isSubmitting || !path || !value}
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Save size={18} />
                  Save
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
