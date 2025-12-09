// Package api provides HTTP API handlers for the controller
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"


	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/xcr9/metalhive/controller/internal/store"
	"github.com/xcr9/metalhive/controller/internal/vault"
)

// Handler contains all API dependencies
type Handler struct {
	nats       *nats.Conn
	clickhouse *store.ClickHouseClient
	redis      *redis.Client
	vault      *vault.HiveVault
}

// NewHandler creates a new API handler
func NewHandler(nc *nats.Conn, ch *store.ClickHouseClient, rdb *redis.Client, v *vault.HiveVault) *Handler {
	return &Handler{
		nats:       nc,
		clickhouse: ch,
		redis:      rdb,
		vault:      v,
	}
}

// getRegisteredNodeHostnames returns the list of registered node hostnames
func (h *Handler) getRegisteredNodeHostnames() []string {
	ctx := context.Background()
	keys, err := h.redis.Keys(ctx, "node:*").Result()
	if err != nil {
		return []string{}
	}
	
	hostnames := make([]string, 0, len(keys))
	for _, key := range keys {
		// key format is "node:hostname"
		if len(key) > 5 {
			hostnames = append(hostnames, key[5:])
		}
	}
	return hostnames
}

// SetupRoutes configures all API routes
func SetupRoutes(app *fiber.App, h *Handler) {
	// Health check
	app.Get("/health", h.HealthCheck)

	// API v1
	api := app.Group("/api")
	v1 := api.Group("/v1")

	// Nodes
	nodes := v1.Group("/nodes")
	nodes.Get("/", h.ListNodes)
	nodes.Get("/:hostname", h.GetNode)
	nodes.Post("/", h.RegisterNode)
	nodes.Post("/deploy", h.DeployAgent)       // SSH deploy agent to new server
	nodes.Post("/test-ssh", h.TestSSHConnection) // Test SSH connection
	nodes.Delete("/:hostname", h.RemoveNode)
	nodes.Put("/:hostname", h.RenameNode) // Rename a node
	nodes.Post("/:hostname/drain", h.DrainNode)
	nodes.Post("/:hostname/cordon", h.CordonNode)
	nodes.Post("/:hostname/uncordon", h.UncordonNode)

	// Containers
	containers := v1.Group("/containers")
	containers.Get("/", h.ListContainers)
	containers.Get("/:id", h.GetContainer)
	containers.Post("/:id/start", h.StartContainer)
	containers.Post("/:id/stop", h.StopContainer)
	containers.Post("/:id/restart", h.RestartContainer)
	containers.Delete("/:id", h.RemoveContainer)
	containers.Get("/:id/logs", h.GetContainerLogs)
	// WebSocket for shell - needs upgrade middleware
	containers.Use("/:id/exec", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	containers.Get("/:id/exec", websocket.New(h.ContainerExec))

	// Stacks - Docker Compose deployment
	stacks := v1.Group("/stacks")
	stacks.Post("/deploy", h.DeployStack)
	stacks.Get("/", h.ListStacks)


	// HiveShell - Remote Execution
	exec := v1.Group("/exec")
	exec.Post("/run", h.RunCommand)
	exec.Get("/history", h.GetExecutionHistory)
	exec.Get("/:id", h.GetExecutionStatus)
	exec.Post("/:id/cancel", h.CancelExecution)
	// WebSocket for streaming output
	exec.Use("/:id/stream", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	exec.Get("/:id/stream", websocket.New(h.StreamExecOutput))

	// HiveVault - Configuration
	config := v1.Group("/config")
	config.Get("/*", h.GetConfig)
	config.Post("/", h.SetConfig)
	config.Delete("/*", h.DeleteConfig)
	config.Get("/history/*", h.GetConfigHistory)
	config.Post("/rollback/*", h.RollbackConfig)

	// Metrics
	metrics := v1.Group("/metrics")
	metrics.Get("/system/:hostname", h.GetSystemMetrics)
	metrics.Get("/containers/:hostname", h.GetContainerMetrics)

	// AI / MetalMind (proxy to AI service)
	ai := v1.Group("/ai")
	ai.Post("/ask", h.AskAI)
	ai.Get("/reports", h.GetAIReports)
	ai.Post("/analyze", h.TriggerAnalysis)

	// System Updates
	system := v1.Group("/system")
	system.Post("/update", h.TriggerSystemUpdate)
	system.Get("/updates", h.GetUpdateHistory)

	// Xcr9 Products Management
	products := v1.Group("/products")
	products.Get("/", h.ListProducts)
	products.Get("/:name", h.GetProduct)
	products.Post("/:name/install", h.InstallProduct)
	products.Post("/:name/uninstall", h.UninstallProduct)
	products.Post("/:name/start", h.StartProduct)
	products.Post("/:name/stop", h.StopProduct)
	products.Post("/:name/restart", h.RestartProduct)
	products.Get("/:name/metrics/*", h.GetProductMetrics)
	products.Get("/ancientreport/dashboard", h.GetAncientReportDashboard)

	// Agent heartbeat endpoint
	api.Post("/agents/heartbeat", h.AgentHeartbeat)

	// WebSocket for real-time updates
	app.Get("/ws", websocket.New(h.WebSocketHandler))
}

// HealthCheck returns the health status
func (h *Handler) HealthCheck(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":    "healthy",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"version":   "0.1.0",
	})
}

