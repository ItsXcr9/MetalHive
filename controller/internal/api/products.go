// Package api provides HTTP API handlers for the controller
package api

import (
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
	"github.com/rs/zerolog/log"
)

// ProductsBasePath is the directory to scan for Xcr9 products
const ProductsBasePath = "/home"

// DockerHostGateway is the IP to reach the host from inside a container
// This is the default Docker bridge gateway
const DockerHostGateway = "172.17.0.1"

// getAncientReportUIURL returns the UI URL, preferring environment variable if set
func getAncientReportUIURL(defaultPort int) string {
	if url := os.Getenv("ANCIENTREPORT_UI_URL"); url != "" {
		return url
	}
	return fmt.Sprintf("http://%s:%d", DockerHostGateway, defaultPort)
}

// ProductType defines the type of product
type ProductType string

const (
	ProductTypeAncientReport ProductType = "ancientreport"
	ProductTypeMithrilLog    ProductType = "mithrillog"
	ProductTypeMetalHive     ProductType = "metalhive"
)

// ProductConfig defines an Xcr9 product that MetalHive can manage
type ProductConfig struct {
	Name        string      `json:"name"`
	Key         string      `json:"key"`
	Type        ProductType `json:"type"`
	Description string      `json:"description"`
	Containers  []string    `json:"containers"`   // Expected container name prefixes
	ComposeDir  string      `json:"compose_dir"`  // Directory containing docker-compose.yml
	APIURL      string      `json:"api_url"`      // API endpoint URL
	UIURL       string      `json:"ui_url"`       // UI URL (if available)
	Icon        string      `json:"icon"`         // Emoji or icon identifier
}

// ProductContainerStatus represents the status of a single container for products
type ProductContainerStatus struct {
	Name    string `json:"name"`
	ID      string `json:"id,omitempty"`
	Status  string `json:"status"`
	Running bool   `json:"running"`
	Image   string `json:"image,omitempty"`
}

// ProductStatus represents the current status of an Xcr9 product
type ProductStatus struct {
	Name           string                   `json:"name"`
	Key            string                   `json:"key"`
	Type           ProductType              `json:"type"`
	Description    string                   `json:"description"`
	Installed      bool                     `json:"installed"`
	Running        bool                     `json:"running"`
	PartialRunning bool                     `json:"partial_running"`
	Containers     []ProductContainerStatus `json:"containers"`
	TotalExpected  int                      `json:"total_expected"`
	TotalRunning   int                      `json:"total_running"`
	APIURL         string                   `json:"api_url,omitempty"`
	UIURL          string                   `json:"ui_url,omitempty"`
	Icon           string                   `json:"icon"`
	APIHealthy     bool                     `json:"api_healthy"`
	Path           string                   `json:"path"`
}

// Product port mappings
var productPorts = map[ProductType]struct {
	APIPort int
	UIPort  int
}{
	ProductTypeAncientReport: {APIPort: 8800, UIPort: 6080},  // Analysis uses host network on port 8800
	ProductTypeMithrilLog:    {APIPort: 9900, UIPort: 0},
	ProductTypeMetalHive:     {APIPort: 8080, UIPort: 3002},
}

