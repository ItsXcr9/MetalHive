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

// UpdateCommandExecutionStatus updates the status of a command execution
func (c *ClickHouseClient) UpdateCommandExecutionStatus(ctx context.Context, id, status string, completedAt time.Time) error {
	// ClickHouse doesn't support UPDATE, so we use ALTER TABLE ... UPDATE
	query := `
		ALTER TABLE command_executions 
		UPDATE status = ?, completed_at = ?
		WHERE id = ?
	`
	return c.conn.Exec(ctx, query, status, completedAt, id)
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

// GetCommandExecutions retrieves command execution history with results
func (c *ClickHouseClient) GetCommandExecutions(ctx context.Context, limit int) ([]map[string]interface{}, error) {
	// First get executions
	execQuery := `
		SELECT id, command, initiated_by, strategy, target_nodes, started_at, completed_at, status
		FROM command_executions
		ORDER BY started_at DESC
		LIMIT ?
	`

	execRows, err := c.conn.Query(ctx, execQuery, limit)
	if err != nil {
		return nil, err
	}
	defer execRows.Close()

	var executions []map[string]interface{}
	var executionIDs []string

	for execRows.Next() {
		var id, command, initiatedBy, strategy, status string
		var targetNodes []string
		var startedAt time.Time
		var completedAt *time.Time

		if err := execRows.Scan(&id, &command, &initiatedBy, &strategy, &targetNodes, &startedAt, &completedAt, &status); err != nil {
			continue
		}

		executionIDs = append(executionIDs, id)
		executions = append(executions, map[string]interface{}{
			"id":           id,
			"command":      command,
			"initiated_by": initiatedBy,
			"strategy":     strategy,
			"target_nodes": targetNodes,
			"started_at":   startedAt,
			"completed_at": completedAt,
			"status":       status,
			"results":      []map[string]interface{}{},
		})
	}

	if len(executionIDs) == 0 {
		return executions, nil
	}

	// Now fetch results for these executions
	resultQuery := `
		SELECT execution_id, node_hostname, exit_code, stdout, stderr, duration_ms
		FROM command_results
		WHERE execution_id IN ?
	`

	resultRows, err := c.conn.Query(ctx, resultQuery, executionIDs)
	if err != nil {
		// Return executions without results if query fails
		return executions, nil
	}
	defer resultRows.Close()

	// Build a map of execution_id -> results
	resultsMap := make(map[string][]map[string]interface{})
	for resultRows.Next() {
		var execID, hostname, stdout, stderr string
		var exitCode int32
		var durationMs uint32

		if err := resultRows.Scan(&execID, &hostname, &exitCode, &stdout, &stderr, &durationMs); err != nil {
			continue
		}

		resultsMap[execID] = append(resultsMap[execID], map[string]interface{}{
			"hostname":    hostname,
			"exit_code":   exitCode,
			"stdout":      stdout,
			"stderr":      stderr,
			"duration_ms": durationMs,
		})
	}

	// Attach results to executions
	for i := range executions {
		execID := executions[i]["id"].(string)
		if results, ok := resultsMap[execID]; ok {
			executions[i]["results"] = results
		}
	}

	return executions, nil
}

// GetConfigHistory retrieves configuration change history
func (c *ClickHouseClient) GetConfigHistory(ctx context.Context, namespace string, limit int) ([]map[string]interface{}, error) {
	query := `
		SELECT id, namespace, key, value, is_secret, action, user, timestamp
		FROM config_history
		WHERE namespace = ? OR ? = ''
		ORDER BY timestamp DESC
		LIMIT ?
	`

	rows, err := c.conn.Query(ctx, query, namespace, namespace, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id, ns, key, value, action, user string
		var isSecret bool
		var timestamp time.Time

		if err := rows.Scan(&id, &ns, &key, &value, &isSecret, &action, &user, &timestamp); err != nil {
			continue
		}

		// Mask secret values
		displayValue := value
		if isSecret {
			displayValue = "**********"
		}

		results = append(results, map[string]interface{}{
			"id":        id,
			"namespace": ns,
			"key":       key,
			"value":     displayValue,
			"is_secret": isSecret,
			"action":    action,
			"user":      user,
			"timestamp": timestamp,
		})
	}

	return results, nil
}

// GetAlerts retrieves alerts from ClickHouse
func (c *ClickHouseClient) GetAlerts(ctx context.Context, resolved bool, limit int) ([]map[string]interface{}, error) {
	query := `
		SELECT id, alert_type, severity, node_hostname, container_id, message, resolved, resolved_at, created_at
		FROM alerts
		WHERE resolved = ?
		ORDER BY created_at DESC
		LIMIT ?
	`

	rows, err := c.conn.Query(ctx, query, resolved, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id, alertType, severity, message string
		var hostname, containerID *string
		var isResolved bool
		var resolvedAt *time.Time
		var createdAt time.Time

		if err := rows.Scan(&id, &alertType, &severity, &hostname, &containerID, &message, &isResolved, &resolvedAt, &createdAt); err != nil {
			continue
		}

		results = append(results, map[string]interface{}{
			"id":           id,
			"alert_type":   alertType,
			"severity":     severity,
			"hostname":     hostname,
			"container_id": containerID,
			"message":      message,
			"resolved":     isResolved,
			"resolved_at":  resolvedAt,
			"created_at":   createdAt,
		})
	}

	return results, nil
}

// InsertSystemUpdate records a system update
func (c *ClickHouseClient) InsertSystemUpdate(ctx context.Context, id, updateType, strategy, initiatedBy string, targetNodes []string) error {
	query := `
		INSERT INTO system_updates 
		(id, update_type, strategy, target_nodes, initiated_by, status)
		VALUES (?, ?, ?, ?, ?, 'running')
	`

	return c.conn.Exec(ctx, query, id, updateType, strategy, targetNodes, initiatedBy)
}

// UpdateSystemUpdateStatus updates the status of a system update
func (c *ClickHouseClient) UpdateSystemUpdateStatus(ctx context.Context, id, status string, successCount, failureCount uint16) error {
	query := `
		ALTER TABLE system_updates UPDATE 
		status = ?, completed_at = now64(3), success_count = ?, failure_count = ?
		WHERE id = ?
	`

	return c.conn.Exec(ctx, query, status, successCount, failureCount, id)
}

// GetSystemUpdates retrieves system update history
func (c *ClickHouseClient) GetSystemUpdates(ctx context.Context, limit int) ([]map[string]interface{}, error) {
	query := `
		SELECT id, update_type, strategy, target_nodes, initiated_by, started_at, completed_at, status, success_count, failure_count
		FROM system_updates
		ORDER BY started_at DESC
		LIMIT ?
	`

	rows, err := c.conn.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id, updateType, strategy, initiatedBy, status string
		var targetNodes []string
		var startedAt time.Time
		var completedAt *time.Time
		var successCount, failureCount uint16

		if err := rows.Scan(&id, &updateType, &strategy, &targetNodes, &initiatedBy, &startedAt, &completedAt, &status, &successCount, &failureCount); err != nil {
			continue
		}

		results = append(results, map[string]interface{}{
			"id":            id,
			"update_type":   updateType,
			"strategy":      strategy,
			"target_nodes":  targetNodes,
			"initiated_by":  initiatedBy,
			"started_at":    startedAt,
			"completed_at":  completedAt,
			"status":        status,
			"success_count": successCount,
			"failure_count": failureCount,
		})
	}

	return results, nil
}

