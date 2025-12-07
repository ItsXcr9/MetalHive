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

type ActivePanel = "dashboard" | "nodes" | "containers" | "shell" | "config" | "ai" | "metrics";

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
        </main>
      </div>
    </div>
  );
}

function DashboardView({ 
  onNavigate, 
  selectedNode 
}: { 
  onNavigate: (panel: ActivePanel) => void;
  selectedNode: string | null;
}) {
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Nodes"
          value="5"
          subtitle="4 online"
          color="blue"
          onClick={() => onNavigate("nodes")}
        />
        <StatCard
          title="Containers"
          value="47"
          subtitle="42 running"
          color="green"
          onClick={() => onNavigate("containers")}
        />
        <StatCard
          title="Alerts"
          value="3"
          subtitle="1 critical"
          color="red"
        />
        <StatCard
          title="Commands"
          value="128"
          subtitle="Last hour"
          color="purple"
          onClick={() => onNavigate("shell")}
        />
      </div>

      {/* Main Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet Overview */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold mb-4">Fleet Overview</h2>
          <div className="h-64 flex items-center justify-center text-muted">
            <MetricsPanel selectedNode={selectedNode} compact />
          </div>
        </div>

        {/* AI Assistant */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">MetalMind AI</h2>
          <AIPanel compact />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-3">
          <ActivityItem
            type="command"
            message="apt update on all nodes"
            time="2 min ago"
            status="success"
          />
          <ActivityItem
            type="container"
            message="nginx restarted on worker-02"
            time="5 min ago"
            status="success"
          />
          <ActivityItem
            type="alert"
            message="High CPU on worker-03"
            time="12 min ago"
            status="warning"
          />
          <ActivityItem
            type="config"
            message="DATABASE_URL updated"
            time="1 hour ago"
            status="info"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  color,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "blue" | "green" | "red" | "purple";
  onClick?: () => void;
}) {
  const colorClasses = {
    blue: "border-blue-500/30 hover:border-blue-500/50",
    green: "border-green-500/30 hover:border-green-500/50",
    red: "border-red-500/30 hover:border-red-500/50",
    purple: "border-purple-500/30 hover:border-purple-500/50",
  };

  return (
    <div
      className={`card cursor-pointer transition-all ${colorClasses[color]}`}
      onClick={onClick}
    >
      <p className="text-sm text-muted">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      <p className="text-sm text-muted mt-1">{subtitle}</p>
    </div>
  );
}

function ActivityItem({
  type,
  message,
  time,
  status,
}: {
  type: "command" | "container" | "alert" | "config";
  message: string;
  time: string;
  status: "success" | "warning" | "info";
}) {
  const statusColors = {
    success: "text-green-400",
    warning: "text-yellow-400",
    info: "text-blue-400",
  };

  const typeIcons = {
    command: "⚡",
    container: "📦",
    alert: "🔔",
    config: "⚙️",
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface hover:bg-surface-hover transition-colors">
      <span className="text-xl">{typeIcons[type]}</span>
      <div className="flex-1">
        <p className="text-sm">{message}</p>
        <p className="text-xs text-muted">{time}</p>
      </div>
      <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
    </div>
  );
}
