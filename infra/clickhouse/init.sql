-- =============================================================================
-- MetalHive ClickHouse Schema
-- =============================================================================
-- This file initializes the database schema for MetalHive
-- =============================================================================

-- Create database
CREATE DATABASE IF NOT EXISTS metalhive;

-- =============================================================================
-- Nodes Table - Registered nodes in the fleet
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.nodes
(
    id UUID DEFAULT generateUUIDv4(),
    hostname String,
    ip_address String,
    labels Map(String, String),
    os_name String,
    os_version String,
    docker_version String,
    cpu_cores UInt16,
    memory_total_mb UInt32,
    disk_total_gb UInt32,
    status Enum8('online' = 1, 'offline' = 2, 'draining' = 3, 'cordoned' = 4),
    last_heartbeat DateTime64(3),
    created_at DateTime64(3) DEFAULT now64(3),
    updated_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (hostname)
PRIMARY KEY (hostname);

-- =============================================================================
-- Containers Table - Container inventory across all nodes
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.containers
(
    id String,
    node_hostname String,
    name String,
    image String,
    image_tag String,
    status Enum8('running' = 1, 'stopped' = 2, 'paused' = 3, 'restarting' = 4, 'dead' = 5),
    health Enum8('healthy' = 1, 'unhealthy' = 2, 'starting' = 3, 'none' = 4),
    ports Array(String),
    labels Map(String, String),
    created_at DateTime64(3),
    started_at DateTime64(3),
    updated_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (node_hostname, id)
PRIMARY KEY (node_hostname, id);

-- =============================================================================
-- Metrics Table - Time-series metrics from nodes
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.metrics
(
    timestamp DateTime64(3),
    node_hostname String,
    metric_name String,
    metric_value Float64,
    labels Map(String, String),
    
    INDEX idx_metric_name metric_name TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (node_hostname, metric_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

-- =============================================================================
-- Container Metrics Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.container_metrics
(
    timestamp DateTime64(3),
    node_hostname String,
    container_id String,
    container_name String,
    cpu_percent Float64,
    memory_usage_mb Float64,
    memory_limit_mb Float64,
    network_rx_bytes UInt64,
    network_tx_bytes UInt64,
    disk_read_bytes UInt64,
    disk_write_bytes UInt64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (node_hostname, container_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 7 DAY;

-- =============================================================================
-- Command Executions Table (HiveShell history)
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.command_executions
(
    id UUID DEFAULT generateUUIDv4(),
    command String,
    initiated_by String,
    strategy Enum8('parallel' = 1, 'serial' = 2, 'rolling' = 3),
    target_nodes Array(String),
    started_at DateTime64(3) DEFAULT now64(3),
    completed_at Nullable(DateTime64(3)),
    status Enum8('pending' = 1, 'running' = 2, 'completed' = 3, 'failed' = 4, 'cancelled' = 5)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (started_at, id);

-- =============================================================================
-- Command Results Table - Per-node execution results
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.command_results
(
    execution_id UUID,
    node_hostname String,
    exit_code Int16,
    stdout String,
    stderr String,
    started_at DateTime64(3),
    completed_at DateTime64(3),
    duration_ms UInt32
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (execution_id, node_hostname);

-- =============================================================================
-- Config History Table (HiveVault audit log)
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.config_history
(
    id UUID DEFAULT generateUUIDv4(),
    namespace String,
    key String,
    value String,
    is_secret Bool DEFAULT false,
    action Enum8('set' = 1, 'delete' = 2, 'rollback' = 3),
    user String,
    timestamp DateTime64(3) DEFAULT now64(3),
    
    INDEX idx_namespace namespace TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (namespace, key, timestamp);

-- =============================================================================
-- AI Analysis Reports Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.ai_reports
(
    id UUID DEFAULT generateUUIDv4(),
    report_type Enum8('anomaly' = 1, 'prediction' = 2, 'recommendation' = 3, 'incident' = 4),
    severity Enum8('info' = 1, 'warning' = 2, 'critical' = 3),
    title String,
    summary String,
    details String,
    affected_nodes Array(String),
    affected_containers Array(String),
    recommendations Array(String),
    auto_remediation_applied Bool DEFAULT false,
    created_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (created_at, id);

-- =============================================================================
-- Alerts Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.alerts
(
    id UUID DEFAULT generateUUIDv4(),
    alert_type String,
    severity Enum8('info' = 1, 'warning' = 2, 'critical' = 3),
    node_hostname Nullable(String),
    container_id Nullable(String),
    message String,
    resolved Bool DEFAULT false,
    resolved_at Nullable(DateTime64(3)),
    created_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (created_at, id);

-- =============================================================================
-- System Updates History Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS metalhive.system_updates
(
    id UUID DEFAULT generateUUIDv4(),
    update_type Enum8('os' = 1, 'docker' = 2, 'security' = 3, 'kernel' = 4),
    strategy Enum8('parallel' = 1, 'rolling' = 2, 'serial' = 3),
    target_nodes Array(String),
    initiated_by String,
    started_at DateTime64(3) DEFAULT now64(3),
    completed_at Nullable(DateTime64(3)),
    status Enum8('pending' = 1, 'running' = 2, 'completed' = 3, 'failed' = 4, 'cancelled' = 5),
    success_count UInt16 DEFAULT 0,
    failure_count UInt16 DEFAULT 0
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (started_at, id);

-- =============================================================================
-- Materialized Views for Dashboards
-- =============================================================================

-- Hourly metrics aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS metalhive.metrics_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (node_hostname, metric_name, hour)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    node_hostname,
    metric_name,
    avg(metric_value) AS avg_value,
    max(metric_value) AS max_value,
    min(metric_value) AS min_value,
    count() AS sample_count
FROM metalhive.metrics
GROUP BY hour, node_hostname, metric_name;

-- Container health summary
CREATE MATERIALIZED VIEW IF NOT EXISTS metalhive.container_health_summary
ENGINE = SummingMergeTree()
ORDER BY (node_hostname, updated_at)
AS SELECT
    node_hostname,
    countIf(status = 'running') AS running_count,
    countIf(status = 'stopped') AS stopped_count,
    countIf(health = 'unhealthy') AS unhealthy_count,
    max(updated_at) AS updated_at
FROM metalhive.containers
GROUP BY node_hostname;