// InsertAIReport records an AI analysis report
func (c *ClickHouseClient) InsertAIReport(ctx context.Context, reportType, severity, title, summary, details string, affectedNodes, affectedContainers, recommendations []string, autoRemediation bool) error {
	query := `
		INSERT INTO ai_reports 
		(report_type, severity, title, summary, details, affected_nodes, affected_containers, recommendations, auto_remediation_applied)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	return c.conn.Exec(ctx, query, reportType, severity, title, summary, details, affectedNodes, affectedContainers, recommendations, autoRemediation)
}

// GetAIReports retrieves AI reports from ClickHouse
func (c *ClickHouseClient) GetAIReports(ctx context.Context, limit int) ([]map[string]interface{}, error) {
	query := `
		SELECT id, report_type, severity, title, summary, details, affected_nodes, affected_containers, recommendations, auto_remediation_applied, created_at
		FROM ai_reports
		ORDER BY created_at DESC
		LIMIT ?
	`

	rows, err := c.conn.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id, reportType, severity, title, summary, details string
		var affectedNodes, affectedContainers, recommendations []string
		var autoRemediation bool
		var createdAt time.Time

		if err := rows.Scan(&id, &reportType, &severity, &title, &summary, &details, &affectedNodes, &affectedContainers, &recommendations, &autoRemediation, &createdAt); err != nil {
			continue
		}

		results = append(results, map[string]interface{}{
			"id":                       id,
			"report_type":              reportType,
			"severity":                 severity,
			"title":                    title,
			"summary":                  summary,
			"details":                  details,
			"affected_nodes":           affectedNodes,
			"affected_containers":      affectedContainers,
			"recommendations":          recommendations,
			"auto_remediation_applied": autoRemediation,
			"created_at":               createdAt,
		})
	}

	return results, nil
}

