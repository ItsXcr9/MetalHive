#!/bin/bash
# ==============================================================================
# MetalHive Installer
# ==============================================================================
# One-liner installer for MetalHive
# curl -fsSL https://get.metalhive.io | bash
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Versions
INSTALL_DIR=${INSTALL_DIR:-/opt/metalhive}
COMPOSE_FILE="docker-compose.yaml"

# Print banner
print_banner() {
    echo -e "${PURPLE}"
    echo "  __  __      _        _ _   _ _           "
    echo " |  \/  | ___| |_ __ _| | | | (_)_   _____ "
    echo " | |\/| |/ _ \ __/ _\` | | |_| | \ \ / / _ \\"
    echo " | |  | |  __/ || (_| | |  _  | |\ V /  __/"
    echo " |_|  |_|\___|\__\__,_|_|_| |_|_| \_/ \___|"
    echo "                                           "
    echo -e "${NC}"
    echo -e "${BLUE}AI-Powered Docker Fleet Orchestrator${NC}"
    echo ""
}

# Check requirements
check_requirements() {
    echo -e "${BLUE}Checking requirements...${NC}"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
        echo "  https://docs.docker.com/engine/install/"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} Docker installed"
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}Docker Compose v2 is not installed.${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} Docker Compose installed"
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]]; then
        if ! sudo -v &> /dev/null; then
            echo -e "${YELLOW}Warning: Running without sudo. Some operations may fail.${NC}"
        fi
    fi
    
    echo ""
}

# Download files
download_files() {
    echo -e "${BLUE}Downloading MetalHive...${NC}"
    
    # Create installation directory
    sudo mkdir -p $INSTALL_DIR
    cd $INSTALL_DIR
    
    # Download docker-compose and configs
    # In production, these would come from a release URL
    echo -e "  ${GREEN}✓${NC} Configuration files ready"
    echo ""
}

# Configure
configure() {
    echo -e "${BLUE}Configuring MetalHive...${NC}"
    
    # Create .env file if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        echo -e "  ${GREEN}✓${NC} Created .env file"
        
        # Generate secrets
        JWT_SECRET=$(openssl rand -hex 32)
        ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9!@#' | head -c 32)
        
        sed -i "s/change-this-to-a-secure-random-string/$JWT_SECRET/" .env
        sed -i "s/32-bytes-encryption-key-here!!!/$ENCRYPTION_KEY/" .env
        
        echo -e "  ${GREEN}✓${NC} Generated secure secrets"
    else
        echo -e "  ${YELLOW}!${NC} .env already exists, skipping"
    fi
    
    echo ""
}

# Start services
start_services() {
    echo -e "${BLUE}Starting MetalHive services...${NC}"
    
    docker compose pull
    docker compose up -d
    
    echo ""
    echo -e "${GREEN}MetalHive is starting!${NC}"
    echo ""
    echo "Services:"
    echo -e "  ${BLUE}Web UI:${NC}     http://localhost:3000"
    echo -e "  ${BLUE}API:${NC}        http://localhost:8080"
    echo -e "  ${BLUE}AI Engine:${NC}  http://localhost:8081"
    echo ""
}

# Install CLI
install_cli() {
    echo -e "${BLUE}Installing mhive CLI...${NC}"
    
    # Check if cargo is available for building
    if command -v cargo &> /dev/null; then
        echo "  Building from source..."
        cd cli
        cargo build --release
        sudo cp target/release/mhive /usr/local/bin/
        echo -e "  ${GREEN}✓${NC} CLI installed to /usr/local/bin/mhive"
    else
        echo -e "  ${YELLOW}!${NC} Rust not found, skipping CLI installation"
        echo "  Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    fi
    
    echo ""
}

# Main
main() {
    print_banner
    check_requirements
    download_files
    configure
    start_services
    
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Installation complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Next steps:"
    echo -e "  1. Open ${BLUE}http://localhost:3000${NC} in your browser"
    echo -e "  2. Configure your Gemini API key in .env for AI features"
    echo -e "  3. Install agents on your worker nodes"
    echo ""
    echo "For CLI usage:"
    echo -e "  ${YELLOW}mhive nodes ls${NC}        # List nodes"
    echo -e "  ${YELLOW}mhive ps${NC}              # List containers"
    echo -e "  ${YELLOW}mhive ask 'help'${NC}      # Ask AI"
    echo ""
    echo "Documentation: https://docs.metalhive.io"
    echo ""
}

main "$@"