// discoverProducts scans /home for Xcr9 products
func discoverProducts() []ProductConfig {
	products := []ProductConfig{}

	entries, err := os.ReadDir(ProductsBasePath)
	if err != nil {
		log.Warn().Err(err).Str("path", ProductsBasePath).Msg("Failed to read products directory")
		return products
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		name := entry.Name()
		dirPath := filepath.Join(ProductsBasePath, name)

		// Check for docker-compose file
		composeExists := fileExists(filepath.Join(dirPath, "docker-compose.yml")) ||
			fileExists(filepath.Join(dirPath, "docker-compose.yaml"))

		if !composeExists {
			continue
		}

		// Determine product type
		var productType ProductType
		var description string
		var icon string
		var containers []string

		nameLower := strings.ToLower(name)

		switch {
		case nameLower == "ancientreport":
			productType = ProductTypeAncientReport
			description = "eBPF-based System Observability"
			icon = "📈"
			containers = []string{"AncientReport-agent", "AncientReport-analysis", "AncientReport-ui", "AncientReport-nats", "AncientReport-clickhouse"}

		case strings.HasPrefix(nameLower, "mithrillog"):
			productType = ProductTypeMithrilLog
			parts := strings.SplitN(name, "-", 2)
			tenant := ""
			if len(parts) > 1 {
				tenant = parts[1]
				description = fmt.Sprintf("AI Log Analysis (%s)", tenant)
				// Use tenant-specific container name patterns
				containers = []string{
					fmt.Sprintf("mithrillog-%s-orchestrator", tenant),
					fmt.Sprintf("mithrillog-%s-api", tenant),
				}
			} else {
				description = "AI Log Analysis"
				containers = []string{"mithrillog-orchestrator", "mithrillog-api"}
			}
			icon = "📜"

		case nameLower == "metalhive":
			continue

		default:
			continue
		}

		ports := productPorts[productType]
		apiURL := ""
		uiURL := ""
		if ports.APIPort > 0 {
			apiURL = fmt.Sprintf("http://%s:%d", DockerHostGateway, ports.APIPort)
		}
		if ports.UIPort > 0 {
			// Use env override for AncientReport UI URL
			if productType == ProductTypeAncientReport {
				uiURL = getAncientReportUIURL(ports.UIPort)
			} else {
				uiURL = fmt.Sprintf("http://%s:%d", DockerHostGateway, ports.UIPort)
			}
		}

		product := ProductConfig{
			Name:        name,
			Key:         strings.ToLower(strings.ReplaceAll(name, "-", "_")),
			Type:        productType,
			Description: description,
			Containers:  containers,
			ComposeDir:  dirPath,
			APIURL:      apiURL,
			UIURL:       uiURL,
			Icon:        icon,
		}
		products = append(products, product)
	}

	log.Info().Int("count", len(products)).Msg("Discovered Xcr9 products")
	return products
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// ListProducts returns status of all discovered Xcr9 products
func (h *Handler) ListProducts(c *fiber.Ctx) error {
	products := discoverProducts()

	// Get all running containers using existing function
	containers, err := getDockerContainers()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to get Docker containers for product status")
		containers = []DockerContainer{}
	}

	// Build container name -> container map
	containerMap := make(map[string]DockerContainer)
	for _, cont := range containers {
		containerMap[cont.Name] = cont
		// Also index by short ID
		if len(cont.ID) >= 12 {
			containerMap[cont.ID[:12]] = cont
		}
	}

	statuses := make([]ProductStatus, 0, len(products))
	for _, product := range products {
		status := checkProductStatusFromContainers(product, containerMap)
		statuses = append(statuses, status)
	}

	return c.JSON(fiber.Map{
		"products":  statuses,
		"total":     len(statuses),
		"base_path": ProductsBasePath,
	})
}

// GetProduct returns status of a specific product
func (h *Handler) GetProduct(c *fiber.Ctx) error {
	key := strings.ToLower(c.Params("name"))

	products := discoverProducts()
	var foundProduct *ProductConfig
	for _, p := range products {
		if p.Key == key || strings.ToLower(p.Name) == key {
			foundProduct = &p
			break
		}
	}

	if foundProduct == nil {
		return c.Status(404).JSON(fiber.Map{
			"error":   "Product not found",
			"product": key,
		})
	}

	containers, _ := getDockerContainers()
	containerMap := make(map[string]DockerContainer)
	for _, cont := range containers {
		containerMap[cont.Name] = cont
	}

	status := checkProductStatusFromContainers(*foundProduct, containerMap)
	return c.JSON(status)
}

// InstallProduct installs a product via docker-compose
func (h *Handler) InstallProduct(c *fiber.Ctx) error {
	key := strings.ToLower(c.Params("name"))

	products := discoverProducts()
	var foundProduct *ProductConfig
	for _, p := range products {
		if p.Key == key || strings.ToLower(p.Name) == key {
			foundProduct = &p
			break
		}
	}

	if foundProduct == nil {
		return c.Status(404).JSON(fiber.Map{
			"error":   "Product not found",
			"product": key,
		})
	}

	log.Info().
		Str("product", foundProduct.Name).
		Str("compose_dir", foundProduct.ComposeDir).
		Msg("Starting product installation")

	// Execute docker compose up -d --build in the background
	go func() {
		cmd := exec.Command("docker", "compose", "up", "-d", "--build")
		cmd.Dir = foundProduct.ComposeDir
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Error().Err(err).Str("output", string(output)).Str("product", foundProduct.Name).Msg("Failed to install product")
		} else {
			log.Info().Str("product", foundProduct.Name).Msg("Product installation completed")
		}
	}()

	return c.Status(202).JSON(fiber.Map{
		"message":     "Installation started",
		"product":     foundProduct.Name,
		"compose_dir": foundProduct.ComposeDir,
		"status":      "running",
	})
}

