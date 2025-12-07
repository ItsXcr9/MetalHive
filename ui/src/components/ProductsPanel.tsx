"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Package, 
  Play, 
  Square, 
  Download, 
  Trash2, 
  ExternalLink,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface ContainerStatus {
  name: string;
  id?: string;
  status: string;
  running: boolean;
  image?: string;
}

interface ProductStatus {
  name: string;
  key: string;
  type: string;
  description: string;
  installed: boolean;
  running: boolean;
  partial_running: boolean;
  containers: ContainerStatus[];
  total_expected: number;
  total_running: number;
  api_url?: string;
  ui_url?: string;
  icon: string;
  api_healthy: boolean;
  path: string;
}

// Fetch products from API
async function fetchProducts(): Promise<{ products: ProductStatus[] }> {
  const res = await fetch(`${API_URL}/api/v1/products`);
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

// Product actions
async function productAction(productKey: string, action: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/v1/products/${productKey}/${action}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to ${action} product`);
  return res.json();
}

export function ProductsPanel() {
  const queryClient = useQueryClient();
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const actionMutation = useMutation({
    mutationFn: ({ key, action }: { key: string; action: string }) => 
      productAction(key, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-400">Failed to load products</p>
        <p className="text-sm text-muted mt-2">Please check your connection</p>
        <button 
          onClick={() => refetch()} 
          className="btn btn-secondary mt-4"
        >
          <RefreshCw size={16} className="mr-2" /> Retry
        </button>
      </div>
    );
  }

  const products = data?.products || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Xcr9 Products</h1>
          <p className="text-sm text-muted mt-1">
            Manage and monitor your Xcr9 product suite
          </p>
        </div>
        <button 
          onClick={() => refetch()} 
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* Product Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {products.length === 0 ? (
          <div className="col-span-full card text-center py-12">
            <Package className="mx-auto text-muted mb-4" size={48} />
            <p className="text-lg font-medium">No products configured</p>
            <p className="text-sm text-muted mt-2">
              Products will appear here once detected
            </p>
          </div>
        ) : (
          products.map((product) => (
            <ProductCard
              key={product.key}
              product={product}
              expanded={expandedProduct === product.key}
              onToggleExpand={() => 
                setExpandedProduct(
                  expandedProduct === product.key ? null : product.key
                )
              }
              onAction={(action) => 
                actionMutation.mutate({ key: product.key, action })
              }
              isLoading={actionMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProductCard({
  product,
  expanded,
  onToggleExpand,
  onAction,
  isLoading,
}: {
  product: ProductStatus;
  expanded: boolean;
  onToggleExpand: () => void;
  onAction: (action: string) => void;
  isLoading: boolean;
}) {
  const getStatusColor = () => {
    if (product.running) return "text-green-400";
    if (product.partial_running) return "text-yellow-400";
    if (product.installed) return "text-orange-400";
    return "text-muted";
  };

  const getStatusText = () => {
    if (product.running) return "Running";
    if (product.partial_running) return "Partially Running";
    if (product.installed) return "Stopped";
    return "Not Installed";
  };

  const getStatusIcon = () => {
    if (product.running) return <CheckCircle className="text-green-400" size={20} />;
    if (product.partial_running) return <AlertCircle className="text-yellow-400" size={20} />;
    if (product.installed) return <Square className="text-orange-400" size={20} />;
    return <XCircle className="text-muted" size={20} />;
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-2xl">
            {product.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{product.name}</h3>
              <span className="badge badge-info text-xs">{product.type}</span>
            </div>
            <p className="text-sm text-muted">{product.description}</p>
            <p className="text-xs text-muted font-mono mt-1">{product.path}</p>
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-surface-hover">
        <div className="flex items-center gap-2">
          <span className={`status-dot ${product.running ? "status-online" : product.installed ? "status-warning" : "status-offline"}`} />
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>
        <div className="text-sm text-muted">
          {product.total_running}/{product.total_expected} containers
        </div>
      </div>

      {/* API Health */}
      {product.installed && product.api_url && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Activity size={14} className={product.api_healthy ? "text-green-400" : "text-red-400"} />
          <span className={product.api_healthy ? "text-green-400" : "text-red-400"}>
            API {product.api_healthy ? "Healthy" : "Unhealthy"}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {!product.installed ? (
          <button
            onClick={() => onAction("install")}
            disabled={isLoading}
            className="btn btn-primary flex items-center gap-2"
          >
            <Download size={16} /> Install
          </button>
        ) : (
          <>
            {product.running ? (
              <button
                onClick={() => onAction("stop")}
                disabled={isLoading}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Square size={16} /> Stop
              </button>
            ) : (
              <button
                onClick={() => onAction("start")}
                disabled={isLoading}
                className="btn btn-primary flex items-center gap-2"
              >
                <Play size={16} /> Start
              </button>
            )}
            <button
              onClick={() => onAction("uninstall")}
              disabled={isLoading}
              className="btn btn-danger flex items-center gap-2"
            >
              <Trash2 size={16} /> Uninstall
            </button>
          </>
        )}

        {product.ui_url && product.running && (
          <a
            href={product.ui_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary flex items-center gap-2"
          >
            <ExternalLink size={16} /> Open UI
          </a>
        )}
      </div>

      {/* Expand/Collapse Containers */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted hover:text-primary transition-colors border-t border-border"
      >
        {expanded ? (
          <>
            <ChevronUp size={16} /> Hide Containers
          </>
        ) : (
          <>
            <ChevronDown size={16} /> Show Containers ({product.containers.length})
          </>
        )}
      </button>

      {/* Container Details */}
      {expanded && (
        <div className="mt-4 space-y-2">
          {product.containers.map((container) => (
            <div
              key={container.name}
              className="flex items-center justify-between p-3 rounded-lg bg-surface-hover text-sm"
            >
              <div className="flex items-center gap-2">
                <span className={`status-dot ${container.running ? "status-online" : "status-offline"}`} />
                <span className="font-mono">{container.name}</span>
              </div>
              <div className="flex items-center gap-4">
                {container.id && (
                  <span className="text-muted font-mono text-xs">{container.id}</span>
                )}
                <span className={container.running ? "text-green-400" : "text-red-400"}>
                  {container.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