// AgentHeartbeat handles agent heartbeat messages
func (h *Handler) AgentHeartbeat(c *fiber.Ctx) error {
	var payload struct {
		AgentID   string            `json:"agent_id"`
		Hostname  string            `json:"hostname"`
		Labels    map[string]string `json:"labels"`
		Timestamp string            `json:"timestamp"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	// Store heartbeat in Redis
	ctx := c.Context()
	key := "metalhive:nodes:" + payload.Hostname
	
	data, _ := json.Marshal(payload)
	h.redis.Set(ctx, key, data, 60*time.Second)
	h.redis.SAdd(ctx, "metalhive:nodes", payload.Hostname)

	log.Debug().Str("hostname", payload.Hostname).Msg("Agent heartbeat received")

	return c.JSON(fiber.Map{"status": "ok"})
}

// ListNodes returns all registered nodes
func (h *Handler) ListNodes(c *fiber.Ctx) error {
	ctx := c.Context()
	
	// Get all node hostnames from Redis set
	hostnames, err := h.redis.SMembers(ctx, "metalhive:nodes").Result()
	if err != nil {
		hostnames = []string{}
	}

	nodes := make([]map[string]interface{}, 0, len(hostnames))
	for _, hostname := range hostnames {
		key := "metalhive:nodes:" + hostname
		data, err := h.redis.Get(ctx, key).Bytes()
		if err != nil {
			continue
		}

		var node map[string]interface{}
		if err := json.Unmarshal(data, &node); err != nil {
			continue
		}

		// Check if node is online (heartbeat within last 30s)
		node["online"] = true // Simplified - would check timestamp in real impl
		nodes = append(nodes, node)
	}

	// Auto-detect local node if no nodes registered
	if len(nodes) == 0 {
		localNode := h.detectLocalNode()
		if localNode != nil {
			nodes = append(nodes, localNode)
		}
	}

	return c.JSON(fiber.Map{
		"nodes": nodes,
		"total": len(nodes),
	})
}

// detectLocalNode detects this node using private IP addresses
func (h *Handler) detectLocalNode() map[string]interface{} {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "controller-node"
	}

	// Get network interfaces and find private IPs
	privateIP := ""
	interfaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range interfaces {
			// Skip loopback and down interfaces
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}

			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}

			for _, addr := range addrs {
				var ip net.IP
				switch v := addr.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}

				// Skip IPv6 and check if private
				if ip == nil || ip.To4() == nil {
					continue
				}

				if isPrivateIP(ip) {
					privateIP = ip.String()
					break
				}
			}

			if privateIP != "" {
				break
			}
		}
	}

	// If no private IP found, use a default indicator
	if privateIP == "" {
		privateIP = "127.0.0.1"
	}

	return map[string]interface{}{
		"hostname":   hostname,
		"ip":         privateIP,
		"status":     "online",
		"online":     true,
		"role":       "controller",
		"containers": 0,
		"labels": map[string]string{
			"role":         "controller",
			"auto-detected": "true",
		},
	}
}

// isPrivateIP checks if an IP is in private ranges (RFC 1918)
func isPrivateIP(ip net.IP) bool {
	// Convert to 4-byte IPv4 representation
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	
	// 10.0.0.0/8
	if ip4[0] == 10 {
		return true
	}
	// 172.16.0.0/12
	if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
		return true
	}
	// 192.168.0.0/16
	if ip4[0] == 192 && ip4[1] == 168 {
		return true
	}
	return false
}

// GetNode returns details for a specific node
func (h *Handler) GetNode(c *fiber.Ctx) error {
	hostname := c.Params("hostname")
	ctx := c.Context()

	key := "metalhive:nodes:" + hostname
	data, err := h.redis.Get(ctx, key).Bytes()
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Node not found"})
	}

	var node map[string]interface{}
	if err := json.Unmarshal(data, &node); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to parse node data"})
	}

	return c.JSON(node)
}

// RegisterNode manually registers a node
func (h *Handler) RegisterNode(c *fiber.Ctx) error {
	var payload struct {
		Hostname string            `json:"hostname"`
		IP       string            `json:"ip"`
		Labels   map[string]string `json:"labels"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	// Store in Redis
	ctx := c.Context()
	data, _ := json.Marshal(payload)
	h.redis.Set(ctx, "metalhive:nodes:"+payload.Hostname, data, 0)
	h.redis.SAdd(ctx, "metalhive:nodes", payload.Hostname)

	return c.Status(201).JSON(fiber.Map{
		"message":  "Node registered",
		"hostname": payload.Hostname,
	})
}

// RemoveNode removes a node from the fleet
func (h *Handler) RemoveNode(c *fiber.Ctx) error {
	hostname := c.Params("hostname")
	ctx := c.Context()

	h.redis.Del(ctx, "metalhive:nodes:"+hostname)
	h.redis.SRem(ctx, "metalhive:nodes", hostname)

	return c.JSON(fiber.Map{"message": "Node removed", "hostname": hostname})
}

// RenameNode updates a node's display name
func (h *Handler) RenameNode(c *fiber.Ctx) error {
	hostname := c.Params("hostname")
	ctx := c.Context()

	var payload struct {
		DisplayName string            `json:"display_name"`
		Labels      map[string]string `json:"labels"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	if payload.DisplayName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "display_name is required"})
	}

	// Get existing node data
	key := "metalhive:nodes:" + hostname
	data, err := h.redis.Get(ctx, key).Bytes()
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Node not found"})
	}

	var node map[string]interface{}
	if err := json.Unmarshal(data, &node); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to parse node data"})
	}

	// Update display name
	node["display_name"] = payload.DisplayName
	
	// Update labels if provided
	if len(payload.Labels) > 0 {
		node["labels"] = payload.Labels
	}

	// Save back to Redis
	updatedData, _ := json.Marshal(node)
	h.redis.Set(ctx, key, updatedData, 0)

	log.Info().
		Str("hostname", hostname).
		Str("display_name", payload.DisplayName).
		Msg("Node renamed")

	return c.JSON(fiber.Map{
		"message":      "Node renamed",
		"hostname":     hostname,
		"display_name": payload.DisplayName,
	})
}

// DrainNode marks a node as draining
func (h *Handler) DrainNode(c *fiber.Ctx) error {
	hostname := c.Params("hostname")
	// TODO: Implement drain logic
	return c.JSON(fiber.Map{"message": "Node draining", "hostname": hostname})
}

// CordonNode marks a node as unschedulable
func (h *Handler) CordonNode(c *fiber.Ctx) error {
	hostname := c.Params("hostname")
	// TODO: Implement cordon logic
	return c.JSON(fiber.Map{"message": "Node cordoned", "hostname": hostname})
}

// UncordonNode marks a node as schedulable
func (h *Handler) UncordonNode(c *fiber.Ctx) error {
	hostname := c.Params("hostname")
	// TODO: Implement uncordon logic
	return c.JSON(fiber.Map{"message": "Node uncordoned", "hostname": hostname})
}

// ListContainers returns all containers from the Docker host
func (h *Handler) ListContainers(c *fiber.Ctx) error {
	// Query Docker via Unix socket
	containers, err := getDockerContainers()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to get Docker containers")
		return c.JSON(fiber.Map{
			"containers": []interface{}{},
			"total":      0,
			"error":      err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"containers": containers,
		"total":      len(containers),
	})
}

// GetContainer returns details for a specific container
func (h *Handler) GetContainer(c *fiber.Ctx) error {
	id := c.Params("id")
	// TODO: Get container details
	return c.JSON(fiber.Map{"id": id})
}

// StartContainer starts a container via Docker API
func (h *Handler) StartContainer(c *fiber.Ctx) error {
	id := c.Params("id")
	
	err := dockerAction(id, "start", "POST")
	if err != nil {
		log.Error().Err(err).Str("container", id).Msg("Failed to start container")
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	
	return c.JSON(fiber.Map{"message": "Container started", "id": id})
}

// StopContainer stops a container via Docker API
func (h *Handler) StopContainer(c *fiber.Ctx) error {
	id := c.Params("id")
	
	err := dockerAction(id, "stop", "POST")
	if err != nil {
		log.Error().Err(err).Str("container", id).Msg("Failed to stop container")
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	
	return c.JSON(fiber.Map{"message": "Container stopped", "id": id})
}

// RestartContainer restarts a container via Docker API
func (h *Handler) RestartContainer(c *fiber.Ctx) error {
	id := c.Params("id")
	
	err := dockerAction(id, "restart", "POST")
	if err != nil {
		log.Error().Err(err).Str("container", id).Msg("Failed to restart container")
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	
	return c.JSON(fiber.Map{"message": "Container restarted", "id": id})
}

// RemoveContainer removes a container via Docker API
func (h *Handler) RemoveContainer(c *fiber.Ctx) error {
	id := c.Params("id")
	
	// First stop the container if running
	_ = dockerAction(id, "stop", "POST")
	
	// Then remove it
	err := dockerAction(id, "", "DELETE")
	if err != nil {
		log.Error().Err(err).Str("container", id).Msg("Failed to remove container")
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	
	return c.JSON(fiber.Map{"message": "Container removed", "id": id})
}

// GetContainerLogs returns logs for a container
func (h *Handler) GetContainerLogs(c *fiber.Ctx) error {
	id := c.Params("id")
	tail := c.Query("tail", "100")
	
	logs, err := getDockerLogs(id, tail)
	if err != nil {
		log.Error().Err(err).Str("container", id).Msg("Failed to get container logs")
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	
	return c.JSON(fiber.Map{"id": id, "logs": logs})
}

// dockerAction performs a Docker API action on a container
func dockerAction(containerID, action, method string) error {
	socketPath := "/var/run/docker.sock"
	
	endpoint := fmt.Sprintf("/containers/%s", containerID)
	if action != "" {
		endpoint = fmt.Sprintf("/containers/%s/%s", containerID, action)
	}
	
	client := http.Client{
		Transport: &http.Transport{
			DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
				return net.Dial("unix", socketPath)
			},
		},
		Timeout: 30 * time.Second,
	}
	
	req, err := http.NewRequest(method, "http://localhost"+endpoint, nil)
	if err != nil {
		return err
	}
	
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("docker error: %s", string(body))
	}
	
	return nil
}

// getDockerLogs gets logs from a container
func getDockerLogs(containerID, tail string) (string, error) {
	socketPath := "/var/run/docker.sock"
	
	endpoint := fmt.Sprintf("/containers/%s/logs?stdout=true&stderr=true&tail=%s", containerID, tail)
	
	client := http.Client{
		Transport: &http.Transport{
			DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
				return net.Dial("unix", socketPath)
			},
		},
		Timeout: 10 * time.Second,
	}
	
	resp, err := client.Get("http://localhost" + endpoint)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("docker error: %s", string(body))
	}
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	
	// Docker logs have a binary prefix for each line (8 bytes header)
	// We need to strip it for text output
	return cleanDockerLogs(body), nil
}

// cleanDockerLogs strips Docker log stream headers
func cleanDockerLogs(raw []byte) string {
	var result strings.Builder
	data := raw
	
	for len(data) >= 8 {
		// Docker log format: 1 byte stream type + 3 bytes padding + 4 bytes size
		size := int(data[4])<<24 | int(data[5])<<16 | int(data[6])<<8 | int(data[7])
		if size <= 0 || 8+size > len(data) {
			// Invalid header, return remaining as-is
			result.Write(data)
			break
		}
		result.Write(data[8 : 8+size])
		data = data[8+size:]
	}
	
	// If there's remaining data, append it
	if len(data) > 0 && len(data) < 8 {
		result.Write(data)
	}
	
	return result.String()
}

// RunCommand executes a command across nodes or containers (HiveShell)
func (h *Handler) RunCommand(c *fiber.Ctx) error {
	var payload struct {
		Command     string   `json:"command"`
		Nodes       []string `json:"nodes"`       // Empty = all nodes
		Containers  []string `json:"containers"`  // Container IDs/names to exec in
		Strategy    string   `json:"strategy"`    // parallel, serial, rolling
		Sudo        bool     `json:"sudo"`
		TimeoutSecs int      `json:"timeout_secs"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	if payload.Command == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Command is required"})
	}

	executionID := uuid.New().String()
	
	// Default timeout
	if payload.TimeoutSecs == 0 {
		payload.TimeoutSecs = 30
	}

	// Determine strategy
	strategy := payload.Strategy
	if strategy == "" {
		strategy = "parallel"
	}

	// Determine target nodes for logging
	targetNodes := payload.Nodes
	if len(payload.Containers) > 0 {
		targetNodes = payload.Containers
	}

	// Store command execution in ClickHouse
	ctx := c.Context()
	err := h.clickhouse.InsertCommandExecution(ctx, executionID, payload.Command, "user", strategy, targetNodes)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to log command execution to ClickHouse")
	}

	// If containers are specified, execute directly via Docker
	if len(payload.Containers) > 0 {
		results := make([]map[string]interface{}, 0)
		startTime := time.Now()
		
		for _, containerID := range payload.Containers {
			result := executeContainerCommand(containerID, payload.Command, payload.Sudo, payload.TimeoutSecs)
			results = append(results, result)
			
			// Store result in ClickHouse
			endTime := time.Now()
			exitCode := 0
			if ec, ok := result["exit_code"].(int); ok {
				exitCode = ec
			}
			stdout := ""
			if out, ok := result["output"].(string); ok {
				stdout = out
			}
			stderr := ""
			if errStr, ok := result["error"].(string); ok {
				stderr = errStr
			}
			durationMs := uint32(endTime.Sub(startTime).Milliseconds())
			
			err := h.clickhouse.InsertCommandResult(ctx, executionID, containerID, exitCode, stdout, stderr, startTime, endTime, durationMs)
			if err != nil {
				log.Warn().Err(err).Msg("Failed to log command result to ClickHouse")
			}
		}

		log.Info().
			Str("execution_id", executionID).
			Str("command", payload.Command).
			Strs("containers", payload.Containers).
			Msg("Container command executed")

		return c.JSON(fiber.Map{
			"execution_id": executionID,
			"status":       "completed",
			"command":      payload.Command,
			"target_type":  "containers",
			"results":      results,
		})
	}

	// Otherwise, dispatch to nodes via NATS
	cmdRequest := map[string]interface{}{
		"execution_id": executionID,
		"command":      payload.Command,
		"use_sudo":     payload.Sudo,
		"timeout_secs": payload.TimeoutSecs,
	}

	cmdJSON, _ := json.Marshal(cmdRequest)

	// Determine target nodes
	targetNodeCount := len(payload.Nodes)
	if targetNodeCount == 0 {
		// Broadcast to all nodes - get count from registered nodes
		nodes := h.getRegisteredNodeHostnames()
		targetNodeCount = len(nodes)
		h.nats.Publish("metalhive.commands.broadcast", cmdJSON)
	} else {
		// Send to specific nodes
		for _, node := range payload.Nodes {
			h.nats.Publish("metalhive.commands."+node, cmdJSON)
		}
	}

	log.Info().
		Str("execution_id", executionID).
		Str("command", payload.Command).
		Strs("nodes", payload.Nodes).
		Int("target_count", targetNodeCount).
		Msg("Node command dispatched, waiting for results")

	// Subscribe to results for this execution and wait synchronously (like containers)
	resultSubject := "metalhive.results." + executionID
	sub, err := h.nats.SubscribeSync(resultSubject)
	if err != nil {
		log.Error().Err(err).Msg("Failed to subscribe for results")
		return c.Status(500).JSON(fiber.Map{"error": "Failed to subscribe for results"})
	}
	defer sub.Unsubscribe()

	// Collect results with timeout
	timeout := time.Duration(payload.TimeoutSecs) * time.Second
	deadline := time.Now().Add(timeout)
	results := make([]map[string]interface{}, 0)

	for len(results) < targetNodeCount && time.Now().Before(deadline) {
		msg, err := sub.NextMsg(time.Until(deadline))
		if err != nil {
			break // Timeout or error
		}

		var result map[string]interface{}
		if err := json.Unmarshal(msg.Data, &result); err == nil {
			results = append(results, result)
			
			// Store result in ClickHouse
			hostname := ""
			if h, ok := result["hostname"].(string); ok {
				hostname = h
			}
			exitCode := 0
			if ec, ok := result["exit_code"].(float64); ok {
				exitCode = int(ec)
			}
			stdout := ""
			if out, ok := result["stdout"].(string); ok {
				stdout = out
			}
			stderr := ""
			if errStr, ok := result["stderr"].(string); ok {
				stderr = errStr
			}
			durationMs := uint32(0)
			if d, ok := result["duration_ms"].(float64); ok {
				durationMs = uint32(d)
			}
			
			h.clickhouse.InsertCommandResult(ctx, executionID, hostname, exitCode, stdout, stderr, time.Now(), time.Now(), durationMs)
		}
	}

	// Update execution status
	status := "completed"
	if len(results) == 0 {
		status = "no_responses"
	} else if len(results) < targetNodeCount {
		status = "partial"
	}
	h.clickhouse.UpdateCommandExecutionStatus(ctx, executionID, status, time.Now())

	log.Info().
		Str("execution_id", executionID).
		Int("results_collected", len(results)).
		Int("target_count", targetNodeCount).
		Str("status", status).
		Msg("Node command completed")

	// Return results directly (same format as containers)
	return c.JSON(fiber.Map{
		"execution_id": executionID,
		"status":       status,
		"command":      payload.Command,
		"target_type":  "nodes",
		"results":      results,
	})
}

