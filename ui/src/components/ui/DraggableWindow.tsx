"use client";

import { useState, useEffect, useRef, ReactNode } from "react";
import { X, Maximize2, Minimize2, GripHorizontal } from "lucide-react";

interface DraggableWindowProps {
  title: string;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  children: ReactNode;
  onClose: () => void;
  headerRight?: ReactNode;
  className?: string;
  defaultPosition?: { x: number; y: number };
}

export function DraggableWindow({
  title,
  initialWidth = 800,
  initialHeight = 600,
  minWidth = 400,
  minHeight = 300,
  children,
  onClose,
  headerRight,
  className = "",
  defaultPosition,
}: DraggableWindowProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState(defaultPosition || { x: 100, y: 100 });
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  // Center on mount if no default position
  useEffect(() => {
    if (!defaultPosition && typeof window !== "undefined") {
      setPosition({
        x: Math.max(0, (window.innerWidth - initialWidth) / 2),
        y: Math.max(0, (window.innerHeight - initialHeight) / 2),
      });
    }
  }, [defaultPosition, initialWidth, initialHeight]);

  // Handle Dragging
  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (isMaximized) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: position.x,
      startTop: position.y,
    };
    document.addEventListener("mousemove", handleMouseMoveDrag);
    document.addEventListener("mouseup", handleMouseUpDrag);
    document.body.style.userSelect = "none";
  };

  const handleMouseMoveDrag = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    
    // Constrain to window bounds roughly
    setPosition({
      x: dragRef.current.startLeft + dx,
      y: dragRef.current.startTop + dy,
    });
  };

  const handleMouseUpDrag = () => {
    dragRef.current = null;
    document.removeEventListener("mousemove", handleMouseMoveDrag);
    document.removeEventListener("mouseup", handleMouseUpDrag);
    document.body.style.userSelect = "";
  };

  // Handle Resizing
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
    document.addEventListener("mousemove", handleMouseMoveResize);
    document.addEventListener("mouseup", handleMouseUpResize);
    document.body.style.userSelect = "none";
  };

  const handleMouseMoveResize = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    
    setSize({
      width: Math.max(minWidth, resizeRef.current.startWidth + dx),
      height: Math.max(minHeight, resizeRef.current.startHeight + dy),
    });
  };

  const handleMouseUpResize = () => {
    resizeRef.current = null;
    document.removeEventListener("mousemove", handleMouseMoveResize);
    document.removeEventListener("mouseup", handleMouseUpResize);
    document.body.style.userSelect = "";
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  const style = isMaximized
    ? { top: 0, left: 0, width: "100%", height: "100%", borderRadius: 0 }
    : { top: position.y, left: position.x, width: size.width, height: size.height };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Click outside blocker (optional, maybe we want non-modal?) */}
      {/* For now, making it modeless so you can interact with background if needed? 
          Actually user said "pop up", usually implies modal or at least float on top. 
          To allow interaction with background, we remove the backdrop.
          But we need pointer-events-auto on the window itself.
      */}
      <div 
        ref={windowRef}
        style={style}
        className={`pointer-events-auto absolute flex flex-col bg-[#050508]/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-75 ${isMaximized ? '' : 'rounded-xl'} ${className}`}
      >
        {/* Header Bar */}
        <div 
          onMouseDown={handleMouseDownDrag}
          className={`flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/5 ${isMaximized ? '' : 'cursor-grab active:cursor-grabbing'} select-none`}
        >
          <div className="flex items-center gap-3">
            <GripHorizontal className="text-white/20" size={18} />
            <h3 className="font-medium text-sm text-white/90">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
            <button 
              onClick={toggleMaximize}
              className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 rounded hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto relative bg-[#020204]/50">
          {children}
        </div>

        {/* Resize Handle */}
        {!isMaximized && (
          <div
            onMouseDown={handleMouseDownResize}
            className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center z-10"
          >
            <div className="w-2 h-2 border-r-2 border-b-2 border-white/20 rounded-br-[2px]" />
          </div>
        )}
      </div>
    </div>
  );
}
