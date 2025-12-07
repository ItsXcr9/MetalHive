"use client";

import { useState } from "react";
import { Server, Loader2, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TestResult {
  success: boolean;
  hostname?: string;
  os?: string;
  dockerVersion?: string;
  error?: string;
}

interface DeployResult {
  success: boolean;
  message: string;
  hostname?: string;
  output?: string;
  error?: string;
}

export function AddNodeModal({ isOpen, onClose, onSuccess }: AddNodeModalProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [privateKey, setPrivateKey] = useState("");
  const [centralIp, setCentralIp] = useState("65.109.200.75");
  
  const [testing, setTesting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  const resetForm = () => {
    setHost("");
    setPort("22");
    setUsername("root");
    setPassword("");
    setPrivateKey("");
    setTestResult(null);
    setDeployResult(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const res = await fetch(`${API_URL}/api/v1/nodes/test-ssh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port: parseInt(port),
          username,
          password: authMethod === "password" ? password : undefined,
          privateKey: authMethod === "key" ? privateKey : undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployResult(null);
    
    try {
      const res = await fetch(`${API_URL}/api/v1/nodes/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port: parseInt(port),
          username,
          password: authMethod === "password" ? password : undefined,
          privateKey: authMethod === "key" ? privateKey : undefined,
          centralIp,
          natsPort: 4222,
          chPort: 6123,
        }),
      });
      const data = await res.json();
      setDeployResult(data);
      if (data.success) {
        onSuccess();
      }
    } catch (err) {
      setDeployResult({ success: false, message: "Network error", error: "Failed to connect to API" });
    } finally {
      setDeploying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Server className="text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Add New Node</h2>
              <p className="text-sm text-muted">Deploy agent via SSH</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Server Details */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Host / IP</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Auth Method Tabs */}
          <div>
            <label className="block text-sm font-medium mb-2">Authentication</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setAuthMethod("password")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authMethod === "password" 
                    ? "bg-primary text-white" 
                    : "bg-surface-hover hover:bg-border"
                }`}
              >
                Password
              </button>
              <button
                onClick={() => setAuthMethod("key")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authMethod === "key" 
                    ? "bg-primary text-white" 
                    : "bg-surface-hover hover:bg-border"
                }`}
              >
                SSH Key
              </button>
            </div>

            {authMethod === "password" ? (
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2 pr-10 bg-surface-hover border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            ) : (
              <textarea
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                rows={4}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-mono text-xs"
              />
            )}
          </div>

          {/* Central Server */}
          <div>
            <label className="block text-sm font-medium mb-1">Central Server IP</label>
            <input
              type="text"
              value={centralIp}
              onChange={(e) => setCentralIp(e.target.value)}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
            />
            <p className="text-xs text-muted mt-1">Agent will connect to this server</p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-4 rounded-lg border ${testResult.success ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
              <div className="flex items-center gap-2 mb-2">
                {testResult.success ? (
                  <CheckCircle className="text-green-400" size={18} />
                ) : (
                  <XCircle className="text-red-400" size={18} />
                )}
                <span className="font-medium">
                  {testResult.success ? "Connection Successful" : "Connection Failed"}
                </span>
              </div>
              {testResult.success ? (
                <div className="text-sm space-y-1 text-muted">
                  <p><span className="text-white">Hostname:</span> {testResult.hostname}</p>
                  <p><span className="text-white">OS:</span> {testResult.os}</p>
                  <p><span className="text-white">Docker:</span> {testResult.dockerVersion}</p>
                </div>
              ) : (
                <p className="text-sm text-red-400">{testResult.error}</p>
              )}
            </div>
          )}

          {/* Deploy Result */}
          {deployResult && (
            <div className={`p-4 rounded-lg border ${deployResult.success ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
              <div className="flex items-center gap-2 mb-2">
                {deployResult.success ? (
                  <CheckCircle className="text-green-400" size={18} />
                ) : (
                  <XCircle className="text-red-400" size={18} />
                )}
                <span className="font-medium">{deployResult.message}</span>
              </div>
              {deployResult.output && (
                <pre className="text-xs text-muted bg-black/30 p-2 rounded mt-2 overflow-x-auto max-h-32">
                  {deployResult.output}
                </pre>
              )}
              {deployResult.error && (
                <p className="text-sm text-red-400">{deployResult.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-border flex justify-between">
          <button
            onClick={handleTest}
            disabled={!host || !username || testing || deploying}
            className="px-4 py-2 bg-surface-hover hover:bg-border rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {testing && <Loader2 size={16} className="animate-spin" />}
            Test Connection
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-surface-hover hover:bg-border rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeploy}
              disabled={!host || !username || deploying || testing}
              className="px-4 py-2 bg-primary hover:bg-primary-hover rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deploying && <Loader2 size={16} className="animate-spin" />}
              Deploy Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