// executeContainerCommand runs a command inside a container and returns the result
func executeContainerCommand(containerID, command string, sudo bool, timeoutSecs int) map[string]interface{} {
	socketPath := "/var/run/docker.sock"
	
	// Build the command
	cmd := []string{"/bin/sh", "-c", command}
	if sudo {
		cmd = []string{"/bin/sh", "-c", "sudo " + command}
	}
	
	execConfig := map[string]interface{}{
		"AttachStdin":  false,
		"AttachStdout": true,
		"AttachStderr": true,
		"Tty":          false,
		"Cmd":          cmd,
	}
	
	body, _ := json.Marshal(execConfig)
	
	client := http.Client{
		Transport: &http.Transport{
			DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
				return net.DialTimeout("unix", socketPath, 5*time.Second)
			},
		},
		Timeout: time.Duration(timeoutSecs) * time.Second,
	}
	
	// Create exec
	endpoint := fmt.Sprintf("/containers/%s/exec", containerID)
	req, err := http.NewRequest("POST", "http://localhost"+endpoint, bytes.NewReader(body))
	if err != nil {
		return map[string]interface{}{
			"container": containerID,
			"success":   false,
			"error":     err.Error(),
		}
	}
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := client.Do(req)
	if err != nil {
		return map[string]interface{}{
			"container": containerID,
			"success":   false,
			"error":     err.Error(),
		}
	}
	defer resp.Body.Close()
	
	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return map[string]interface{}{
			"container": containerID,
			"success":   false,
			"error":     string(respBody),
		}
	}
	
	var execResult struct {
		Id string `json:"Id"`
	}
	json.NewDecoder(resp.Body).Decode(&execResult)
	
	// Start exec and get output
	startConfig := map[string]interface{}{
		"Detach": false,
		"Tty":    false,
	}
	startBody, _ := json.Marshal(startConfig)
	
	startEndpoint := fmt.Sprintf("/exec/%s/start", execResult.Id)
	startReq, _ := http.NewRequest("POST", "http://localhost"+startEndpoint, bytes.NewReader(startBody))
	startReq.Header.Set("Content-Type", "application/json")
	
	startResp, err := client.Do(startReq)
	if err != nil {
		return map[string]interface{}{
			"container": containerID,
			"success":   false,
			"error":     err.Error(),
		}
	}
	defer startResp.Body.Close()
	
	// Read output
	output, _ := io.ReadAll(startResp.Body)
	
	// Get exit code
	inspectEndpoint := fmt.Sprintf("/exec/%s/json", execResult.Id)
	inspectReq, _ := http.NewRequest("GET", "http://localhost"+inspectEndpoint, nil)
	inspectResp, _ := client.Do(inspectReq)
	
	var inspectResult struct {
		ExitCode int `json:"ExitCode"`
	}
	if inspectResp != nil {
		defer inspectResp.Body.Close()
		json.NewDecoder(inspectResp.Body).Decode(&inspectResult)
	}
	
	// Clean output (remove docker stream headers)
	cleanOutput := cleanDockerOutput(output)
	
	return map[string]interface{}{
		"container": containerID,
		"success":   inspectResult.ExitCode == 0,
		"exit_code": inspectResult.ExitCode,
		"output":    cleanOutput,
	}
}

