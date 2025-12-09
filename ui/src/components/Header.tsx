"use client";

import { Bell, Search, ChevronDown, RefreshCw, Server, Container, X, Command, Settings, LogOut, User } from "lucide-react";
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
  const [isNodeOpen, setIsNodeOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  
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

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
      if (nodeRef.current && !nodeRef.current.contains(event.target as Node)) {
        setIsNodeOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
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

  // Get display name for selected node
  const getSelectedNodeName = () => {
    if (!selectedNode) return "All Nodes";
    const node = nodes?.nodes?.find((n: any) => n.hostname === selectedNode);
    return node?.display_name || selectedNode;
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-[var(--border)] bg-[var(--surface-glass)] backdrop-blur-md sticky top-0 z-50 transition-all duration-300">
      
      {/* Left: Search with polished interactive state */}
      <div className="flex items-center gap-4 flex-1 max-w-xl" ref={searchRef}>
        <div className="relative w-full max-w-md group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent-primary)] transition-colors duration-200" size={18} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery && setShowResults(true)}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg pl-10 pr-10 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all duration-200 shadow-sm hover:border-[var(--text-tertiary)]"
          />
          {searchQuery ? (
            <button 
              onClick={() => { setSearchQuery(""); setShowResults(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <X size={16} />
            </button>
          ) : (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-[10px] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded border border-[var(--border)] font-mono pointer-events-none opacity-60">
              /
            </div>
          )}
          
          {/* Enhanced Search Results Dropdown */}
          {showResults && (
            <div className="absolute top-full left-0 w-full mt-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl z-50 max-h-96 overflow-auto backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
              {searchResults.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center text-[var(--text-muted)]">
                  <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-3">
                    <Search size={20} className="opacity-50" />
                  </div>
                  <p className="text-sm">No results found for "{searchQuery}"</p>
                </div>
              ) : (
                <div className="py-2">
                  <div className="px-3 pb-2 text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider flex items-center justify-between">
                    <span>Results</span>
                    <span className="bg-[var(--bg-tertiary)] px-1.5 rounded text-[var(--text-muted)]">{searchResults.length}</span>
                  </div>
                  {searchResults.map((result, idx) => (
                    <button
                      key={`${result.type}-${result.name}-${idx}`}
                      onClick={() => handleResultClick(result)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] text-left transition-colors border-l-2 border-transparent hover:border-[var(--accent-primary)] group"
                    >
                      <div className={`p-2 rounded-lg transition-colors ${result.type === 'node' ? 'bg-green-500/10 text-green-500 group-hover:bg-green-500/20' : 'bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20'}`}>
                        {result.type === "node" ? <Server size={18} /> : <Container size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-white transition-colors">{result.name}</p>
                          {result.id && <span className="text-[10px] text-[var(--text-tertiary)] font-mono bg-[var(--bg-tertiary)] px-1 rounded">#{result.id.slice(0,8)}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                           <span className="text-xs text-[var(--text-muted)] capitalize">{result.type}</span>
                           {result.status && (
                             <>
                                <span className="text-[var(--text-tertiary)] text-[10px]">•</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  result.status.toLowerCase().includes('run') ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
                                }`}>
                                  {result.status}
                                </span>
                             </>
                           )}
                        </div>
                      </div>
                      <ChevronDown size={14} className="-rotate-90 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all transform group-hover:-translate-x-1" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center/Right: Actions & Profile */}
      <div className="flex items-center gap-3 md:gap-4">
        
        {/* Refresh Button */}
        <button
          onClick={() => refetch()}
          className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
          title="Refresh Data"
        >
          <RefreshCw size={18} className={isLoading ? "animate-spin text-[var(--accent-primary)]" : ""} />
        </button>

        {/* Custom Node Selector Dropdown */}
        <div className="relative" ref={nodeRef}>
          <button
            onClick={() => setIsNodeOpen(!isNodeOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text-primary)] transition-all min-w-[160px] justify-between shadow-sm ${isNodeOpen ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]' : ''}`}
          >
            <div className="flex items-center gap-2 truncate">
              <Server size={14} className={selectedNode ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"} />
              <span className="truncate max-w-[120px]">{getSelectedNodeName()}</span>
            </div>
            <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform duration-200 ${isNodeOpen ? 'rotate-180' : ''}`} />
          </button>

          {isNodeOpen && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
              <div className="p-2">
                <button
                  onClick={() => { onNodeChange(null); setIsNodeOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${!selectedNode ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-blue-500/20' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
                >
                  <div className={`p-1.5 rounded-md ${!selectedNode ? 'bg-white/20' : 'bg-[var(--bg-tertiary)]'}`}>
                    <Command size={14} />
                  </div>
                  <span className="font-medium">All Nodes</span>
                  {!selectedNode && <div className="ml-auto w-2 h-2 rounded-full bg-white shadow-glow" />}
                </button>
                
                <div className="my-1 border-t border-[var(--border)] opacity-50" />
                
                <div className="max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {nodes?.nodes?.map((node: { hostname: string; display_name?: string; online?: boolean }) => (
                    <button
                      key={node.hostname}
                      onClick={() => { onNodeChange(node.hostname); setIsNodeOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors mb-0.5 ${selectedNode === node.hostname ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-blue-500/20' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
                    >
                      <div className={`p-1.5 rounded-md ${selectedNode === node.hostname ? 'bg-white/20' : 'bg-[var(--bg-tertiary)]'}`}>
                        <Server size={14} />
                      </div>
                      <div className="flex-1 truncate">
                        <div className="font-medium truncate">{node.display_name || node.hostname}</div>
                        <div className={`text-[10px] ${selectedNode === node.hostname ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                          {node.online !== false ? 'Online' : 'Offline'}
                        </div>
                      </div>
                      {selectedNode === node.hostname && <div className="ml-auto w-2 h-2 rounded-full bg-white shadow-glow" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-[var(--border)] mx-1" />

        {/* Alerts & Profile */}
        <div className="flex items-center gap-2">
          <button className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors group">
            <Bell size={18} className="group-hover:animate-swing" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--accent-danger)] rounded-full ring-2 ring-[var(--surface-glass)] animate-pulse" />
          </button>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 pl-2 rounded-full hover:bg-[var(--surface-hover)] transition-all p-1 pr-3 border border-transparent hover:border-[var(--border)] group"
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white text-sm font-bold shadow-lg ring-2 ring-[var(--bg-primary)] group-hover:ring-[var(--accent-primary)] transition-all">
                  A
                </div>
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[var(--bg-primary)] rounded-full"></div>
              </div>
              <div className="flex flex-col items-start hidden sm:flex">
                <span className="text-xs font-semibold text-[var(--text-primary)] leading-none group-hover:text-[var(--accent-primary)] transition-colors">Admin</span>
                <span className="text-[10px] text-[var(--text-muted)] leading-none mt-0.5">View Profile</span>
              </div>
              <ChevronDown size={12} className={`text-[var(--text-muted)] ml-1 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProfileOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
                <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]/30">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white font-bold shadow-md text-lg">
                        A
                     </div>
                     <div className="overflow-hidden">
                       <div className="font-semibold text-[var(--text-primary)] truncate">Administrator</div>
                       <div className="text-xs text-[var(--text-muted)] truncate">admin@metalhive.io</div>
                     </div>
                  </div>
                </div>
                <div className="p-2 space-y-0.5">
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors group">
                    <User size={16} className="text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-colors" />
                    <span>My Account</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors group">
                    <Settings size={16} className="text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-colors" />
                    <span>Preferences</span>
                  </button>
                  <div className="my-1 border-t border-[var(--border)] opacity-50" />
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10 transition-colors">
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
