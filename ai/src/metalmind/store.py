"""ClickHouse store for MetalMind"""

from datetime import datetime, timedelta
from typing import Any

import structlog

logger = structlog.get_logger()


class ClickHouseStore:
    """ClickHouse database client for MetalMind"""
    
    def __init__(self, url: str):
        self.url = url
        self._client = None
        
        try:
            import clickhouse_connect
            self._client = clickhouse_connect.get_client(host=url.replace("http://", "").split(":")[0])
            logger.info("ClickHouse client initialized", url=url)
        except ImportError:
            logger.warning("clickhouse-connect not installed")
        except Exception as e:
            logger.error("Failed to connect to ClickHouse", error=str(e))
    
    async def get_metrics(
        self,
        hostname: str | None = None,
        since: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Get metrics from ClickHouse"""
        if not self._client:
            return []
        
        since = since or (datetime.utcnow() - timedelta(hours=24))
        
        query = """
            SELECT timestamp, node_hostname, metric_name, metric_value
            FROM metalhive.metrics
            WHERE timestamp >= %(since)s
        """
        
        params = {"since": since}
        
        if hostname:
            query += " AND node_hostname = %(hostname)s"
            params["hostname"] = hostname
        
        query += " ORDER BY timestamp DESC LIMIT 10000"
        
        try:
            result = self._client.query(query, parameters=params)
            return [
                {
                    "timestamp": row[0],
                    "hostname": row[1],
                    "metric_name": row[2],
                    "metric_value": row[3],
                }
                for row in result.result_rows
            ]
        except Exception as e:
            logger.error("Failed to query metrics", error=str(e))
            return []
    
    async def get_recent_alerts(self, hours: int = 24) -> list[dict[str, Any]]:
        """Get recent alerts"""
        if not self._client:
            return []
        
        since = datetime.utcnow() - timedelta(hours=hours)
        
        query = """
            SELECT id, alert_type, severity, node_hostname, message, created_at
            FROM metalhive.alerts
            WHERE created_at >= %(since)s
            ORDER BY created_at DESC
            LIMIT 100
        """
        
        try:
            result = self._client.query(query, parameters={"since": since})
            return [
                {
                    "id": str(row[0]),
                    "type": row[1],
                    "severity": row[2],
                    "hostname": row[3],
                    "message": row[4],
                    "created_at": row[5].isoformat() if row[5] else None,
                }
                for row in result.result_rows
            ]
        except Exception as e:
            logger.error("Failed to query alerts", error=str(e))
            return []
    
    async def get_node_health_summary(self) -> dict[str, Any]:
        """Get summary of node health"""
        if not self._client:
            return {"total": 0, "healthy": 0, "warning": 0, "critical": 0}
        
        query = """
            SELECT 
                count() as total,
                countIf(status = 'online') as online,
                countIf(status = 'offline') as offline
            FROM metalhive.nodes
        """
        
        try:
            result = self._client.query(query)
            if result.result_rows:
                row = result.result_rows[0]
                return {
                    "total": row[0],
                    "online": row[1],
                    "offline": row[2],
                }
            return {"total": 0, "online": 0, "offline": 0}
        except Exception as e:
            logger.error("Failed to query node health", error=str(e))
            return {"total": 0, "online": 0, "offline": 0}
    
    async def save_report(self, report: dict[str, Any]) -> str:
        """Save an AI analysis report"""
        if not self._client:
            return ""
        
        query = """
            INSERT INTO metalhive.ai_reports 
            (report_type, severity, title, summary, details, affected_nodes, recommendations)
            VALUES
        """
        
        try:
            self._client.insert(
                "metalhive.ai_reports",
                [[
                    report.get("type", "recommendation"),
                    report.get("severity", "info"),
                    report.get("title", "AI Analysis"),
                    report.get("summary", ""),
                    report.get("details", ""),
                    report.get("affected_nodes", []),
                    report.get("recommendations", []),
                ]],
                column_names=[
                    "report_type", "severity", "title", "summary",
                    "details", "affected_nodes", "recommendations"
                ],
            )
            return report.get("id", "")
        except Exception as e:
            logger.error("Failed to save report", error=str(e))
            return ""

    async def get_reports(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get AI analysis reports from ClickHouse"""
        if not self._client:
            return []
        
        query = """
            SELECT id, report_type, severity, title, summary, details, 
                   affected_nodes, recommendations, auto_remediation_applied, created_at
            FROM metalhive.ai_reports
            ORDER BY created_at DESC
            LIMIT %(limit)s
        """
        
        try:
            result = self._client.query(query, parameters={"limit": limit})
            return [
                {
                    "id": str(row[0]),
                    "report_type": row[1],
                    "severity": row[2],
                    "title": row[3],
                    "summary": row[4],
                    "details": row[5],
                    "affected_nodes": list(row[6]) if row[6] else [],
                    "recommendations": list(row[7]) if row[7] else [],
                    "auto_remediation_applied": row[8],
                    "created_at": row[9].isoformat() if row[9] else None,
                }
                for row in result.result_rows
            ]
        except Exception as e:
            logger.error("Failed to get reports", error=str(e))
            return []

    async def get_unhealthy_containers(self) -> list[dict[str, Any]]:
        """Get containers with health issues"""
        # This queries the controller API for container status
        import httpx
        from metalmind.config import settings
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{settings.controller_url}/api/v1/containers")
                if response.status_code == 200:
                    data = response.json()
                    containers = data.get("containers", [])
                    # Filter unhealthy containers - use lowercase 'state' and check 'status' string
                    unhealthy = [
                        {
                            "name": c.get("name"),
                            "state": c.get("state"),
                            "status": c.get("status", "")[:60],
                            "image": c.get("image", "")[:40],
                        }
                        for c in containers 
                        if c.get("state") not in ("running", "created")
                        or "unhealthy" in c.get("status", "").lower()
                    ]
                    return unhealthy
        except Exception as e:
            logger.error("Failed to get unhealthy containers", error=str(e))
        return []

    async def get_container_logs(self, hostname: str, container_id: str, lines: int = 50) -> str:
        """Get recent logs from a container via controller API"""
        import httpx
        from metalmind.config import settings
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{settings.controller_url}/api/v1/containers/{hostname}/{container_id}/logs",
                    params={"tail": lines}
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("logs", "")
        except Exception as e:
            logger.error("Failed to get container logs", error=str(e), container_id=container_id)
        return ""

    async def get_system_health_summary(self) -> dict[str, Any]:
        """Get comprehensive system health for AI context"""
        import httpx
        from metalmind.config import settings
        
        summary = {
            "nodes": {"total": 0, "online": 0, "offline": 0, "list": []},
            "containers": {"total": 0, "running": 0, "stopped": 0, "unhealthy": 0},
            "container_issues": [],
            "recent_containers": [],
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Get nodes - API returns {"nodes": [{"hostname": "x", "online": true, ...}]}
                nodes_resp = await client.get(f"{settings.controller_url}/api/v1/nodes")
                if nodes_resp.status_code == 200:
                    nodes = nodes_resp.json().get("nodes", [])
                    summary["nodes"]["total"] = len(nodes)
                    summary["nodes"]["online"] = len([n for n in nodes if n.get("online") == True])
                    summary["nodes"]["offline"] = len([n for n in nodes if n.get("online") != True])
                    summary["nodes"]["list"] = [
                        {"hostname": n.get("hostname"), "online": n.get("online"), "agent_id": n.get("agent_id")}
                        for n in nodes[:5]
                    ]
                
                # Get containers - API returns {"containers": [{"name": "x", "state": "running", "status": "Up 5 days (healthy)"}]}
                containers_resp = await client.get(f"{settings.controller_url}/api/v1/containers")
                if containers_resp.status_code == 200:
                    containers = containers_resp.json().get("containers", [])
                    summary["containers"]["total"] = len(containers)
                    summary["containers"]["running"] = len([c for c in containers if c.get("state") == "running"])
                    summary["containers"]["stopped"] = len([c for c in containers if c.get("state") != "running"])
                    
                    # Check for unhealthy - look for "unhealthy" in status string
                    unhealthy = [
                        c for c in containers 
                        if "unhealthy" in c.get("status", "").lower() 
                        or c.get("state") not in ("running", "created")
                    ]
                    
                    # Separate truly problematic containers
                    stopped = [c for c in containers if c.get("state") not in ("running", "created")]
                    
                    summary["containers"]["unhealthy"] = len([c for c in containers if "unhealthy" in c.get("status", "").lower()])
                    summary["container_issues"] = [
                        {
                            "name": c.get("name", c.get("id", "unknown")[:12]),
                            "state": c.get("state"),
                            "status": c.get("status", "")[:50],  # Truncate
                            "image": c.get("image", "")[:40],
                        }
                        for c in unhealthy[:10]
                    ]
                    
                    # Add some recent running containers for context
                    running = [c for c in containers if c.get("state") == "running"][:5]
                    summary["recent_containers"] = [
                        {"name": c.get("name"), "status": c.get("status", "")[:40]}
                        for c in running
                    ]
        except Exception as e:
            logger.error("Failed to get system health summary", error=str(e))
        
        return summary

    async def get_ancientreport_summary(self) -> dict[str, Any]:
        """Get security analysis data from AncientReport V3 API"""
        import httpx
        from metalmind.config import settings
        
        summary = {
            "available": False,
            "security_dashboard": {},
            "active_threats": [],
            "recent_alerts": [],
            "latest_reports": [],
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Get security dashboard
                try:
                    dashboard_resp = await client.get(f"{settings.ancientreport_api_url}/api/v3/security/dashboard")
                    if dashboard_resp.status_code == 200:
                        data = dashboard_resp.json()
                        summary["available"] = True
                        summary["security_dashboard"] = {
                            "overall_score": data.get("overall_score"),
                            "hosts_scanned": data.get("hosts_scanned"),
                            "total_open_ports": data.get("total_open_ports"),
                            "risky_ports_count": data.get("risky_ports_count"),
                            "active_threats": data.get("active_threats"),
                        }
                except Exception:
                    pass
                
                # Get active threats
                try:
                    threats_resp = await client.get(f"{settings.ancientreport_api_url}/api/v3/security/threats/active")
                    if threats_resp.status_code == 200:
                        data = threats_resp.json()
                        summary["available"] = True
                        summary["active_threats"] = data[:5] if isinstance(data, list) else []
                except Exception:
                    pass
                
                # Get recent alerts
                try:
                    alerts_resp = await client.get(f"{settings.ancientreport_api_url}/api/v3/alerts/history")
                    if alerts_resp.status_code == 200:
                        data = alerts_resp.json()
                        summary["available"] = True
                        summary["recent_alerts"] = data[:5] if isinstance(data, list) else data.get("alerts", [])[:5]
                except Exception:
                    pass
                
                # Get latest analysis reports
                try:
                    reports_resp = await client.get(f"{settings.ancientreport_api_url}/api/reports/latest")
                    if reports_resp.status_code == 200:
                        data = reports_resp.json()
                        summary["available"] = True
                        if isinstance(data, dict):
                            summary["latest_reports"] = [data]
                        elif isinstance(data, list):
                            summary["latest_reports"] = data[:3]
                except Exception:
                    pass
                    
        except Exception as e:
            logger.debug("AncientReport API not available", error=str(e))
        
        return summary

    async def get_mithrillog_summary(self) -> dict[str, Any]:
        """Get log monitoring data from MithrilLog API"""
        import httpx
        from metalmind.config import settings
        
        summary = {
            "available": False,
            "hourly_summary": {},
            "error_insights": [],
            "log_stats": {},
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Get hourly summaries
                try:
                    hourly_resp = await client.get(f"{settings.mithrillog_api_url}/summaries/hourly")
                    if hourly_resp.status_code == 200:
                        data = hourly_resp.json()
                        summary["available"] = True
                        if isinstance(data, list) and len(data) > 0:
                            latest = data[0]
                            summary["hourly_summary"] = {
                                "total_logs": latest.get("stats", {}).get("total_logs", 0),
                                "severity_counts": latest.get("stats", {}).get("by_severity", {}),
                                "period": latest.get("period", {}),
                            }
                except Exception:
                    pass
                
                # Get error insights
                try:
                    errors_resp = await client.get(f"{settings.mithrillog_api_url}/insights/errors")
                    if errors_resp.status_code == 200:
                        data = errors_resp.json()
                        summary["available"] = True
                        if isinstance(data, list):
                            summary["error_insights"] = [
                                {
                                    "severity": e.get("severity"),
                                    "message": e.get("message", "")[:100],
                                    "occurrences": e.get("error_total", e.get("occurrences", 0)),
                                }
                                for e in data[:5]
                            ]
                except Exception:
                    pass
                
                # Get log stats/counts
                try:
                    stats_resp = await client.get(f"{settings.mithrillog_api_url}/api/stats/counts")
                    if stats_resp.status_code == 200:
                        data = stats_resp.json()
                        summary["available"] = True
                        summary["log_stats"] = data
                except Exception:
                    pass
                    
        except Exception as e:
            logger.debug("MithrilLog API not available", error=str(e))
        
        return summary
