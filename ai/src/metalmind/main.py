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
from metalmind.analyzers import AnomalyDetector, TrendAnalyzer
from metalmind.store import ClickHouseStore

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
    
    # Initialize Gemini client
    app.state.gemini = GeminiClient(settings.gemini_api_key, settings.gemini_model)
    
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


@app.post("/ask", response_model=AskResponse)
async def ask_ai(request: AskRequest) -> AskResponse:
    """
    Process a natural language query about the fleet.
    
    Examples:
    - "Why did server-02 crash last night?"
    - "Which containers are using the most CPU?"
    - "How can I optimize my database performance?"
    """
    logger.info("Processing natural language query", query=request.query)
    
    gemini: GeminiClient = app.state.gemini
    store: ClickHouseStore | None = app.state.store
    
    # Build context from database if available
    context = request.context or {}
    if store:
        try:
            # Get recent metrics and events for context
            context["recent_alerts"] = await store.get_recent_alerts(hours=24)
            context["node_health"] = await store.get_node_health_summary()
        except Exception as e:
            logger.warning("Failed to fetch context data", error=str(e))
    
    # Build prompt
    system_prompt = """You are MetalMind, an AI assistant for MetalHive - a bare-metal Docker fleet orchestrator.
You help DevOps engineers understand their infrastructure, diagnose issues, and optimize performance.
Be concise but thorough. If you're unsure, say so. Always provide actionable recommendations when possible.

Available context about the fleet:
- Recent alerts and events
- Node health status
- Container metrics
- Configuration history
"""
    
    try:
        response = await gemini.generate(
            prompt=request.query,
            system_prompt=system_prompt,
            context=context,
        )
        
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
    
    return AnalyzeResponse(
        report_id=f"report-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
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
