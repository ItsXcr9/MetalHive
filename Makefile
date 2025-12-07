# =============================================================================
# MetalHive Makefile
# =============================================================================
# Usage:
#   make dev       - Start development environment
#   make build     - Build all components
#   make test      - Run all tests
#   make lint      - Lint all code
#   make clean     - Clean build artifacts
# =============================================================================

.PHONY: all dev build test lint clean help
.DEFAULT_GOAL := help

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

DOCKER_COMPOSE := docker compose
CARGO := cargo
GO := go
NPM := npm
PYTHON := python3

# Colors for output
GREEN  := \033[0;32m
YELLOW := \033[0;33m
BLUE   := \033[0;34m
NC     := \033[0m # No Color

# =============================================================================
# Main Targets
# =============================================================================

help: ## Show this help message
	@echo "$(BLUE)MetalHive - AI-Powered Bare-Metal Docker Fleet Orchestrator$(NC)"
	@echo ""
	@echo "$(YELLOW)Usage:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

all: build ## Build everything

# =============================================================================
# Development
# =============================================================================

dev: ## Start development environment
	@echo "$(BLUE)Starting development environment...$(NC)"
	$(DOCKER_COMPOSE) up -d nats clickhouse dragonfly
	@echo "$(GREEN)Infrastructure started!$(NC)"
	@echo "  NATS:       http://localhost:8222"
	@echo "  ClickHouse: http://localhost:8123"
	@echo "  DragonflyDB: localhost:6379"

dev-all: ## Start all services including controller, ai, and ui
	@echo "$(BLUE)Starting all services...$(NC)"
	$(DOCKER_COMPOSE) up -d --build
	@echo "$(GREEN)All services started!$(NC)"
	@echo "  Controller: http://localhost:8080"
	@echo "  AI Engine:  http://localhost:8081"
	@echo "  Web UI:     http://localhost:3000"

dev-down: ## Stop development environment
	@echo "$(YELLOW)Stopping development environment...$(NC)"
	$(DOCKER_COMPOSE) down

dev-logs: ## Show logs from all services
	$(DOCKER_COMPOSE) logs -f

dev-clean: ## Stop and remove all containers, volumes
	@echo "$(YELLOW)Cleaning up development environment...$(NC)"
	$(DOCKER_COMPOSE) down -v --remove-orphans

# =============================================================================
# Build
# =============================================================================

build: build-agent build-controller build-ai build-ui build-cli ## Build all components
	@echo "$(GREEN)All components built!$(NC)"

build-agent: ## Build the Rust agent
	@echo "$(BLUE)Building agent...$(NC)"
	cd agent && $(CARGO) build --release

build-controller: ## Build the Go controller
	@echo "$(BLUE)Building controller...$(NC)"
	cd controller && $(GO) build -o bin/controller ./cmd/controller

build-ai: ## Build the Python AI engine
	@echo "$(BLUE)Building AI engine...$(NC)"
	cd ai && pip install -e .

build-ui: ## Build the Next.js UI
	@echo "$(BLUE)Building UI...$(NC)"
	cd ui && $(NPM) install && $(NPM) run build

build-cli: ## Build the Rust CLI
	@echo "$(BLUE)Building CLI...$(NC)"
	cd cli && $(CARGO) build --release
	@echo "$(GREEN)CLI built at: cli/target/release/mhive$(NC)"

# =============================================================================
# Docker Build
# =============================================================================

docker-build: ## Build all Docker images
	@echo "$(BLUE)Building Docker images...$(NC)"
	$(DOCKER_COMPOSE) build

docker-push: ## Push Docker images to registry
	@echo "$(BLUE)Pushing Docker images...$(NC)"
	$(DOCKER_COMPOSE) push

# =============================================================================
# Test
# =============================================================================

test: test-agent test-controller test-ai test-ui ## Run all tests
	@echo "$(GREEN)All tests passed!$(NC)"

test-agent: ## Run agent tests
	@echo "$(BLUE)Testing agent...$(NC)"
	cd agent && $(CARGO) test

test-controller: ## Run controller tests
	@echo "$(BLUE)Testing controller...$(NC)"
	cd controller && $(GO) test ./...

test-ai: ## Run AI engine tests
	@echo "$(BLUE)Testing AI engine...$(NC)"
	cd ai && $(PYTHON) -m pytest tests/

test-ui: ## Run UI tests
	@echo "$(BLUE)Testing UI...$(NC)"
	cd ui && $(NPM) test

# =============================================================================
# Lint
# =============================================================================

lint: lint-agent lint-controller lint-ai lint-ui ## Lint all code
	@echo "$(GREEN)All linting passed!$(NC)"

lint-agent: ## Lint agent code
	@echo "$(BLUE)Linting agent...$(NC)"
	cd agent && $(CARGO) clippy -- -D warnings
	cd agent && $(CARGO) fmt --check

lint-controller: ## Lint controller code
	@echo "$(BLUE)Linting controller...$(NC)"
	cd controller && go vet ./...
	cd controller && golangci-lint run

lint-ai: ## Lint AI engine code
	@echo "$(BLUE)Linting AI engine...$(NC)"
	cd ai && ruff check .
	cd ai && ruff format --check .

lint-ui: ## Lint UI code
	@echo "$(BLUE)Linting UI...$(NC)"
	cd ui && $(NPM) run lint

# =============================================================================
# Format
# =============================================================================

fmt: fmt-agent fmt-controller fmt-ai fmt-ui ## Format all code
	@echo "$(GREEN)All code formatted!$(NC)"

fmt-agent: ## Format agent code
	cd agent && $(CARGO) fmt

fmt-controller: ## Format controller code
	cd controller && go fmt ./...

fmt-ai: ## Format AI engine code
	cd ai && ruff format .

fmt-ui: ## Format UI code
	cd ui && $(NPM) run format

# =============================================================================
# Clean
# =============================================================================

clean: ## Clean all build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf agent/target
	rm -rf controller/bin
	rm -rf ui/.next ui/node_modules
	rm -rf cli/target
	rm -rf ai/.venv ai/__pycache__ ai/src/**/__pycache__
	@echo "$(GREEN)Cleaned!$(NC)"

# =============================================================================
# Installation
# =============================================================================

install-cli: build-cli ## Install CLI to /usr/local/bin
	@echo "$(BLUE)Installing mhive CLI...$(NC)"
	sudo cp cli/target/release/mhive /usr/local/bin/
	@echo "$(GREEN)Installed! Run 'mhive --help' to get started.$(NC)"

# =============================================================================
# Database
# =============================================================================

db-migrate: ## Run database migrations
	@echo "$(BLUE)Running migrations...$(NC)"
	$(DOCKER_COMPOSE) exec clickhouse clickhouse-client --queries-file=/docker-entrypoint-initdb.d/init.sql

db-shell: ## Open ClickHouse shell
	$(DOCKER_COMPOSE) exec clickhouse clickhouse-client

redis-shell: ## Open DragonflyDB shell
	$(DOCKER_COMPOSE) exec dragonfly redis-cli

# =============================================================================
# Protobuf
# =============================================================================

proto: ## Generate protobuf code
	@echo "$(BLUE)Generating protobuf code...$(NC)"
	protoc --go_out=controller/internal/proto --go-grpc_out=controller/internal/proto proto/*.proto
	@echo "$(GREEN)Protobuf code generated!$(NC)"