// cleanDockerOutput removes Docker stream multiplexing headers from output
func cleanDockerOutput(data []byte) string {
	var result []byte
	for len(data) > 0 {
		if len(data) < 8 {
			result = append(result, data...)
			break
		}
		// Docker stream header: [type(1), 0, 0, 0, size(4)]
		if data[0] <= 2 && data[1] == 0 && data[2] == 0 && data[3] == 0 {
			size := int(data[4])<<24 | int(data[5])<<16 | int(data[6])<<8 | int(data[7])
			data = data[8:]
			if size > 0 && size <= len(data) {
				result = append(result, data[:size]...)
				data = data[size:]
			}
		} else {
			result = append(result, data[0])
			data = data[1:]
		}
	}
	return strings.TrimSpace(string(result))
}

// GetExecutionHistory returns command execution history
func (h *Handler) GetExecutionHistory(c *fiber.Ctx) error {
	ctx := c.Context()
	limit := 50 // Default limit
	
	executions, err := h.clickhouse.GetCommandExecutions(ctx, limit)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to get execution history from ClickHouse")
		return c.JSON(fiber.Map{"executions": []interface{}{}, "error": "Failed to retrieve history"})
	}
	
	if executions == nil {
		executions = []map[string]interface{}{}
	}
	
	return c.JSON(fiber.Map{"executions": executions, "total": len(executions)})
}

