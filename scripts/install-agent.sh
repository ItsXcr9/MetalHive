#!/bin/bash
# MetalHive Agent Installation Script
# Run this on any server you want to monitor
#
# Usage: 
#   curl -sSL http://YOUR_SERVER/install-agent.sh | bash -s -- CENTRAL_IP
#   or
#   ./install-agent.sh 65.109.200.75

set -e

CENTRAL_SERVER_IP="${1:-65.109.200.75}"
INSTALL_DIR="/opt/metalhive-agent"
NATS_PORT="${2:-4222}"
CLICKHOUSE_PORT="${3:-6123}"

echo "========================================"
echo "   MetalHive Agent Installer"
echo "========================================"
echo "Central Server: ${CENTRAL_SERVER_IP}"
echo "Install Directory: ${INSTALL_DIR}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker installed successfully"
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose not available. Please install Docker Compose v2."
    exit 1
fi

echo "✅ Docker is installed"

# Create installation directory
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# Create docker-compose file
cat > docker-compose.yaml << EOF
# MetalHive Agent - Auto-generated
# Connects to central server at ${CENTRAL_SERVER_IP}

services:
  agent:
    image: ghcr.io/your-org/ancientreport-agent:latest
    container_name: metalhive-agent
    hostname: $(hostname)
    network_mode: host
    pid: "host"
    privileged: true
    environment:
      TZ: $(cat /etc/timezone 2>/dev/null || echo "UTC")
      NATS_URL: nats://${CENTRAL_SERVER_IP}:${NATS_PORT}
      CLICKHOUSE_HOST: ${CENTRAL_SERVER_IP}
      CLICKHOUSE_PORT: ${CLICKHOUSE_PORT}
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
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
EOF

echo "✅ Configuration created at ${INSTALL_DIR}/docker-compose.yaml"

# Test connectivity to central server
echo "Testing connectivity to central server..."
if nc -z -w 5 "${CENTRAL_SERVER_IP}" "${NATS_PORT}" 2>/dev/null; then
    echo "✅ NATS connection OK"
else
    echo "⚠️  Cannot reach NATS at ${CENTRAL_SERVER_IP}:${NATS_PORT}"
    echo "   Make sure the firewall allows this connection"
fi

if nc -z -w 5 "${CENTRAL_SERVER_IP}" "${CLICKHOUSE_PORT}" 2>/dev/null; then
    echo "✅ ClickHouse connection OK"
else
    echo "⚠️  Cannot reach ClickHouse at ${CENTRAL_SERVER_IP}:${CLICKHOUSE_PORT}"
    echo "   Make sure the firewall allows this connection"
fi

# Start the agent
echo ""
echo "Starting MetalHive agent..."
docker compose pull 2>/dev/null || echo "Using local build"
docker compose up -d

echo ""
echo "========================================"
echo "   Installation Complete!"
echo "========================================"
echo ""
echo "Agent Status:"
docker compose ps
echo ""
echo "View logs: cd ${INSTALL_DIR} && docker compose logs -f"
echo "Stop agent: cd ${INSTALL_DIR} && docker compose down"
echo ""
