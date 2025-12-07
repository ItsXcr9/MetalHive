"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Key, Eye, EyeOff, Plus, Trash2, History, FolderTree } from "lucide-react";

interface ConfigEntry {
  path: string;
  value: string;
  is_secret: boolean;
  updated_at?: string;
}

export function ConfigPanel() {
  const [namespace, setNamespace] = useState("/");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const queryClient = useQueryClient();

  // Note: These would use real API calls
  const configs: ConfigEntry[] = [
    { path: "/production/api/DATABASE_URL", value: "postgres://...", is_secret: true },
    { path: "/production/api/REDIS_URL", value: "redis://localhost:6379", is_secret: false },
    { path: "/production/api/LOG_LEVEL", value: "info", is_secret: false },
    { path: "/global/TIMEZONE", value: "UTC", is_secret: false },
  ];

  const handleAddConfig = () => {
    if (!newKey.trim() || !newValue.trim()) return;
    // Would call API here
    console.log("Adding config:", { path: namespace + newKey, value: newValue, is_secret: isSecret });
    setNewKey("");
    setNewValue("");
    setIsSecret(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HiveVault</h1>
          <p className="text-sm text-muted mt-1">
            Centralized configuration and secrets management
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Namespace Browser */}
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <FolderTree size={18} />
            Namespaces
          </h3>
          <div className="space-y-1">
            {["/", "/production/", "/staging/", "/global/"].map((ns) => (
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
        </div>

        {/* Config List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Add New Config */}
          <div className="card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus size={18} />
              Add Configuration
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="KEY_NAME"
                  className="input font-mono"
                />
              </div>
              <div className="flex-1">
                <input
                  type={isSecret ? "password" : "text"}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Value"
                  className="input"
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
              <button onClick={handleAddConfig} className="btn btn-primary">
                <Plus size={16} />
                Add
              </button>
            </div>
          </div>

          {/* Config Table */}
          <div className="card overflow-hidden p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                  <th>Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {configs
                  .filter((c) => c.path.startsWith(namespace))
                  .map((config) => (
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
                          <button className="btn-ghost p-1.5 rounded text-blue-400" title="History">
                            <History size={14} />
                          </button>
                          <button className="btn-ghost p-1.5 rounded text-red-400" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
