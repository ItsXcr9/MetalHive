"""Analyzers for MetalMind AI Engine"""

from datetime import datetime
from typing import Any

import structlog

logger = structlog.get_logger()


class AnomalyDetector:
    """Detects anomalies in metrics data"""
    
    def __init__(self):
        self.thresholds = {
            "cpu_usage_percent": {"warning": 80, "critical": 95},
            "memory_usage_percent": {"warning": 85, "critical": 95},
            "disk_usage_percent": {"warning": 80, "critical": 90},
            "container_restart_count": {"warning": 3, "critical": 5},
        }
    
    def detect(self, metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Detect anomalies in metrics data"""
        anomalies = []
        
        for metric in metrics:
            metric_name = metric.get("metric_name", "")
            value = metric.get("metric_value", 0)
            hostname = metric.get("hostname", "unknown")
            timestamp = metric.get("timestamp", datetime.utcnow())
            
            if metric_name in self.thresholds:
                thresholds = self.thresholds[metric_name]
                
                if value >= thresholds.get("critical", float("inf")):
                    anomalies.append({
                        "type": "threshold_breach",
                        "severity": "critical",
                        "metric": metric_name,
                        "value": value,
                        "threshold": thresholds["critical"],
                        "hostname": hostname,
                        "timestamp": timestamp.isoformat() if isinstance(timestamp, datetime) else timestamp,
                        "message": f"{metric_name} is critically high at {value}%",
                    })
                elif value >= thresholds.get("warning", float("inf")):
                    anomalies.append({
                        "type": "threshold_breach",
                        "severity": "warning",
                        "metric": metric_name,
                        "value": value,
                        "threshold": thresholds["warning"],
                        "hostname": hostname,
                        "timestamp": timestamp.isoformat() if isinstance(timestamp, datetime) else timestamp,
                        "message": f"{metric_name} is elevated at {value}%",
                    })
        
        # Detect sudden spikes (simplified)
        self._detect_spikes(metrics, anomalies)
        
        logger.info("Anomaly detection complete", count=len(anomalies))
        return anomalies
    
    def _detect_spikes(self, metrics: list[dict], anomalies: list[dict]) -> None:
        """Detect sudden spikes in metrics"""
        # Group by hostname and metric
        grouped: dict[str, list[float]] = {}
        
        for metric in metrics:
            key = f"{metric.get('hostname')}:{metric.get('metric_name')}"
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(metric.get("metric_value", 0))
        
        # Check for spikes (value > 2x average)
        for key, values in grouped.items():
            if len(values) < 5:
                continue
            
            avg = sum(values[:-1]) / len(values[:-1])
            latest = values[-1]
            
            if avg > 0 and latest > avg * 2:
                hostname, metric_name = key.split(":", 1)
                anomalies.append({
                    "type": "spike",
                    "severity": "warning",
                    "metric": metric_name,
                    "value": latest,
                    "average": avg,
                    "hostname": hostname,
                    "message": f"Sudden spike in {metric_name}: {latest:.1f} (avg: {avg:.1f})",
                })


class TrendAnalyzer:
    """Analyzes trends in metrics data"""
    
    def analyze(self, metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Analyze trends in metrics"""
        trends = []
        
        # Group by hostname and metric
        grouped: dict[str, list[tuple[datetime, float]]] = {}
        
        for metric in metrics:
            key = f"{metric.get('hostname')}:{metric.get('metric_name')}"
            if key not in grouped:
                grouped[key] = []
            
            timestamp = metric.get("timestamp", datetime.utcnow())
            if isinstance(timestamp, str):
                try:
                    timestamp = datetime.fromisoformat(timestamp)
                except ValueError:
                    continue
            
            grouped[key].append((timestamp, metric.get("metric_value", 0)))
        
        # Analyze each group
        for key, values in grouped.items():
            if len(values) < 10:
                continue
            
            hostname, metric_name = key.split(":", 1)
            
            # Sort by timestamp
            values.sort(key=lambda x: x[0])
            
            # Simple linear trend
            trend = self._calculate_trend(values)
            
            if trend["slope"] > 1:  # Increasing trend
                trends.append({
                    "type": "increasing",
                    "metric": metric_name,
                    "hostname": hostname,
                    "slope": trend["slope"],
                    "prediction": trend["prediction"],
                    "message": f"{metric_name} is trending upward on {hostname}",
                })
            elif trend["slope"] < -1:  # Decreasing trend
                trends.append({
                    "type": "decreasing",
                    "metric": metric_name,
                    "hostname": hostname,
                    "slope": trend["slope"],
                    "prediction": trend["prediction"],
                    "message": f"{metric_name} is trending downward on {hostname}",
                })
        
        logger.info("Trend analysis complete", count=len(trends))
        return trends
    
    def _calculate_trend(self, values: list[tuple[datetime, float]]) -> dict[str, Any]:
        """Calculate a simple linear trend"""
        n = len(values)
        if n < 2:
            return {"slope": 0, "prediction": 0}
        
        # Use index as x (simplified)
        x_sum = sum(range(n))
        y_sum = sum(v[1] for v in values)
        xy_sum = sum(i * v[1] for i, v in enumerate(values))
        x2_sum = sum(i * i for i in range(n))
        
        denominator = n * x2_sum - x_sum * x_sum
        if denominator == 0:
            return {"slope": 0, "prediction": values[-1][1]}
        
        slope = (n * xy_sum - x_sum * y_sum) / denominator
        intercept = (y_sum - slope * x_sum) / n
        
        # Predict next value
        prediction = slope * n + intercept
        
        return {
            "slope": slope,
            "intercept": intercept,
            "prediction": prediction,
        }
