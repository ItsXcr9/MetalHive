"""
MetalMind AI Engine - Main FastAPI Application

This module provides AI-powered analysis capabilities for MetalHive including:
- Natural language query processing
- Anomaly detection
- Trend prediction
- Auto-remediation recommendations
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from metalmind.config import settings
from metalmind.gemini import GeminiClient
from metalmind.openai_client import OpenAIClient, AIResponse
from metalmind.analyzers import AnomalyDetector, TrendAnalyzer
from metalmind.store import ClickHouseStore
from metalmind.history import ChatHistory

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)
logger = structlog.get_logger()


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("🤖 MetalMind AI Engine starting...")
    
    # Initialize AI client based on configuration
    if settings.ai_provider == "openai" and settings.openai_api_key:
        app.state.ai_client = OpenAIClient(settings.openai_api_key, settings.openai_model)
        logger.info("Using OpenAI", model=settings.openai_model)
    else:
        app.state.ai_client = GeminiClient(settings.gemini_api_key, settings.gemini_model)
        logger.info("Using Gemini", model=settings.gemini_model)
    
    # Keep gemini reference for backward compatibility
    app.state.gemini = app.state.ai_client
    
    # Initialize ClickHouse connection
    try:
        app.state.store = ClickHouseStore(settings.clickhouse_url)
        logger.info("Connected to ClickHouse", url=settings.clickhouse_url)
    except Exception as e:
        logger.error("Failed to connect to ClickHouse", error=str(e))
        app.state.store = None
    
    # Initialize analyzers
    app.state.anomaly_detector = AnomalyDetector()
    app.state.trend_analyzer = TrendAnalyzer()
    
    # Initialize chat history
    app.state.history = ChatHistory(settings.redis_url)
    
    logger.info("MetalMind AI Engine ready", port=settings.port)
    
    yield
    
    # Cleanup
    logger.info("MetalMind AI Engine shutting down...")


# Create FastAPI app
app = FastAPI(
    title="MetalMind AI Engine",
    description="AI-powered analysis for MetalHive fleet management",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class AskRequest(BaseModel):
    """Natural language query request"""
    query: str
    session_id: str | None = None  # For chat history
    context: dict[str, Any] | None = None


class AskResponse(BaseModel):
    """Natural language query response"""
    query: str
    response: str
    confidence: float
    sources: list[str] = []
    recommendations: list[str] = []


class AnalyzeRequest(BaseModel):
    """Analysis request"""
    hostname: str | None = None
    time_range_hours: int = 24
    analysis_type: str = "full"  # full, anomaly, trend, health


class AnalyzeResponse(BaseModel):
    """Analysis response"""
    report_id: str
    hostname: str | None
    summary: str
    severity: str  # info, warning, critical
    anomalies: list[dict[str, Any]] = []
    trends: list[dict[str, Any]] = []
    recommendations: list[str] = []
    created_at: datetime


class RemediationRequest(BaseModel):
    """Remediation request"""
    issue_type: str
    hostname: str
    container_id: str | None = None
    context: dict[str, Any] | None = None


class RemediationResponse(BaseModel):
    """Remediation response"""
    issue_type: str
    recommended_action: str
    confidence: float
    auto_execute: bool
    command: str | None = None
    explanation: str


# Routes
@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "metalmind",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/reports")
async def get_reports(limit: int = 50) -> dict[str, Any]:
    """
    Get saved AI analysis reports from ClickHouse.
    """
    store: ClickHouseStore | None = app.state.store
    
    if not store:
        return {"reports": [], "error": "Database not available"}
    
    try:
        reports = await store.get_reports(limit=limit)
        return {"reports": reports, "total": len(reports)}
    except Exception as e:
        logger.error("Failed to get reports", error=str(e))
        return {"reports": [], "error": str(e)}


@app.post("/ask", response_model=AskResponse)
async def ask_ai(request: AskRequest) -> AskResponse:
    """
    Process a natural language query about the fleet.
    
    Examples:
    - "Why did server-02 crash last night?"
    - "Which containers are using the most CPU?"
    - "How can I optimize my database performance?"
    - "Analyze fleet health"
    - "Security recommendations"
    """
    logger.info("Processing natural language query", query=request.query, session_id=request.session_id)
    
    ai_client = app.state.ai_client
    store: ClickHouseStore | None = app.state.store
    history: ChatHistory = app.state.history
    
    # Generate session ID if not provided
    session_id = request.session_id or f"session-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    
    # Build comprehensive context from all sources
    context = request.context or {}
    if store:
        try:
            # Get system health overview
            context["system_health"] = await store.get_system_health_summary()
            context["recent_alerts"] = await store.get_recent_alerts(hours=24)
            context["unhealthy_containers"] = await store.get_unhealthy_containers()
            context["node_health"] = await store.get_node_health_summary()
            
            # Get external API data for richer context
            context["ancientreport"] = await store.get_ancientreport_summary()
            context["mithrillog"] = await store.get_mithrillog_summary()
        except Exception as e:
            logger.warning("Failed to fetch context data", error=str(e))
    
    # Get chat history for context
    chat_history = await history.get_history(session_id, limit=10)
    if chat_history:
        context["chat_history"] = [
            {"role": m["role"], "content": m["content"][:200]}  # Truncate for context
            for m in chat_history[-5:]  # Last 5 messages
        ]
    
    # Enhanced system prompt for better diagnostics
    system_prompt = """You are MetalMind, an expert AI assistant for MetalHive - a bare-metal Docker fleet orchestrator.