// GetExecutionStatus returns status of a command execution
func (h *Handler) GetExecutionStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	// TODO: Get execution status
	return c.JSON(fiber.Map{"execution_id": id, "status": "unknown"})
}

// CancelExecution cancels a running execution
func (h *Handler) CancelExecution(c *fiber.Ctx) error {
	id := c.Params("id")
	// TODO: Cancel execution
	return c.JSON(fiber.Map{"execution_id": id, "message": "Cancellation requested"})
}

// GetConfig returns configuration values from HiveVault
func (h *Handler) GetConfig(c *fiber.Ctx) error {
	path := c.Params("*")
	ctx := c.Context()
	namespace := c.Query("namespace")

	// If path is empty or just "/", list all configs
	if path == "" || path == "/" {
		entries, err := h.vault.List(ctx, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		
		// Convert to response format (optionally hide secret values)
		configs := make([]map[string]interface{}, 0, len(entries))
		for _, e := range entries {
			value := e.Value
			if e.IsSecret {
				value = "********" // Mask secret values
			}
			configs = append(configs, map[string]interface{}{
				"path":       e.Path,
				"value":      value,
				"is_secret":  e.IsSecret,
				"updated_at": e.UpdatedAt,
			})
		}
		
		return c.JSON(fiber.Map{
			"configs": configs,
			"total":   len(configs),
		})
	}

	// Get single config by path
	value, err := h.vault.Get(ctx, path)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Key not found"})
	}

	return c.JSON(fiber.Map{
		"path":  path,
		"value": value,
	})
}

