"use client";

import { Bell, Search, ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNodes } from "@/lib/api";

interface HeaderProps {
  selectedNode: string | null;
  onNodeChange: (node: string | null) => void;
}

export function Header({ selectedNode, onNodeChange }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: nodes, isLoading, refetch } = useQuery({
    queryKey: ["nodes"],
    queryFn: fetchNodes,
  });

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-surface">
      {/* Left: Search */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            type="text"
            placeholder="Search containers, nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10 w-64"
          />
        </div>
      </div>

      {/* Center: Node Selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => refetch()}
          className="btn-ghost p-2 rounded-lg"
          title="Refresh"
        >
          <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
        </button>
        
        <div className="relative">
          <select
            value={selectedNode || "all"}
            onChange={(e) => onNodeChange(e.target.value === "all" ? null : e.target.value)}
            className="input pr-10 appearance-none cursor-pointer"
          >
            <option value="all">All Nodes</option>
            {nodes?.nodes?.map((node: { hostname: string }) => (
              <option key={node.hostname} value={node.hostname}>
                {node.hostname}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={18} />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Alerts */}
        <button className="relative btn-ghost p-2 rounded-lg">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User */}
        <div className="flex items-center gap-2 pl-3 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-medium">
            A
          </div>
          <span className="text-sm font-medium">Admin</span>
        </div>
      </div>
    </header>
  );
}
