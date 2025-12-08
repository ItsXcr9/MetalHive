"use client";

import { Bell, Search, ChevronDown, RefreshCw, Server, Container, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNodes, fetchContainers } from "@/lib/api";

interface HeaderProps {
  selectedNode: string | null;
  onNodeChange: (node: string | null) => void;
  onNavigate?: (panel: string) => void;
}

interface SearchResult {
  type: "node" | "container";
  name: string;
  id?: string;
  status?: string;
}

export function Header({ selectedNode, onNodeChange, onNavigate }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  
  const { data: nodes, isLoading, refetch } = useQuery({
    queryKey: ["nodes"],
    queryFn: fetchNodes,
  });

  const { data: containers } = useQuery({
    queryKey: ["containers"],
    queryFn: () => fetchContainers(),
  });

  // Search logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    // Search nodes
    nodes?.nodes?.forEach((node: { hostname: string; display_name?: string }) => {
      const name = node.display_name || node.hostname;
      if (name.toLowerCase().includes(query) || node.hostname.toLowerCase().includes(query)) {
        results.push({ type: "node", name: node.hostname });
      }
    });

    // Search containers
    containers?.containers?.forEach((container: { name?: string; id: string; state: string }) => {
      const containerName = container.name || container.id.slice(0, 12);
      if (containerName.toLowerCase().includes(query) || container.id.toLowerCase().includes(query)) {
        results.push({ 
          type: "container", 
          name: containerName, 
          id: container.id,
          status: container.state
        });
      }
    });

    setSearchResults(results.slice(0, 8)); // Max 8 results
    setShowResults(results.length > 0);
  }, [searchQuery, nodes, containers]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResultClick = (result: SearchResult) => {
    if (result.type === "node") {
      onNodeChange(result.name);
      onNavigate?.("nodes");
    } else {
      onNavigate?.("containers");
    }
    setSearchQuery("");
    setShowResults(false);
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-surface">
      {/* Left: Search */}
      <div className="flex items-center gap-4" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            type="text"
            placeholder="Search containers, nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery && setShowResults(true)}
            className="input pl-10 pr-10 w-72"
          />
          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(""); setShowResults(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          )}
          
          {/* Search Results Dropdown */}
          {showResults && (
            <div className="absolute top-full left-0 w-full mt-1 bg-surface border border-border rounded-lg shadow-xl z-50 max-h-80 overflow-auto">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-muted text-sm">No results found</div>
              ) : (
                searchResults.map((result, idx) => (
                  <button
                    key={`${result.type}-${result.name}-${idx}`}
                    onClick={() => handleResultClick(result)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover text-left transition-colors"
                  >
                    {result.type === "node" ? (
                      <Server size={18} className="text-green-500" />
                    ) : (
                      <Container size={18} className="text-blue-500" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{result.name}</p>
                      <p className="text-xs text-muted capitalize">{result.type}{result.status ? ` • ${result.status}` : ""}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
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
            {nodes?.nodes?.map((node: { hostname: string; display_name?: string }) => (
              <option key={node.hostname} value={node.hostname}>
                {node.display_name || node.hostname}
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