// SetConfig sets a configuration value in HiveVault
func (h *Handler) SetConfig(c *fiber.Ctx) error {
	var payload struct {
		Path   string `json:"path"`
		Value  string `json:"value"`
		Secret bool   `json:"secret"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	ctx := c.Context()
	if err := h.vault.Set(ctx, payload.Path, payload.Value, payload.Secret); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to set config"})
	}

	return c.JSON(fiber.Map{
		"message": "Config set",
		"path":    payload.Path,
	})
}

// DeleteConfig deletes a configuration value
func (h *Handler) DeleteConfig(c *fiber.Ctx) error {
	path := c.Params("*")
	ctx := c.Context()

	if err := h.vault.Delete(ctx, path); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete config"})
	}

	return c.JSON(fiber.Map{"message": "Config deleted", "path": path})
}

// GetConfigHistory returns the history of a config key
func (h *Handler) GetConfigHistory(c *fiber.Ctx) error {
	path := c.Params("*")
	ctx := c.Context()
	limit := 50 // Default limit
	
	history, err := h.clickhouse.GetConfigHistory(ctx, path, limit)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to get config history from ClickHouse")
		return c.JSON(fiber.Map{"path": path, "history": []interface{}{}, "error": "Failed to retrieve history"})
	}
	
	if history == nil {
		history = []map[string]interface{}{}
	}
	
	return c.JSON(fiber.Map{"path": path, "history": history, "total": len(history)})
}

// RollbackConfig rolls back a config to a previous version
func (h *Handler) RollbackConfig(c *fiber.Ctx) error {
	path := c.Params("*")
	// TODO: Implement rollback
	return c.JSON(fiber.Map{"message": "Rollback initiated", "path": path})
}

// GetSystemMetrics returns system metrics for a node
func (h *Handler) GetSystemMetrics(c *fiber.Ctx) error {
	hostname := c.Params("hostname")
	// TODO: Query ClickHouse for metrics
	return c.JSON(fiber.Map{"hostname": hostname, "metrics": []interface{}{}})
}

// GetContainerMetrics returns container metrics for a node
func (h *Handler) GetContainerMetrics(c *fiber.Ctx) error {
	hostname := c.Params("hostname")
	// TODO: Query ClickHouse for container metrics
	return c.JSON(fiber.Map{"hostname": hostname, "metrics": []interface{}{}})
}

// AskAI forwards a natural language query to MetalMind
func (h *Handler) AskAI(c *fiber.Ctx) error {
	// Forward to AI service
	aiURL := os.Getenv("METALHIVE_AI_URL")
	if aiURL == "" {
		aiURL = "http://ai:8081"
	}

	resp, err := http.Post(aiURL+"/ask", "application/json", bytes.NewReader(c.Body()))
	if err != nil {
		log.Error().Err(err).Msg("Failed to reach AI service")
		return c.Status(503).JSON(fiber.Map{"error": "AI service unavailable"})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to read AI response"})
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Invalid AI response"})
	}

	return c.Status(resp.StatusCode).JSON(result)
}

// GetAIReports returns AI analysis reports from MetalMind
func (h *Handler) GetAIReports(c *fiber.Ctx) error {
	aiURL := os.Getenv("METALHIVE_AI_URL")
	if aiURL == "" {
		aiURL = "http://ai:8081"
	}

	resp, err := http.Get(aiURL + "/reports")
	if err != nil {
		log.Warn().Err(err).Msg("AI service unavailable, falling back to ClickHouse")
		// Fallback to ClickHouse
		return h.getAIReportsFromClickHouse(c)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Warn().Int("status", resp.StatusCode).Msg("AI service returned error, falling back to ClickHouse")
		return h.getAIReportsFromClickHouse(c)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return h.getAIReportsFromClickHouse(c)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return h.getAIReportsFromClickHouse(c)
	}

	return c.Status(resp.StatusCode).JSON(result)
}

// getAIReportsFromClickHouse is a fallback method to get reports from ClickHouse
func (h *Handler) getAIReportsFromClickHouse(c *fiber.Ctx) error {
	ctx := c.Context()
	limit := 50

	reports, err := h.clickhouse.GetAIReports(ctx, limit)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to get AI reports from ClickHouse")
		return c.JSON(fiber.Map{"reports": []interface{}{}})
	}

	if reports == nil {
		reports = []map[string]interface{}{}
	}

	return c.JSON(fiber.Map{"reports": reports, "total": len(reports)})
}

// TriggerAnalysis triggers an AI analysis
func (h *Handler) TriggerAnalysis(c *fiber.Ctx) error {
	aiURL := os.Getenv("METALHIVE_AI_URL")
	if aiURL == "" {
		aiURL = "http://ai:8081"
	}

	resp, err := http.Post(aiURL+"/analyze", "application/json", bytes.NewReader(c.Body()))
	if err != nil {
		log.Error().Err(err).Msg("Failed to reach AI service")
		return c.Status(503).JSON(fiber.Map{"error": "AI service unavailable"})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to read AI response"})
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return c.Status(202).JSON(fiber.Map{"message": "Analysis triggered"})
	}

	return c.Status(resp.StatusCode).JSON(result)
}

// TriggerSystemUpdate initiates a fleet-wide system update
func (h *Handler) TriggerSystemUpdate(c *fiber.Ctx) error {
	var payload struct {
		Type     string   `json:"type"` // os, docker, security
		Strategy string   `json:"strategy"`
		Nodes    []string `json:"nodes"`
		Schedule string   `json:"schedule"`
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	updateID := uuid.New().String()
	
	// Default strategy
	strategy := payload.Strategy
	if strategy == "" {
		strategy = "rolling"
	}
	
	// Default type
	updateType := payload.Type
	if updateType == "" {
		updateType = "security"
	}

	// Store update in ClickHouse
	ctx := c.Context()
	err := h.clickhouse.InsertSystemUpdate(ctx, updateID, updateType, strategy, "user", payload.Nodes)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to log system update to ClickHouse")
	}

	log.Info().
		Str("update_id", updateID).
		Str("type", updateType).
		Str("strategy", strategy).
		Strs("nodes", payload.Nodes).
		Msg("System update initiated")

	return c.Status(202).JSON(fiber.Map{
		"update_id": updateID,
		"message":   "Update initiated",
		"type":      updateType,
		"strategy":  strategy,
		"nodes":     payload.Nodes,
	})
}

// GetUpdateHistory returns system update history
func (h *Handler) GetUpdateHistory(c *fiber.Ctx) error {
	ctx := c.Context()
	limit := 50 // Default limit

	updates, err := h.clickhouse.GetSystemUpdates(ctx, limit)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to get system updates from ClickHouse")
		return c.JSON(fiber.Map{"updates": []interface{}{}, "error": "Failed to retrieve updates"})
	}

	if updates == nil {
		updates = []map[string]interface{}{}
	}

	return c.JSON(fiber.Map{"updates": updates, "total": len(updates)})
}

// WebSocketHandler handles WebSocket connections for real-time updates
func (h *Handler) WebSocketHandler(c *websocket.Conn) {
	defer c.Close()

	log.Info().Msg("WebSocket client connected")

	for {
		_, msg, err := c.ReadMessage()
		if err != nil {
			log.Debug().Err(err).Msg("WebSocket read error")
			break
		}

		log.Debug().Str("message", string(msg)).Msg("WebSocket message received")

		// Echo for now - would implement proper message handling
		if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}

	log.Info().Msg("WebSocket client disconnected")
}

// DockerContainer represents a container from Docker API
type DockerContainer struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Image   string            `json:"image"`
	Status  string            `json:"status"`
	State   string            `json:"state"`
	Ports   []string          `json:"ports"`
	Node    string            `json:"node,omitempty"`
	Created int64             `json:"created"`
	Labels  map[string]string `json:"labels,omitempty"`
}

// DockerAPIContainer represents raw Docker API container response
type DockerAPIContainer struct {
	ID      string   `json:"Id"`
	Names   []string `json:"Names"`
	Image   string   `json:"Image"`
	Status  string   `json:"Status"`
	State   string   `json:"State"`
	Created int64    `json:"Created"`
	Ports   []struct {
		PrivatePort int    `json:"PrivatePort"`
		PublicPort  int    `json:"PublicPort"`
		Type        string `json:"Type"`
	} `json:"Ports"`
	Labels map[string]string `json:"Labels"`
}

// getDockerContainers queries Docker via Unix socket
func getDockerContainers() ([]DockerContainer, error) {
	socketPath := "/var/run/docker.sock"
	
	// Check if socket exists
	if _, err := os.Stat(socketPath); os.IsNotExist(err) {
		return nil, err
	}

	// Create HTTP client that dials Unix socket
	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return net.Dial("unix", socketPath)
			},
		},
		Timeout: 10 * time.Second,
	}

	// Query Docker API for containers
	resp, err := client.Get("http://localhost/containers/json?all=true")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var apiContainers []DockerAPIContainer
	if err := json.Unmarshal(body, &apiContainers); err != nil {
		return nil, err
	}

	// Get hostname for node field
	hostname, _ := os.Hostname()

	// Convert to our format
	containers := make([]DockerContainer, 0, len(apiContainers))
	for _, c := range apiContainers {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		ports := make([]string, 0)
		for _, p := range c.Ports {
			if p.PublicPort > 0 {
				ports = append(ports, fmt.Sprintf("%d:%d", p.PublicPort, p.PrivatePort))
			}
		}

		// Parse state - Docker API uses lowercase
		state := strings.ToLower(c.State)

		containers = append(containers, DockerContainer{
			ID:      c.ID[:12],
			Name:    name,
			Image:   c.Image,
			Status:  c.Status,
			State:   state,
			Ports:   ports,
			Node:    hostname,
			Created: c.Created,
			Labels:  c.Labels,
		})
	}

	return containers, nil
}

// ContainerExec handles WebSocket connections for container shell access
func (h *Handler) ContainerExec(c *websocket.Conn) {
	// Get container ID from the URL path
	containerID := c.Params("id")
	if containerID == "" {
		c.WriteMessage(websocket.TextMessage, []byte("Error: container ID required"))
		return
	}

	log.Info().Str("container", containerID).Msg("Container exec session started")

	// Create exec instance
	execID, err := createDockerExec(containerID)
	if err != nil {
		c.WriteMessage(websocket.TextMessage, []byte("Error: " + err.Error()))
		log.Error().Err(err).Str("container", containerID).Msg("Failed to create exec")
		return
	}

	// Start exec and get connection
	execConn, err := startDockerExec(execID)
	if err != nil {
		c.WriteMessage(websocket.TextMessage, []byte("Error: " + err.Error()))
		log.Error().Err(err).Str("exec", execID).Msg("Failed to start exec")
		return
	}
	defer execConn.Close()

	// Bidirectional copy between WebSocket and exec
	done := make(chan struct{})

	// Send initial newline to trigger shell prompt
	execConn.Write([]byte("\n"))

	// Docker exec -> WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := execConn.Read(buf)
			if err != nil {
				select {
				case <-done:
				default:
					close(done)
				}
				return
			}
			// Skip Docker stream header (8 bytes) if present  
			data := buf[:n]
			if n > 8 && (data[0] == 1 || data[0] == 2) {
				data = data[8:]
			}
			if err := c.WriteMessage(websocket.TextMessage, data); err != nil {
				select {
				case <-done:
				default:
					close(done)
				}
				return
			}
		}
	}()

	// WebSocket -> Docker exec
	go func() {
		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				return
			}
			if _, err := execConn.Write(msg); err != nil {
				return
			}
		}
	}()

	<-done
	log.Info().Str("container", containerID).Msg("Container exec session ended")
}

// createDockerExec creates a new exec instance in a container
func createDockerExec(containerID string) (string, error) {
	socketPath := "/var/run/docker.sock"
	log.Debug().Str("container", containerID).Msg("Creating Docker exec instance")
	
	execConfig := map[string]interface{}{
		"AttachStdin":  true,
		"AttachStdout": true,
		"AttachStderr": true,
		"Tty":          true,
		"Cmd":          []string{"/bin/sh"},
	}
	
	body, _ := json.Marshal(execConfig)
	log.Debug().RawJSON("config", body).Msg("Exec config")
	
	client := http.Client{
		Transport: &http.Transport{
			DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
				return net.Dial("unix", socketPath)
			},
		},
		Timeout: 10 * time.Second,
	}
	
	endpoint := fmt.Sprintf("/containers/%s/exec", containerID)
	log.Debug().Str("endpoint", endpoint).Msg("Creating exec at endpoint")
	req, err := http.NewRequest("POST", "http://localhost"+endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := client.Do(req)
	if err != nil {
		log.Error().Err(err).Msg("Docker exec create request failed")
		return "", err
	}
	defer resp.Body.Close()
	
	log.Debug().Int("status", resp.StatusCode).Msg("Docker exec create response")
	
	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		log.Error().Int("status", resp.StatusCode).Str("body", string(respBody)).Msg("Docker exec create error")
		return "", fmt.Errorf("docker error: %s", string(respBody))
	}
	
	var result struct {
		Id string `json:"Id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Error().Err(err).Msg("Failed to decode exec ID")
		return "", err
	}
	
	log.Debug().Str("execId", result.Id).Msg("Docker exec created successfully")
	return result.Id, nil
}