// UninstallProduct stops and removes a product
func (h *Handler) UninstallProduct(c *fiber.Ctx) error {
	key := strings.ToLower(c.Params("name"))

	products := discoverProducts()
	var foundProduct *ProductConfig
	for _, p := range products {
		if p.Key == key || strings.ToLower(p.Name) == key {
			foundProduct = &p
			break
		}
	}

	if foundProduct == nil {
		return c.Status(404).JSON(fiber.Map{
			"error":   "Product not found",
			"product": key,
		})
	}

	log.Info().
		Str("product", foundProduct.Name).
		Str("compose_dir", foundProduct.ComposeDir).
		Msg("Starting product uninstallation")

	// Execute docker compose down in the background
	go func() {
		cmd := exec.Command("docker", "compose", "down")
		cmd.Dir = foundProduct.ComposeDir
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Error().Err(err).Str("output", string(output)).Str("product", foundProduct.Name).Msg("Failed to uninstall product")
		} else {
			log.Info().Str("product", foundProduct.Name).Msg("Product uninstallation completed")
		}
	}()

	return c.Status(202).JSON(fiber.Map{
		"message": "Uninstallation started",
		"product": foundProduct.Name,
		"status":  "running",
	})
}

// StartProduct starts a stopped product
func (h *Handler) StartProduct(c *fiber.Ctx) error {
	key := strings.ToLower(c.Params("name"))

	products := discoverProducts()
	var foundProduct *ProductConfig
	for _, p := range products {
		if p.Key == key || strings.ToLower(p.Name) == key {
			foundProduct = &p
			break
		}
	}

	if foundProduct == nil {
		return c.Status(404).JSON(fiber.Map{
			"error":   "Product not found",
			"product": key,
		})
	}

	log.Info().
		Str("product", foundProduct.Name).
		Msg("Starting product")

	// Execute docker compose up -d in the background
	go func() {
		cmd := exec.Command("docker", "compose", "up", "-d")
		cmd.Dir = foundProduct.ComposeDir
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Error().Err(err).Str("output", string(output)).Str("product", foundProduct.Name).Msg("Failed to start product")
		} else {
			log.Info().Str("product", foundProduct.Name).Msg("Product started successfully")
		}
	}()

	return c.Status(202).JSON(fiber.Map{
		"message": "Start command issued",
		"product": foundProduct.Name,
		"status":  "running",
	})
}

// StopProduct stops a running product
func (h *Handler) StopProduct(c *fiber.Ctx) error {
	key := strings.ToLower(c.Params("name"))

	products := discoverProducts()
	var foundProduct *ProductConfig
	for _, p := range products {
		if p.Key == key || strings.ToLower(p.Name) == key {
			foundProduct = &p
			break
		}
	}

	if foundProduct == nil {
		return c.Status(404).JSON(fiber.Map{
			"error":   "Product not found",
			"product": key,
		})
	}

	log.Info().
		Str("product", foundProduct.Name).
		Msg("Stopping product")

	// Execute docker compose stop in the background
	go func() {
		cmd := exec.Command("docker", "compose", "stop")
		cmd.Dir = foundProduct.ComposeDir
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Error().Err(err).Str("output", string(output)).Str("product", foundProduct.Name).Msg("Failed to stop product")
		} else {
			log.Info().Str("product", foundProduct.Name).Msg("Product stopped successfully")
		}
	}()

	return c.Status(202).JSON(fiber.Map{
		"message": "Stop command issued",
		"product": foundProduct.Name,
		"status":  "running",
	})
}

