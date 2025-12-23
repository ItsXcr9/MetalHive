# MetalHive

> 🐝 **AI-Powered Bare-Metal Docker Fleet Orchestrator**

MetalHive is a lightweight, intelligent control plane for managing containerized infrastructure across bare-metal servers and VMs without the complexity of Kubernetes.

## Features

- **🔍 Auto Node Discovery** — Zero-config LAN discovery via mDNS
- **📦 Fleet-Wide Container Management** — Portainer-style UI for all your nodes
- **🐚 HiveShell** — Ansible-like remote command execution with live status
- **🔐 HiveVault** — Central key-value config store (like etcd)
- **🤖 MetalMind AI** — Gemini-powered anomaly detection & auto-remediation
- **🔄 System Updates** — Fleet-wide OS and Docker upgrades
- **🏥 Health Monitoring** — Auto-restart crashed containers

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MetalHive                                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  Controller │  │   MetalMind │  │   Web UI    │                 │
│  │    (Go)     │  │  (Python)   │  │  (Next.js)  │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│              ┌───────────┴───────────┐                              │
│              │    NATS JetStream     │                              │
│              │     + ClickHouse      │                              │
│              └───────────┬───────────┘                              │
│                          │                                          │
│         ┌────────────────┼────────────────┐                         │
│         ↓                ↓                ↓                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Agent     │  │   Agent     │  │   Agent     │                 │
│  │   (Rust)    │  │   (Rust)    │  │   (Rust)    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│     Node 1           Node 2           Node N                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Development Environment

```bash
# Clone the repository
git clone https://github.com/xcr9/metalhive.git
cd metalhive

# Start development environment
make dev

# Or with Docker Compose
docker compose up -d
```

### Production Deployment

```bash
# Install on control plane server
curl -fsSL https://get.metalhive.io | bash

# Install agent on worker nodes
mhive agent install
```

## Components

| Component | Technology | Port | Description |
|-----------|------------|------|-------------|
| **Agent** | Rust + Tokio | - | Runs on each node, manages Docker |
| **Controller** | Go + Fiber | 8080 | Central API, orchestration logic |
| **MetalMind** | Python + FastAPI | 8081 | AI analysis, NLP, auto-remediation |
| **Web UI** | Next.js 15 | 3000 | Dashboard, container management |
| **CLI** | Rust + Clap | - | `mhive` command-line tool |
| **NATS** | JetStream | 4222 | Message bus, event streaming |
| **ClickHouse** | 24.x | 8123 | Time-series metrics, audit logs |
| **DragonflyDB** | Latest | 6379 | Cache, HiveVault key-value store |

## CLI Usage

```bash
# Node management
mhive nodes list
mhive nodes add 192.168.1.100

# Container operations
mhive ps
mhive logs nginx-proxy --follow
mhive deploy -f docker-compose.yaml

# Remote execution (HiveShell)
mhive run "apt update && apt upgrade -y"
mhive playbook run playbooks/upgrade-docker.yaml

# Configuration (HiveVault)
mhive config set /production/api/DATABASE_URL "postgres://..."
mhive config ls /production/

# AI operations
mhive ask "Why is server-02 slow?"
mhive analyze --last-24h

# System updates
mhive system update --os --rolling
mhive system update --docker
```

## Project Structure

```
MetalHive/
├── agent/          # Rust agent (runs on each node)
├── controller/     # Go controller (central brain)
├── ai/             # Python AI engine (MetalMind)
├── ui/             # Next.js web dashboard
├── cli/            # Rust CLI (mhive)
├── proto/          # Shared protobuf definitions
├── scripts/        # Deployment scripts
└── infra/          # Infrastructure configs
```

## Development

### Prerequisites

- Docker & Docker Compose
- Rust 1.83+
- Go 1.23+
- Node.js 22+
- Python 3.13+

### Build All Components

```bash
make build
```

### Run Tests

```bash
make test
```

### Lint

```bash
make lint
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Controller
CONTROLLER_PORT=8080
NATS_URL=nats://localhost:4222
CLICKHOUSE_URL=http://localhost:8123
DRAGONFLY_URL=redis://localhost:6379

# MetalMind AI
GEMINI_API_KEY=your-api-key
AI_PORT=8081

# Web UI
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## License & Enterprise

This software is licensed under the **Xcr9 Community License** - See [LICENSE](LICENSE)

- ✅ **Free** for personal and non-commercial use
- ✅ **Free** for small teams (up to 5 nodes)
- 🏢 **Enterprise License** required for commercial use with more than 5 nodes

### Get Enterprise License

Visit **[xcr9.site/pricing](https://xcr9.site/pricing.html)** to purchase an Enterprise license which includes:

- Unlimited nodes
- Priority support
- Custom integrations
- SLA guarantees
- Professional services

## Part of Xcr9 Platform

MetalHive is the third product in the [Xcr9](https://xcr9.site) AI infrastructure suite:

- **[MithrilLog](https://xcr9.site/mithrillog.html)** — AI-powered log management
- **[AncientReport](https://xcr9.site/ancientreport.html)** — Autonomous observability (eBPF)
- **[MetalHive](https://xcr9.site/metalhive.html)** — Bare-metal Docker orchestration

### Contact

- 🌐 Website: [xcr9.site](https://xcr9.site)
- 📧 Sales: [xcr9.site/contact](https://xcr9.site/contact.html)

---

*© 2025 Xcr9. Building the future of AI infrastructure.*
