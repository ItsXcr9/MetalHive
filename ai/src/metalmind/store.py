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
                    report.get("type", "analysis"),
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