// RestartProduct restarts a product (stop + start)
func (h *Handler) RestartProduct(c *fiber.Ctx) error {
	key := strings.ToLower(c.Params("name"))

	products := discoverProducts()
	var foundProduct *ProductConfig
	for _, p := range products {
		if p.Key == key || strings.ToLower(p.Name) == key {
			foundProduct = &p
			break
		}
	}

	if foundProduct == nil {
		return c.Status(404).JSON(fiber.Map{
			"error":   "Product not found",
			"product": key,
		})
	}

	log.Info().
		Str("product", foundProduct.Name).
		Msg("Restarting product")

	// Execute docker compose restart in the background
	go func() {
		cmd := exec.Command("docker", "compose", "restart")
		cmd.Dir = foundProduct.ComposeDir
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Error().Err(err).Str("output", string(output)).Str("product", foundProduct.Name).Msg("Failed to restart product")
		} else {
			log.Info().Str("product", foundProduct.Name).Msg("Product restarted successfully")
		}
	}()

	return c.Status(202).JSON(fiber.Map{
		"message": "Restart command issued",
		"product": foundProduct.Name,
		"status":  "running",
	})
}

// GetProductMetrics proxies to a product's API to fetch metrics
func (h *Handler) GetProductMetrics(c *fiber.Ctx) error {
	key := strings.ToLower(c.Params("name"))
	path := c.Params("*")

	products := discoverProducts()
	var foundProduct *ProductConfig
	for _, p := range products {
		if p.Key == key || strings.ToLower(p.Name) == key {
			foundProduct = &p
			break
		}
	}

	if foundProduct == nil {
		return c.Status(404).JSON(fiber.Map{
			"error":   "Product not found",
			"product": key,
		})
	}

	if foundProduct.APIURL == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "Product does not have an API endpoint",
		})
	}

	targetURL := foundProduct.APIURL
	if path != "" {
		targetURL = foundProduct.APIURL + "/" + path
	} else {
		targetURL = foundProduct.APIURL + "/api/metrics"
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(targetURL)
	if err != nil {
		log.Warn().Err(err).Str("product", key).Str("url", targetURL).Msg("Failed to proxy to product API")
		return c.Status(502).JSON(fiber.Map{
			"error":   "Failed to connect to product API",
			"product": key,
			"url":     targetURL,
		})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to read response"})
	}

	var jsonData interface{}
	if err := json.Unmarshal(body, &jsonData); err == nil {
		return c.Status(resp.StatusCode).JSON(jsonData)
	}

	return c.Status(resp.StatusCode).SendString(string(body))
}

// GetAncientReportDashboard returns AncientReport metrics for MetalHive dashboard display
func (h *Handler) GetAncientReportDashboard(c *fiber.Ctx) error {
	products := discoverProducts()
	var arProduct *ProductConfig
	for _, p := range products {
		if p.Type == ProductTypeAncientReport {
			arProduct = &p
			break
		}
	}

	if arProduct == nil {
		return c.JSON(fiber.Map{
			"available": false,
			"message":   "AncientReport not found in " + ProductsBasePath,
		})
	}

	containers, _ := getDockerContainers()
	containerMap := make(map[string]DockerContainer)
	for _, cont := range containers {
		containerMap[cont.Name] = cont
	}

	status := checkProductStatusFromContainers(*arProduct, containerMap)

	if !status.Running {
		return c.JSON(fiber.Map{
			"available": false,
			"status":    status,
			"message":   "AncientReport is not running",
		})
	}

	client := &http.Client{Timeout: 5 * time.Second}
	hostname := c.Query("hostname", "")

	// Get servers list
	serversResp, _ := client.Get(arProduct.APIURL + "/api/servers")
	var servers interface{}
	if serversResp != nil {
		defer serversResp.Body.Close()
		json.NewDecoder(serversResp.Body).Decode(&servers)
	}

	// Get eBPF metrics
	metricsURL := arProduct.APIURL + "/api/v3/ebpf/metrics"
	if hostname != "" {
		metricsURL += "?hostname=" + hostname
	}
	metricsResp, err := client.Get(metricsURL)
	var metrics interface{}
	if err != nil {
		return c.JSON(fiber.Map{
			"available":   true,
			"api_healthy": true,
			"status":      status,
			"servers":     servers,
			"error":       "Failed to fetch eBPF metrics",
			"ui_url":      arProduct.UIURL,
			"api_url":     arProduct.APIURL,
		})
	}
	defer metricsResp.Body.Close()
	json.NewDecoder(metricsResp.Body).Decode(&metrics)

	// Get security dashboard
	securityURL := arProduct.APIURL + "/api/v3/security/dashboard"
	if hostname != "" {
		securityURL += "?hostname=" + hostname
	}
	securityResp, _ := client.Get(securityURL)
	var security interface{}
	if securityResp != nil {
		defer securityResp.Body.Close()
		json.NewDecoder(securityResp.Body).Decode(&security)
	}

	// Get per-server metrics breakdown
	perServerURL := arProduct.APIURL + "/api/v3/ebpf/metrics/by-server"
	perServerResp, _ := client.Get(perServerURL)
	var perServerMetrics interface{}
	if perServerResp != nil {
		defer perServerResp.Body.Close()
		json.NewDecoder(perServerResp.Body).Decode(&perServerMetrics)
	}

	return c.JSON(fiber.Map{
		"available":          true,
		"api_healthy":        true,
		"status":             status,
		"servers":            servers,
		"metrics":            metrics,
		"security":           security,
		"per_server_metrics": perServerMetrics,
		"ui_url":             arProduct.UIURL,
		"api_url":            arProduct.APIURL,
	})
}

