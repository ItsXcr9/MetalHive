"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { DashboardStats } from "@/components/DashboardStats";
import { AncientReportWidget } from "@/components/AncientReportWidget";
import { FleetOverview } from "@/components/FleetOverview";
import { fetchNodes } from "@/lib/api";

const METRICS_API = process.env.NEXT_PUBLIC_ANCIENTREPORT_API || "http://localhost:8800";

// Loading component for dynamic chunks
const PanelLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-muted">Loading panel...</span>
    </div>
  </div>
);

// Dynamic imports for code splitting
const NodesPanel = dynamic(() => import("@/components/NodesPanel").then(mod => mod.NodesPanel), {
  loading: () => <PanelLoader />,
});
const ContainersPanel = dynamic(() => import("@/components/ContainersPanel").then(mod => mod.ContainersPanel), {
  loading: () => <PanelLoader />,
});
const ShellPanel = dynamic(() => import("@/components/ShellPanel").then(mod => mod.ShellPanel), {
  loading: () => <PanelLoader />,
});
const ConfigPanel = dynamic(() => import("@/components/ConfigPanel").then(mod => mod.ConfigPanel), {
  loading: () => <PanelLoader />,
});
const AIPanel = dynamic(() => import("@/components/AIPanel").then(mod => mod.AIPanel), {
  loading: () => <PanelLoader />,
});
const MetricsPanel = dynamic(() => import("@/components/MetricsPanel").then(mod => mod.MetricsPanel), {
  loading: () => <PanelLoader />,
});
const ProductsPanel = dynamic(() => import("@/components/ProductsPanel").then(mod => mod.ProductsPanel), {
  loading: () => <PanelLoader />,
});

type ActivePanel = "dashboard" | "nodes" | "containers" | "shell" | "config" | "ai" | "metrics" | "products";

export default function Home() {
  const [activePanel, setActivePanel] = useState<ActivePanel>("dashboard");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Prefetch nodes and server info on mount for instant loading when navigating
  useEffect(() => {
    // Preload the NodesPanel component module (code splitting)
    import("@/components/NodesPanel");

    // Prefetch nodes list
    queryClient.prefetchQuery({
      queryKey: ["nodes"],
      queryFn: fetchNodes,
      staleTime: 30000,
    });

    // Prefetch server info from AncientReport
    queryClient.prefetchQuery({
      queryKey: ["servers-info"],
      queryFn: async () => {
        const res = await fetch(`${METRICS_API}/api/servers/info`);
        if (!res.ok) return {};
        const data = await res.json();
        return data.servers || {};
      },
      staleTime: 30000,
    });
  }, [queryClient]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar activePanel={activePanel} onNavigate={setActivePanel} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header 
          selectedNode={selectedNode} 
          onNodeChange={setSelectedNode}
          onNavigate={(panel) => setActivePanel(panel as ActivePanel)}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {activePanel === "dashboard" && (
            <DashboardView 
              onNavigate={setActivePanel} 
              selectedNode={selectedNode}
              onNodeChange={setSelectedNode}
            />
          )}
          {activePanel === "nodes" && (
            <NodesPanel 
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />
          )}
          {activePanel === "containers" && (
            <ContainersPanel selectedNode={selectedNode} />
          )}
          {activePanel === "shell" && (
            <ShellPanel />
          )}
          {activePanel === "config" && (
            <ConfigPanel />
          )}
          {activePanel === "ai" && (
            <AIPanel />
          )}
          {activePanel === "metrics" && (
            <MetricsPanel selectedNode={selectedNode} />
          )}
          {activePanel === "products" && (
            <ProductsPanel />
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardView({ 
  onNavigate, 
  selectedNode,
  onNodeChange
}: { 
  onNavigate: (panel: ActivePanel) => void;
  selectedNode: string | null;
  onNodeChange: (node: string | null) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Fleet Overview - Top Section with Server Grid */}
      <FleetOverview 
        selectedNode={selectedNode} 
        onSelectNode={onNodeChange} 
      />

      {/* Conditional Content Based on Selection */}
      {selectedNode ? (
        /* Single Server View - Detailed info for selected node */
        <div className="space-y-6">
          {/* Detailed Metrics for Selected Node */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">
              📊 Detailed Metrics: {selectedNode}
            </h2>
            <MetricsPanel selectedNode={selectedNode} />
          </div>

          {/* AncientReport for this node */}
          <AncientReportWidget />
        </div>
      ) : (
        /* All Servers View - Fleet-wide overview */
        <div className="space-y-6">
          {/* Quick Stats */}
          <DashboardStats onNavigate={onNavigate} />

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* AncientReport Integration - Takes 2 columns */}
            <div className="xl:col-span-2">
              <AncientReportWidget />
            </div>

            {/* AI Assistant - Side */}
            <div className="card h-fit">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                🤖 MetalMind AI
              </h2>
              <AIPanel compact />
            </div>
          </div>

          {/* Fleet Metrics Chart - Disabled for now
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">📈 Fleet Metrics</h2>
            <div className="h-64">
              <MetricsPanel selectedNode={null} compact />
            </div>
          </div>
          */}

          {/* Products Quick View */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Xcr9 Products</h2>
              <button 
                onClick={() => onNavigate("products")}
                className="btn btn-secondary btn-sm"
              >
                View All
              </button>
            </div>
            <ProductsQuickView />
          </div>
        </div>
      )}
    </div>
  );
}

// Quick view of products for dashboard
function ProductsQuickView() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <ProductQuickCard 
        name="AncientReport" 
        icon="📈" 
        type="eBPF Observability"
        status="running"
      />
      <ProductQuickCard 
        name="MithrilLog" 
        icon="📜" 
        type="Log Analysis"
        status="running"
        count={5}
      />
      <ProductQuickCard 
        name="MetalHive" 
        icon="🐝" 
        type="Fleet Orchestrator"
        status="running"
        self
      />
    </div>
  );
}

function ProductQuickCard({ 
  name, 
  icon, 
  type, 
  status,
  count,
  self
}: { 
  name: string; 
  icon: string; 
  type: string; 
  status: "running" | "stopped" | "partial";
  count?: number;
  self?: boolean;
}) {
  const statusColors = {
    running: "bg-green-500",
    stopped: "bg-red-500",
    partial: "bg-yellow-500",
  };

  return (
    <div className="p-4 rounded-lg bg-surface-hover hover:bg-surface transition-colors cursor-pointer group">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{name}</p>
            {count && (
              <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                ×{count}
              </span>
            )}
            {self && (
              <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                This
              </span>
            )}
          </div>
          <p className="text-xs text-muted">{type}</p>
        </div>
        <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
      </div>
    </div>
  );
}
