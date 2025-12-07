"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { NodesPanel } from "@/components/NodesPanel";
import { ContainersPanel } from "@/components/ContainersPanel";
import { ShellPanel } from "@/components/ShellPanel";
import { ConfigPanel } from "@/components/ConfigPanel";
import { AIPanel } from "@/components/AIPanel";
import { MetricsPanel } from "@/components/MetricsPanel";
import { ProductsPanel } from "@/components/ProductsPanel";
import { DashboardStats } from "@/components/DashboardStats";
import { AncientReportWidget } from "@/components/AncientReportWidget";
import { FleetOverview } from "@/components/FleetOverview";

type ActivePanel = "dashboard" | "nodes" | "containers" | "shell" | "config" | "ai" | "metrics" | "products";

export default function Home() {
  const [activePanel, setActivePanel] = useState<ActivePanel>("dashboard");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar activePanel={activePanel} onNavigate={setActivePanel} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header 
          selectedNode={selectedNode} 
          onNodeChange={setSelectedNode} 
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

          {/* Fleet Metrics Chart */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">📈 Fleet Metrics</h2>
            <div className="h-64">
              <MetricsPanel selectedNode={null} compact />
            </div>
          </div>

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