// checkProductStatusFromContainers checks product status using DockerContainer type
func checkProductStatusFromContainers(product ProductConfig, containerMap map[string]DockerContainer) ProductStatus {
	status := ProductStatus{
		Name:          product.Name,
		Key:           product.Key,
		Type:          product.Type,
		Description:   product.Description,
		TotalExpected: len(product.Containers),
		Containers:    make([]ProductContainerStatus, 0),
		APIURL:        product.APIURL,
		UIURL:         product.UIURL,
		Icon:          product.Icon,
		Path:          product.ComposeDir,
	}

	composeExists := fileExists(filepath.Join(product.ComposeDir, "docker-compose.yml")) ||
		fileExists(filepath.Join(product.ComposeDir, "docker-compose.yaml"))
	status.Installed = composeExists

	runningCount := 0

	for _, pattern := range product.Containers {
		found := false
		for containerName, containerData := range containerMap {
			if strings.Contains(strings.ToLower(containerName), strings.ToLower(pattern)) ||
				strings.HasPrefix(containerName, pattern) {
				found = true
				cs := ProductContainerStatus{
					Name:    containerName,
					ID:      containerData.ID,
					Status:  containerData.Status,
					Running: containerData.State == "running",
					Image:   containerData.Image,
				}

				if len(cs.ID) > 12 {
					cs.ID = cs.ID[:12]
				}

				if cs.Running {
					runningCount++
				}

				status.Containers = append(status.Containers, cs)
				break
			}
		}

		if !found {
			status.Containers = append(status.Containers, ProductContainerStatus{
				Name:    pattern,
				Status:  "not_found",
				Running: false,
			})
		}
	}

	status.TotalRunning = runningCount
	status.Running = runningCount == len(product.Containers) && runningCount > 0
	status.PartialRunning = runningCount > 0 && runningCount < len(product.Containers)

	if status.Running && product.APIURL != "" {
		// MithrilLog instances have localhost-bound ports (127.0.0.1) for security,
		// so they're not reachable from Docker containers. Consider them healthy
		// if all expected containers are running.
		if product.Type == ProductTypeMithrilLog {
			status.APIHealthy = status.Running
		} else {
			status.APIHealthy = checkProductAPIHealth(product.APIURL)
		}
	}

	return status
}

// checkProductAPIHealth checks if a product's API is responding
func checkProductAPIHealth(apiURL string) bool {
	client := &http.Client{
		Timeout: 3 * time.Second,
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout: 2 * time.Second,
			}).DialContext,
		},
	}

	// Check root first (AncientReport returns health at /)
	// then try /health and /api/health for other services
	healthEndpoints := []string{"/", "/health", "/api/health", "/api/servers"}

	for _, endpoint := range healthEndpoints {
		resp, err := client.Get(apiURL + endpoint)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 400 {
				return true
			}
		}
	}

	return false
}
