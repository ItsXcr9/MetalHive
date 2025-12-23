package api

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/ssh"
)

// DeployAgentRequest contains SSH credentials for remote deployment
type DeployAgentRequest struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	Password    string `json:"password,omitempty"`
	PrivateKey  string `json:"privateKey,omitempty"`
	CentralIP   string `json:"centralIp"`   // Central server IP for agent to connect to
	NATSPort    int    `json:"natsPort"`    // Default 4222
	CHPort      int    `json:"chPort"`      // ClickHouse port, default 6123
}

// DeployAgentResponse contains the deployment result
type DeployAgentResponse struct {
	Success  bool   `json:"success"`
	Message  string `json:"message"`
	Hostname string `json:"hostname,omitempty"`
	Output   string `json:"output,omitempty"`
	Error    string `json:"error,omitempty"`
}

// DeployAgent deploys the MetalHive agent to a remote server via SSH
func (h *Handler) DeployAgent(c *fiber.Ctx) error {
	var req DeployAgentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
	}

	// Validate required fields
	if req.Host == "" || req.Username == "" {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "Host and username are required",
		})
	}

	if req.Password == "" && req.PrivateKey == "" {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "Either password or privateKey is required",
		})
	}

	// Set defaults
	if req.Port == 0 {
		req.Port = 22
	}
	if req.CentralIP == "" {
		req.CentralIP = os.Getenv("SERVER_IP")
	}
	if req.NATSPort == 0 {
		req.NATSPort = 4222
	}
	if req.CHPort == 0 {
		req.CHPort = 6123
	}

	log.Info().
		Str("host", req.Host).
		Str("username", req.Username).
		Str("centralIP", req.CentralIP).
		Msg("Deploying agent to remote server")

	// Connect via SSH
	config := &ssh.ClientConfig{
		User:            req.Username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // TODO: Improve security
		Timeout:         30 * time.Second,
	}

	if req.Password != "" {
		config.Auth = []ssh.AuthMethod{
			ssh.Password(req.Password),
		}
	} else if req.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(req.PrivateKey))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid private key: " + err.Error(),
			})
		}
		config.Auth = []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		}
	}

	address := fmt.Sprintf("%s:%d", req.Host, req.Port)
	client, err := ssh.Dial("tcp", address, config)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false,
			"error":   "SSH connection failed: " + err.Error(),
		})
	}
	defer client.Close()

	// Get hostname
	session, err := client.NewSession()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to create SSH session: " + err.Error(),
		})
	}
	hostnameBytes, err := session.Output("hostname")
	session.Close()
	hostname := strings.TrimSpace(string(hostnameBytes))
	if err != nil || hostname == "" {
		hostname = req.Host
	}

	// Build the install script
	installScript := fmt.Sprintf(`
set -e
CENTRAL_IP="%s"
NATS_PORT="%d"
CH_PORT="%d"
INSTALL_DIR="/opt/metalhive-agent"

echo "Installing MetalHive agent..."
echo "Central Server: ${CENTRAL_IP}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Create install directory
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# Create docker-compose
cat > docker-compose.yaml << 'DOCKEREOF'
services:
  agent:
    image: ghcr.io/itsxcr9/ancientreport/agent:latest
    container_name: metalhive-agent
    hostname: %s
    network_mode: host
    pid: "host"
    privileged: true
    environment:
      TZ: UTC
      NATS_URL: nats://%s:%d
      CLICKHOUSE_HOST: %s
      CLICKHOUSE_PORT: %d
      CLICKHOUSE_DB: AncientReport
      CLICKHOUSE_USER: AncientReport
      CLICKHOUSE_PASSWORD: AncientReport
      NATS_ENABLED: "true"
    volumes:
      - /sys/kernel/debug:/sys/kernel/debug:ro
      - /sys/fs/bpf:/sys/fs/bpf:ro
      - /proc:/host/proc:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
DOCKEREOF

echo "Starting agent..."
docker compose pull 2>/dev/null || true
docker compose up -d

echo "Agent deployed successfully!"
docker compose ps
`, req.CentralIP, req.NATSPort, req.CHPort,
		hostname, req.CentralIP, req.NATSPort, req.CentralIP, req.CHPort)

	// Execute the install script
	session2, err := client.NewSession()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to create SSH session: " + err.Error(),
		})
	}
	defer session2.Close()

	output, err := session2.CombinedOutput("bash -c '" + strings.ReplaceAll(installScript, "'", "'\"'\"'") + "'")
	if err != nil {
		log.Error().
			Err(err).
			Str("host", req.Host).
			Str("output", string(output)).
			Msg("Agent deployment failed")
		return c.Status(500).JSON(DeployAgentResponse{
			Success:  false,
			Message:  "Deployment failed",
			Hostname: hostname,
			Output:   string(output),
			Error:    err.Error(),
		})
	}

	log.Info().
		Str("host", req.Host).
		Str("hostname", hostname).
		Msg("Agent deployed successfully")

	return c.JSON(DeployAgentResponse{
		Success:  true,
		Message:  "Agent deployed successfully",
		Hostname: hostname,
		Output:   string(output),
	})
}

// TestSSHConnection tests SSH connectivity without deploying
func (h *Handler) TestSSHConnection(c *fiber.Ctx) error {
	var req DeployAgentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body",
		})
	}

	if req.Host == "" || req.Username == "" {
		return c.Status(400).JSON(fiber.Map{
			"success": false,
			"error":   "Host and username are required",
		})
	}

	if req.Port == 0 {
		req.Port = 22
	}

	config := &ssh.ClientConfig{
		User:            req.Username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	if req.Password != "" {
		config.Auth = []ssh.AuthMethod{ssh.Password(req.Password)}
	} else if req.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(req.PrivateKey))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid private key"})
		}
		config.Auth = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	}

	address := fmt.Sprintf("%s:%d", req.Host, req.Port)
	client, err := ssh.Dial("tcp", address, config)
	if err != nil {
		return c.JSON(fiber.Map{
			"success": false,
			"error":   "Connection failed: " + err.Error(),
		})
	}
	defer client.Close()

	// Get system info
	session, _ := client.NewSession()
	hostnameBytes, _ := session.Output("hostname")
	session.Close()
	hostname := strings.TrimSpace(string(hostnameBytes))

	session2, _ := client.NewSession()
	osInfo, _ := session2.Output("cat /etc/os-release | grep PRETTY_NAME | cut -d'\"' -f2")
	session2.Close()

	session3, _ := client.NewSession()
	dockerVersion, _ := session3.Output("docker --version 2>/dev/null || echo 'Docker not installed'")
	session3.Close()

	return c.JSON(fiber.Map{
		"success":       true,
		"hostname":      hostname,
		"os":            strings.TrimSpace(string(osInfo)),
		"dockerVersion": strings.TrimSpace(string(dockerVersion)),
	})
}