You have deep knowledge of:
• Docker containers, images, and orchestration
• Linux system administration and troubleshooting
• Performance monitoring and optimization
• Security best practices

Your capabilities:
• Analyze container health and logs to diagnose issues
• Identify performance bottlenecks and resource constraints
• Recommend remediation steps for common problems
• Explain complex issues in simple terms
• Provide security recommendations using AncientReport data
• Analyze log patterns using MithrilLog data

Guidelines:
• Be concise and actionable. Start with the key finding.
• If asked about problems, check the context for unhealthy containers and recent alerts.
• Provide specific commands when recommending actions.
• If you don't have enough information, say what you need.

You have real-time access to:
• Node health status (online/offline)
• Container states and health checks
• Recent system alerts
• Metrics and performance data
• Security scans from AncientReport
• Log monitoring from MithrilLog
"""
    
    try:
        # Save user message to history
        await history.save_message(session_id, "user", request.query)
        
        response = await ai_client.generate(
            prompt=request.query,
            system_prompt=system_prompt,
            context=context,
        )
        
        # Save AI response to history
        await history.save_message(session_id, "assistant", response.text)
        
        return AskResponse(
            query=request.query,
            response=response.text,
            confidence=response.confidence,
            sources=response.sources,
            recommendations=response.recommendations,
        )
    except Exception as e:
        logger.error("Failed to generate AI response", error=str(e))
        raise HTTPException(status_code=500, detail="AI processing failed")


@app.get("/history/{session_id}")
async def get_chat_history(session_id: str, limit: int = 20) -> dict[str, Any]:
    """Get chat history for a session"""
    history: ChatHistory = app.state.history
    messages = await history.get_history(session_id, limit=limit)
    return {"session_id": session_id, "messages": messages, "count": len(messages)}


@app.delete("/history/{session_id}")
async def clear_chat_history(session_id: str) -> dict[str, Any]:
    """Clear chat history for a session"""
    history: ChatHistory = app.state.history
    success = await history.clear_history(session_id)
    return {"session_id": session_id, "cleared": success}


@app.get("/sessions")
async def list_sessions(limit: int = 20) -> dict[str, Any]:
    """List active chat sessions"""
    history: ChatHistory = app.state.history
    sessions = await history.get_sessions(limit=limit)
    return {"sessions": sessions, "count": len(sessions)}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_fleet(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Run AI analysis on the fleet or a specific node.
    
    Analysis types:
    - full: Complete analysis including anomalies, trends, and health
    - anomaly: Focus on anomaly detection
    - trend: Focus on trend analysis and predictions
    - health: Focus on health status and recovery recommendations
    """
    logger.info(
        "Running analysis",
        hostname=request.hostname,
        time_range=request.time_range_hours,
        type=request.analysis_type,
    )
    
    store: ClickHouseStore | None = app.state.store
    anomaly_detector: AnomalyDetector = app.state.anomaly_detector
    trend_analyzer: TrendAnalyzer = app.state.trend_analyzer
    gemini: GeminiClient = app.state.gemini
    
    if not store:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Fetch metrics
    since = datetime.utcnow() - timedelta(hours=request.time_range_hours)
    
    try:
        metrics = await store.get_metrics(
            hostname=request.hostname,
            since=since,
        )
    except Exception as e:
        logger.error("Failed to fetch metrics", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch metrics")
    
    anomalies = []
    trends = []
    
    # Run anomaly detection
    if request.analysis_type in ("full", "anomaly"):
        anomalies = anomaly_detector.detect(metrics)
    
    # Run trend analysis
    if request.analysis_type in ("full", "trend"):
        trends = trend_analyzer.analyze(metrics)
    
    # Generate AI summary
    analysis_context = {
        "hostname": request.hostname,
        "time_range_hours": request.time_range_hours,
        "anomalies_found": len(anomalies),
        "trends": trends,
        "metrics_summary": _summarize_metrics(metrics),
    }
    
    summary_prompt = f"""Analyze the following fleet data and provide a brief summary:
    
Hostname: {request.hostname or 'All nodes'}
Time range: Last {request.time_range_hours} hours
Anomalies detected: {len(anomalies)}
Trends: {len(trends)}

Provide a 2-3 sentence summary of the fleet health and any concerns."""

    try:
        summary_response = await gemini.generate(
            prompt=summary_prompt,
            context=analysis_context,
        )
        summary = summary_response.text
        recommendations = summary_response.recommendations
    except Exception:
        summary = f"Analysis complete. Found {len(anomalies)} anomalies and {len(trends)} trends."
        recommendations = []
    
    # Determine severity
    severity = "info"
    if any(a.get("severity") == "critical" for a in anomalies):
        severity = "critical"
    elif any(a.get("severity") == "warning" for a in anomalies):
        severity = "warning"
    
    report_id = f"report-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    
    # Save report to ClickHouse
    if store:
        try:
            report_data = {
                "id": report_id,
                "type": "anomaly" if anomalies else "recommendation",
                "severity": severity,
                "title": f"Fleet Analysis - {request.hostname or 'All Nodes'}",
                "summary": summary,
                "details": f"Time range: {request.time_range_hours}h, Anomalies: {len(anomalies)}, Trends: {len(trends)}",
                "affected_nodes": [request.hostname] if request.hostname else [],
                "recommendations": recommendations,
            }
            await store.save_report(report_data)
            logger.info("Report saved to ClickHouse", report_id=report_id)
        except Exception as e:
            logger.warning("Failed to save report to ClickHouse", error=str(e))

    return AnalyzeResponse(
        report_id=report_id,
        hostname=request.hostname,
        summary=summary,
        severity=severity,
        anomalies=anomalies,
        trends=trends,
        recommendations=recommendations,
        created_at=datetime.utcnow(),
    )


@app.post("/remediate", response_model=RemediationResponse)
async def get_remediation(request: RemediationRequest) -> RemediationResponse:
    """
    Get AI-powered remediation recommendations for an issue.
    
    Issue types:
    - high_cpu: CPU usage above threshold
    - high_memory: Memory usage above threshold
    - container_crash: Container crash loop
    - disk_full: Disk space critical
    - network_issue: Network connectivity problems
    """
    logger.info(
        "Generating remediation",
        issue_type=request.issue_type,
        hostname=request.hostname,
        container_id=request.container_id,
    )
    
    gemini: GeminiClient = app.state.gemini
    
    remediation_prompt = f"""As a DevOps expert, recommend a remediation for the following issue:

Issue Type: {request.issue_type}
Hostname: {request.hostname}
Container: {request.container_id or 'N/A'}
Context: {request.context or 'None provided'}

Provide:
1. A recommended action (1 sentence)
2. Whether this can be auto-executed (yes/no and why)
3. The specific command to run (if applicable)
4. A brief explanation

Format your response as:
ACTION: [action]
AUTO_EXECUTE: [yes/no - reason]
COMMAND: [command or 'none']
EXPLANATION: [explanation]"""

    try:
        response = await gemini.generate(prompt=remediation_prompt)
        
        # Parse response
        lines = response.text.strip().split("\n")
        action = ""
        auto_execute = False
        command = None
        explanation = ""
        
        for line in lines:
            if line.startswith("ACTION:"):
                action = line.replace("ACTION:", "").strip()
            elif line.startswith("AUTO_EXECUTE:"):
                auto_execute = "yes" in line.lower()
            elif line.startswith("COMMAND:"):
                cmd = line.replace("COMMAND:", "").strip()
                if cmd.lower() != "none":
                    command = cmd
            elif line.startswith("EXPLANATION:"):
                explanation = line.replace("EXPLANATION:", "").strip()
        
        return RemediationResponse(
            issue_type=request.issue_type,
            recommended_action=action or "Manual investigation required",
            confidence=response.confidence,
            auto_execute=auto_execute,
            command=command,
            explanation=explanation or response.text,
        )
    except Exception as e:
        logger.error("Failed to generate remediation", error=str(e))
        raise HTTPException(status_code=500, detail="Remediation generation failed")


def _summarize_metrics(metrics: list[dict]) -> dict[str, Any]:
    """Summarize metrics for AI context"""
    if not metrics:
        return {"count": 0}
    
    return {
        "count": len(metrics),
        "time_range": {
            "start": min(m.get("timestamp", datetime.now()) for m in metrics).isoformat(),
            "end": max(m.get("timestamp", datetime.now()) for m in metrics).isoformat(),
        },
    }


def main():
    """Entry point for the application"""
    import uvicorn
    
    uvicorn.run(
        "metalmind.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
