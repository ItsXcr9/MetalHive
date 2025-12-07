"use client";

import { useQuery } from "@tanstack/react-query";
import { 
  Server, 
  Container, 
  Package, 
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface NodesData {
  nodes: Array<{
    hostname: string;
    ip: string;
    status: string;
    online: boolean;
    containers: number;
  }>;
  total: number;
}

interface ContainerData {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

interface ContainersResponse {
  containers: ContainerData[];
  total: number;
}

interface ProductData {
  name: string;
  key: string;
  type: string;
  running: boolean;
  api_healthy: boolean;
  total_running: number;
  total_expected: number;
}

interface ProductsResponse {
  products: ProductData[];
  total: number;
}

async function fetchNodes(): Promise<NodesData> {
  const res = await fetch(`${API_URL}/api/v1/nodes`);
  if (!res.ok) throw new Error("Failed to fetch nodes");
  return res.json();
}

async function fetchContainers(): Promise<ContainersResponse> {
  const res = await fetch(`${API_URL}/api/v1/containers`);
  if (!res.ok) throw new Error("Failed to fetch containers");
  return res.json();
}

async function fetchProducts(): Promise<ProductsResponse> {
  const res = await fetch(`${API_URL}/api/v1/products`);
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

interface DashboardStatsProps {
  onNavigate: (panel: "nodes" | "containers" | "products" | "shell" | "config" | "ai" | "metrics") => void;
}

export function DashboardStats({ onNavigate }: DashboardStatsProps) {
  const { data: nodesData, isLoading: nodesLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: fetchNodes,
    refetchInterval: 15000,
  });

  const { data: containersData, isLoading: containersLoading } = useQuery({
    queryKey: ["containers"],
    queryFn: fetchContainers,
    refetchInterval: 15000,
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    refetchInterval: 30000,
  });

  const onlineNodes = nodesData?.nodes?.filter(n => n.online).length || 0;
  const totalNodes = nodesData?.total || 0;
  
  const runningContainers = containersData?.containers?.filter(c => c.state === "running").length || 0;
  const totalContainers = containersData?.total || 0;

  const healthyProducts = productsData?.products?.filter(p => p.running && p.api_healthy).length || 0;
  const runningProducts = productsData?.products?.filter(p => p.running).length || 0;
  const totalProducts = productsData?.total || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Nodes Card */}
      <StatCard
        title="Nodes"
        value={nodesLoading ? "..." : totalNodes.toString()}
        subtitle={`${onlineNodes} online`}
        icon={<Server className="text-blue-400" size={24} />}
        color="blue"
        loading={nodesLoading}
        onClick={() => onNavigate("nodes")}
        healthy={onlineNodes === totalNodes}
      />

      {/* Containers Card */}
      <StatCard
        title="Containers"
        value={containersLoading ? "..." : totalContainers.toString()}
        subtitle={`${runningContainers} running`}
        icon={<Container className="text-green-400" size={24} />}
        color="green"
        loading={containersLoading}
        onClick={() => onNavigate("containers")}
        healthy={runningContainers === totalContainers}
      />

      {/* Products Card */}
      <StatCard
        title="Products"
        value={productsLoading ? "..." : totalProducts.toString()}
        subtitle={`${runningProducts} running, ${healthyProducts} healthy`}
        icon={<Package className="text-purple-400" size={24} />}
        color="purple"
        loading={productsLoading}
        onClick={() => onNavigate("products")}
        healthy={healthyProducts === totalProducts}
      />

      {/* System Health Card */}
      <SystemHealthCard 
        nodes={{ total: totalNodes, online: onlineNodes }}
        containers={{ total: totalContainers, running: runningContainers }}
        products={{ total: totalProducts, healthy: healthyProducts }}
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  loading,
  onClick,
  healthy,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "red";
  loading?: boolean;
  onClick?: () => void;
  healthy?: boolean;
}) {
  const colorClasses = {
    blue: "border-blue-500/30 hover:border-blue-500/50",
    green: "border-green-500/30 hover:border-green-500/50",
    purple: "border-purple-500/30 hover:border-purple-500/50",
    red: "border-red-500/30 hover:border-red-500/50",
  };

  const bgClasses = {
    blue: "bg-blue-500/10",
    green: "bg-green-500/10",
    purple: "bg-purple-500/10",
    red: "bg-red-500/10",
  };

  return (
    <div
      className={`card cursor-pointer transition-all group ${colorClasses[color]}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${bgClasses[color]}`}>
          {icon}
        </div>
        {healthy !== undefined && (
          healthy ? (
            <CheckCircle className="text-green-400" size={16} />
          ) : (
            <AlertCircle className="text-yellow-400" size={16} />
          )
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm text-muted">{title}</p>
        <p className={`text-3xl font-bold mt-1 ${loading ? "animate-pulse" : ""}`}>
          {value}
        </p>
        <p className="text-sm text-muted mt-1">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1 mt-3 text-xs text-muted group-hover:text-primary transition-colors">
        View details <ArrowRight size={12} />
      </div>
    </div>
  );
}

function SystemHealthCard({
  nodes,
  containers,
  products,
}: {
  nodes: { total: number; online: number };
  containers: { total: number; running: number };
  products: { total: number; healthy: number };
}) {
  // Calculate overall health percentage
  const nodeHealth = nodes.total > 0 ? (nodes.online / nodes.total) * 100 : 100;
  const containerHealth = containers.total > 0 ? (containers.running / containers.total) * 100 : 100;
  const productHealth = products.total > 0 ? (products.healthy / products.total) * 100 : 100;
  
  const overallHealth = Math.round((nodeHealth + containerHealth + productHealth) / 3);
  
  const healthColor = overallHealth >= 90 
    ? "text-green-400" 
    : overallHealth >= 70 
      ? "text-yellow-400" 
      : "text-red-400";

  const healthBgColor = overallHealth >= 90 
    ? "bg-green-500/10 border-green-500/30" 
    : overallHealth >= 70 
      ? "bg-yellow-500/10 border-yellow-500/30" 
      : "bg-red-500/10 border-red-500/30";

  return (
    <div className={`card ${healthBgColor}`}>
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg bg-white/5">
          <Activity className={healthColor} size={24} />
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <Clock size={12} />
          Live
        </div>
      </div>
      <div className="mt-4">
        <p className="text-sm text-muted">System Health</p>
        <p className={`text-3xl font-bold mt-1 ${healthColor}`}>
          {overallHealth}%
        </p>
        <div className="mt-3 space-y-1">
          <HealthBar label="Nodes" value={nodeHealth} />
          <HealthBar label="Containers" value={containerHealth} />
          <HealthBar label="Products" value={productHealth} />
        </div>
      </div>
    </div>
  );
}

function HealthBar({ label, value }: { label: string; value: number }) {
  const color = value >= 90 ? "bg-green-500" : value >= 70 ? "bg-yellow-500" : "bg-red-500";
  
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted w-20">{label}</span>
      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all`} 
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-muted w-8 text-right">{Math.round(value)}%</span>
    </div>
  );
}