// startDockerExec starts the exec instance and returns the connection
func startDockerExec(execID string) (net.Conn, error) {
	socketPath := "/var/run/docker.sock"
	log.Debug().Str("execId", execID).Msg("Starting Docker exec")
	
	startConfig := map[string]interface{}{
		"Detach": false,
		"Tty":    true,
	}
	
	body, _ := json.Marshal(startConfig)
	
	// Connect directly to the Unix socket with timeout
	conn, err := net.DialTimeout("unix", socketPath, 5*time.Second)
	if err != nil {
		log.Error().Err(err).Msg("Failed to connect to Docker socket")
		return nil, err
	}
	
	// Send HTTP request manually to keep the connection open
	endpoint := fmt.Sprintf("/exec/%s/start", execID)
	request := fmt.Sprintf("POST %s HTTP/1.1\r\n"+
		"Host: localhost\r\n"+
		"Content-Type: application/json\r\n"+
		"Connection: Upgrade\r\n"+
		"Upgrade: tcp\r\n"+
		"Content-Length: %d\r\n"+
		"\r\n%s", endpoint, len(body), string(body))
	
	log.Debug().Str("endpoint", endpoint).Msg("Sending exec start request")
	
	if _, err := conn.Write([]byte(request)); err != nil {
		log.Error().Err(err).Msg("Failed to write exec start request")
		conn.Close()
		return nil, err
	}
	
	// Read HTTP response headers with timeout
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	buf := make([]byte, 1024)
	n, err := conn.Read(buf)
	conn.SetReadDeadline(time.Time{}) // Clear deadline for subsequent reads
	if err != nil {
		log.Error().Err(err).Msg("Failed to read exec start response")
		conn.Close()
		return nil, err
	}
	
	response := string(buf[:n])
	log.Debug().Str("response", response[:min(len(response), 200)]).Msg("Exec start response")
	
	if !strings.Contains(response, "101") && !strings.Contains(response, "200") {
		log.Error().Str("response", response).Msg("Exec start failed")
		conn.Close()
		return nil, fmt.Errorf("exec start failed: %s", response)
	}
	
	log.Debug().Msg("Docker exec started successfully")
	return conn, nil
}

// DeployStack deploys a Docker Compose stack
func (h *Handler) DeployStack(c *fiber.Ctx) error {
	var payload struct {
		Name        string   `json:"name"`
		ComposeYAML string   `json:"compose_yaml"`
		Nodes       []string `json:"nodes"` // Target nodes, empty = controller node
	}

	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid payload"})
	}

	if payload.Name == "" || payload.ComposeYAML == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Name and compose_yaml are required"})
	}

	// Validate YAML structure (basic check)
	if !strings.Contains(payload.ComposeYAML, "services:") {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid compose file: must contain 'services:'"})
	}

	stackID := uuid.New().String()
	
	// Create temp directory for compose file
	tmpDir := fmt.Sprintf("/tmp/metalhive-stacks/%s", stackID)
	composePath := filepath.Join(tmpDir, "docker-compose.yml")
	
	// Create directory
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		log.Error().Err(err).Msg("Failed to create stack directory")
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create stack directory"})
	}
	
	// Write compose file
	if err := os.WriteFile(composePath, []byte(payload.ComposeYAML), 0644); err != nil {
		log.Error().Err(err).Msg("Failed to write compose file")
		return c.Status(500).JSON(fiber.Map{"error": "Failed to write compose file"})
	}
	
	// Run docker compose up
	cmd := exec.Command("docker", "compose", "-f", composePath, "-p", payload.Name, "up", "-d")
	output, err := cmd.CombinedOutput()
	
	if err != nil {
		log.Error().Err(err).Str("output", string(output)).Msg("Failed to deploy stack")
		return c.Status(500).JSON(fiber.Map{
			"error":  "Failed to deploy stack",
			"output": string(output),
		})
	}

	log.Info().
		Str("stack_id", stackID).
		Str("name", payload.Name).
		Msg("Stack deployed successfully")

	return c.Status(201).JSON(fiber.Map{
		"stack_id": stackID,
		"name":     payload.Name,
		"message":  "Stack deployed successfully",
		"output":   string(output),
	})
}

