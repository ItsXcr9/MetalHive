// Package store provides database clients for the controller
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/rs/zerolog/log"
)

// ClickHouseClient wraps the ClickHouse connection
type ClickHouseClient struct {
	conn driver.Conn
}

// NewClickHouseClient creates a new ClickHouse client
func NewClickHouseClient(ctx context.Context, dsn string) (*ClickHouseClient, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{dsn},
		Auth: clickhouse.Auth{
			Database: "metalhive",
		},
		Debug: false,
		Debugf: func(format string, v ...interface{}) {
			log.Debug().Msgf(format, v...)
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
		DialTimeout:          30 * time.Second,
		MaxOpenConns:         10,
		MaxIdleConns:         5,
		ConnMaxLifetime:      time.Hour,
		ConnOpenStrategy:     clickhouse.ConnOpenInOrder,
		BlockBufferSize:      10,
	})

	if err != nil {
		return nil, err
	}

	if err := conn.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping ClickHouse: %w", err)
	}

	return &ClickHouseClient{conn: conn}, nil
}

// Close closes the connection
func (c *ClickHouseClient) Close() error {
	return c.conn.Close()
}

// Conn returns the underlying connection
func (c *ClickHouseClient) Conn() driver.Conn {
	return c.conn
}

// InsertMetrics inserts system metrics
func (c *ClickHouseClient) InsertMetrics(ctx context.Context, hostname, metricName string, value float64, labels map[string]string) error {
	query := `
		INSERT INTO metrics (timestamp, node_hostname, metric_name, metric_value, labels)
		VALUES (?, ?, ?, ?, ?)
	`

	return c.conn.Exec(ctx, query, time.Now(), hostname, metricName, value, labels)
}

// InsertContainerMetrics inserts container metrics
func (c *ClickHouseClient) InsertContainerMetrics(ctx context.Context, hostname, containerID, containerName string, cpu, memUsage, memLimit float64, netRx, netTx, diskRead, diskWrite uint64) error {
	query := `
		INSERT INTO container_metrics 
		(timestamp, node_hostname, container_id, container_name, cpu_percent, memory_usage_mb, memory_limit_mb, network_rx_bytes, network_tx_bytes, disk_read_bytes, disk_write_bytes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	return c.conn.Exec(ctx, query, time.Now(), hostname, containerID, containerName, cpu, memUsage, memLimit, netRx, netTx, diskRead, diskWrite)
}

// GetMetrics retrieves metrics for a hostname
func (c *ClickHouseClient) GetMetrics(ctx context.Context, hostname string, metricName string, since time.Time) ([]map[string]interface{}, error) {
	query := `
		SELECT timestamp, metric_value
		FROM metrics
		WHERE node_hostname = ? AND metric_name = ? AND timestamp >= ?
		ORDER BY timestamp DESC
		LIMIT 1000
	`

	rows, err := c.conn.Query(ctx, query, hostname, metricName, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var timestamp time.Time
		var value float64

		if err := rows.Scan(&timestamp, &value); err != nil {
			continue
		}

		results = append(results, map[string]interface{}{
			"timestamp": timestamp,
			"value":     value,
		})
	}

	return results, nil
}

// InsertCommandExecution records a command execution
func (c *ClickHouseClient) InsertCommandExecution(ctx context.Context, id, command, initiatedBy, strategy string, targetNodes []string) error {
	query := `
		INSERT INTO command_executions 
		(id, command, initiated_by, strategy, target_nodes, status)
		VALUES (?, ?, ?, ?, ?, 'running')
	`

	return c.conn.Exec(ctx, query, id, command, initiatedBy, strategy, targetNodes)
}

// InsertCommandResult records a command result from a node
func (c *ClickHouseClient) InsertCommandResult(ctx context.Context, executionID, hostname string, exitCode int, stdout, stderr string, startedAt, completedAt time.Time, durationMs uint32) error {
	query := `
		INSERT INTO command_results 
		(execution_id, node_hostname, exit_code, stdout, stderr, started_at, completed_at, duration_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`

	return c.conn.Exec(ctx, query, executionID, hostname, exitCode, stdout, stderr, startedAt, completedAt, durationMs)
}

// InsertConfigHistory records a config change
func (c *ClickHouseClient) InsertConfigHistory(ctx context.Context, namespace, key, value, user, action string, isSecret bool) error {
	query := `
		INSERT INTO config_history 
		(namespace, key, value, is_secret, action, user)
		VALUES (?, ?, ?, ?, ?, ?)
	`

	return c.conn.Exec(ctx, query, namespace, key, value, isSecret, action, user)
}

// InsertAlert records an alert
func (c *ClickHouseClient) InsertAlert(ctx context.Context, alertType, severity string, hostname, containerID *string, message string) error {
	query := `
		INSERT INTO alerts 
		(alert_type, severity, node_hostname, container_id, message)
		VALUES (?, ?, ?, ?, ?)
	`

	return c.conn.Exec(ctx, query, alertType, severity, hostname, containerID, message)
}
