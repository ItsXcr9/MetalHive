"use client";

import { 
  LayoutDashboard, 
  Server, 
  Box, 
  Terminal, 
  Settings, 
  Brain, 
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Package,
  Sparkles
} from "lucide-react";
import { useState } from "react";

type Panel = "dashboard" | "nodes" | "containers" | "shell" | "config" | "ai" | "metrics" | "products" | "intelligence";

interface SidebarProps {
  activePanel: Panel;
  onNavigate: (panel: Panel) => void;
}

const navItems: { id: Panel; icon: typeof LayoutDashboard; label: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "nodes", icon: Server, label: "Nodes" },
  { id: "containers", icon: Box, label: "Containers" },
  { id: "products", icon: Package, label: "Products" },
  { id: "shell", icon: Terminal, label: "HiveShell" },
  { id: "config", icon: Settings, label: "HiveVault" },
  { id: "ai", icon: Brain, label: "MetalMind" },
  { id: "intelligence", icon: Sparkles, label: "Fleet Intelligence" },
  { id: "metrics", icon: BarChart3, label: "Metrics" },
];

export function Sidebar({ activePanel, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col sidebar transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-lg">
          Xcr9
        </div>
        {!collapsed && (
          <div>
            <h1 className="font-bold text-lg">MetalHive</h1>
            <p className="text-xs text-muted">Fleet Orchestrator</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePanel === item.id;

            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-400 border border-blue-500/30"
                      : "text-secondary hover:bg-surface-hover hover:text-primary border border-transparent"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={20} />
                  {!collapsed && <span className="text-sm">{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Button */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted hover:bg-surface-hover hover:text-primary transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