// ListStacks returns deployed stacks (docker compose projects)
func (h *Handler) ListStacks(c *fiber.Ctx) error {
	// List docker compose projects
	cmd := exec.Command("docker", "compose", "ls", "--format", "json")
	output, err := cmd.CombinedOutput()
	
	if err != nil {
		log.Warn().Err(err).Msg("Failed to list stacks")
		return c.JSON(fiber.Map{"stacks": []interface{}{}, "error": string(output)})
	}
	
	// Parse JSON output
	var stacks []map[string]interface{}
	if err := json.Unmarshal(output, &stacks); err != nil {
		// Try parsing as newline-separated JSON
		lines := strings.Split(strings.TrimSpace(string(output)), "\n")
		stacks = make([]map[string]interface{}, 0)
		for _, line := range lines {
			if line == "" {
				continue
			}
			var stack map[string]interface{}
			if err := json.Unmarshal([]byte(line), &stack); err == nil {
				stacks = append(stacks, stack)
			}
		}
	}
	
	return c.JSON(fiber.Map{
		"stacks": stacks,
		"total":  len(stacks),
	})
}

// StreamExecOutput handles WebSocket streaming of command execution output
// StreamExecOutput handles WebSocket streaming of command execution output
func (h *Handler) StreamExecOutput(c *websocket.Conn) {
	executionID := c.Params("id")
	if executionID == "" {
		c.WriteMessage(websocket.TextMessage, []byte(`{"error":"missing execution_id"}`))
		c.Close()
		return
	}

	log.Info().Str("execution_id", executionID).Msg("WebSocket connected for streaming output")

	// Channels for NATS messages
	outputChan := make(chan *nats.Msg, 1000)
	resultChan := make(chan *nats.Msg, 1)

	// Subscribe to NATS output stream for this execution
	outputSubject := fmt.Sprintf("metalhive.output.%s", executionID)
	resultSubject := fmt.Sprintf("metalhive.results.%s", executionID)
	
	outputSub, err := h.nats.ChanSubscribe(outputSubject, outputChan)
	if err != nil {
		c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"failed to subscribe: %v"}`, err)))
		c.Close()
		return
	}
	defer outputSub.Unsubscribe()

	// Subscribe to final result
	resultSub, err := h.nats.ChanSubscribe(resultSubject, resultChan)
	if err != nil {
		c.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"failed to subscribe results: %v"}`, err)))
		c.Close()
		return
	}
	defer resultSub.Unsubscribe()

	// Handle client disconnects via a separate goroutine
	disconnectChan := make(chan struct{})
	go func() {
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				close(disconnectChan)
				return
			}
		}
	}()

	// Give a short window for late subscription to catch results
	// If no result arrives quickly, check ClickHouse for existing results
	initialTimeout := time.After(2 * time.Second)
	
	select {
	case result := <-resultChan:
		// Got result from NATS - forward and close
		finalMsg := fmt.Sprintf(`{"type":"complete","data":%s}`, string(result.Data))
		c.WriteMessage(websocket.TextMessage, []byte(finalMsg))
		time.Sleep(100 * time.Millisecond)
		c.Close()
		return
	case <-initialTimeout:
		// Check ClickHouse for existing results
		log.Debug().Str("execution_id", executionID).Msg("NATS timeout, checking ClickHouse for results")
		ctx := context.Background()
		results, err := h.clickhouse.GetCommandResultsByExecutionID(ctx, executionID)
		if err != nil {
			log.Error().Err(err).Str("execution_id", executionID).Msg("Failed to query ClickHouse for results")
		}
		log.Debug().Str("execution_id", executionID).Int("results_count", len(results)).Msg("ClickHouse query result")
		if err == nil && len(results) > 0 {
			// Results already exist in ClickHouse - send them
			for i, result := range results {
				resultJSON, _ := json.Marshal(result)
				finalMsg := fmt.Sprintf(`{"type":"complete","data":%s}`, string(resultJSON))
				log.Debug().Str("execution_id", executionID).Int("result_index", i).Msg("Sending complete message to WebSocket")
				if err := c.WriteMessage(websocket.TextMessage, []byte(finalMsg)); err != nil {
					log.Error().Err(err).Str("execution_id", executionID).Msg("Failed to write to WebSocket")
				}
			}
			time.Sleep(100 * time.Millisecond)
			c.Close()
			return
		}
		// No results yet - continue waiting on NATS
		log.Debug().Str("execution_id", executionID).Msg("No ClickHouse results, continuing to wait on NATS")
	case <-disconnectChan:
		return
	}

	// Keep connection open until command completes or client disconnects
	timeout := time.After(10 * time.Minute)
	
	for {
		select {
		case msg := <-outputChan:
			// Forward output line
			if err := c.WriteMessage(websocket.TextMessage, msg.Data); err != nil {
				return
			}

		case result := <-resultChan:
			// Drain any remaining output messages first to ensure lines appear before complete
			// We loop until channel is empty or we hit limit to prevent tight loop
			for i := 0; i < len(outputChan)+10; i++ {
				select {
				case msg := <-outputChan:
					if err := c.WriteMessage(websocket.TextMessage, msg.Data); err != nil {
						return
					}
				default:
					goto Drained
				}
			}
		Drained:
			
			// Send final result and close
			finalMsg := fmt.Sprintf(`{"type":"complete","data":%s}`, string(result.Data))
			c.WriteMessage(websocket.TextMessage, []byte(finalMsg))
			
			// Give a tiny moment for the message to flush?
			time.Sleep(100 * time.Millisecond)
			c.Close()
			return

		case <-disconnectChan:
			log.Info().Str("execution_id", executionID).Msg("WebSocket client disconnected")
			return

		case <-timeout:
			c.WriteMessage(websocket.TextMessage, []byte(`{"type":"timeout","error":"execution timeout"}`))
			c.Close()
			return
		}
	}
}
