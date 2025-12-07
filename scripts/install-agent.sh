#!/bin/bash
# ==============================================================================
# MetalHive Agent Installation Script
# ==============================================================================
# Usage: curl -fsSL https://get.metalhive.io/agent | bash -s -- --controller http://controller:8080
# Or: ./install-agent.sh --controller http://controller:8080 --hostname mynode
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "  __  __      _        _ _  _  _"
echo " |  \/  | ___| |_ __ _| | || || (_)_   _____"
echo " | |\/| |/ _ \ __/ _\` | | || || | \ \ / / _ \\"
echo " | |  | |  __/ || (_| | |__   _| |\ V /  __/"
echo " |_|  |_|\___|\__\__,_|_|  |_| |_| \_/ \___|"
echo ""
echo " Agent Installer"
echo -e "${NC}"

# Default values
CONTROLLER_URL=""
HOSTNAME=""
NATS_URL=""
LABELS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --controller)
            CONTROLLER_URL="$2"
            shift 2
            ;;
        --hostname)
            HOSTNAME="$2"
            shift 2
            ;;
        --nats)
            NATS_URL="$2"
            shift 2
            ;;
        --labels)
            LABELS="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$CONTROLLER_URL" ]; then
    echo -e "${RED}Error: --controller URL is required${NC}"
    echo "Usage: $0 --controller http://your-controller:8080 [--hostname mynode]"
    exit 1
fi

# Auto-detect hostname if not provided
if [ -z "$HOSTNAME" ]; then
    HOSTNAME=$(hostname)
    echo -e "${YELLOW}Using hostname: $HOSTNAME${NC}"
fi

# Derive NATS URL from controller URL if not provided
if [ -z "$NATS_URL" ]; then
    CONTROLLER_HOST=$(echo "$CONTROLLER_URL" | sed -e 's|http[s]*://||' -e 's|:.*||')
    NATS_URL="nats://${CONTROLLER_HOST}:4222"
    echo -e "${YELLOW}Using NATS URL: $NATS_URL${NC}"
fi

echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  Controller: $CONTROLLER_URL"
echo "  NATS:       $NATS_URL"
echo "  Hostname:   $HOSTNAME"
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is required but not installed.${NC}"
    echo "Install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

echo -e "${GREEN}✓ Docker detected${NC}"

# Check if agent already running
if docker ps --format '{{.Names}}' | grep -q "^metalhive-agent$"; then
    echo -e "${YELLOW}MetalHive agent is already running. Stopping...${NC}"
    docker stop metalhive-agent || true
    docker rm metalhive-agent || true
fi

# Create agent config directory
mkdir -p /etc/metalhive

# Create configuration file
cat > /etc/metalhive/agent.toml << EOF
# MetalHive Agent Configuration

[agent]
id = "$HOSTNAME"
hostname = "$HOSTNAME"

[controller]
url = "$CONTROLLER_URL"

[nats]
url = "$NATS_URL"

[metrics]
interval_secs = 10
enabled = true

[docker]
enabled = true
socket = "/var/run/docker.sock"

[logging]
level = "info"
EOF

echo -e "${GREEN}✓ Configuration saved to /etc/metalhive/agent.toml${NC}"

# Run agent container
echo -e "${BLUE}Starting MetalHive Agent...${NC}"

docker run -d \
    --name metalhive-agent \
    --restart unless-stopped \
    --privileged \
    --network host \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -v /etc/metalhive:/etc/metalhive:ro \
    -v /proc:/host/proc:ro \
    -v /sys:/host/sys:ro \
    -e METALHIVE_AGENT_ID="$HOSTNAME" \
    -e METALHIVE_CONTROLLER_URL="$CONTROLLER_URL" \
    -e METALHIVE_NATS_URL="$NATS_URL" \
    ghcr.io/xcr9/metalhive-agent:latest \
    || {
        echo -e "${YELLOW}Container image not available, using binary installation...${NC}"
        install_binary
    }

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          MetalHive Agent Installed Successfully!              ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Hostname:   $HOSTNAME ${NC}"
echo -e "${GREEN}║  Controller: $CONTROLLER_URL ${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "View logs: docker logs -f metalhive-agent"
echo ""
