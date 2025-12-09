# Xcr9 Products - Project Structure Reference

This document provides a comprehensive reference for navigating the three Xcr9 products.

---

## 🖥️ Production Server

**Server**: `ssh root@65.109.200.75`  
**Base Path**: `/home`

```
/home/
├── MetalHive/           # Docker Fleet Orchestrator
├── AncientReport/       # eBPF Observability
├── MithrilLog-xcr9/     # Log Analysis (xcr9)
├── MithrilLog-afranet/  # Log Analysis (afranet)
├── MithrilLog-ibscloud/ # Log Analysis (ibscloud)
├── MithrilLog-mj/       # Log Analysis (mj)
└── MithrilLog-tebyan/   # Log Analysis (tebyan)
```

---

## 📊 Overview

| Product | Purpose | Tech Stack | Default Ports |
|---------|---------|------------|---------------|
| **MetalHive** | Docker Fleet Orchestrator | Go/Rust/Python/Next.js | UI:3002, API:8080, AI:8082 |
| **AncientReport** | eBPF Observability | Rust/Python/React | UI:6080, API:6800 |
| **MithrilLog** | Log Analysis & LLM Summary | Python/Rust/FastAPI | API:9900 |

---

## 🐝 MetalHive

**Location**: `/Users/saeed/Library/Mobile Documents/com~apple~CloudDocs/saeed/Hive/MetalHive`

> AI-Powered Bare-Metal Docker Fleet Orchestrator

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MetalHive                                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │  Controller │  │   MetalMind │  │   Web UI    │                  │
│  │    (Go)     │  │  (Python)   │  │  (Next.js)  │                  │
│  │   :8080     │  │   :8082     │  │   :3002     │                  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│              ┌───────────┴───────────┐                              │
│              │    NATS JetStream     │                              │
│              │     + ClickHouse      │                              │
│              │     + DragonflyDB     │                              │
│              └───────────┬───────────┘                              │
│                          │                                          │
│         ┌────────────────┼────────────────┐                         │
│         ↓                ↓                ↓                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Agent     │  │   Agent     │  │   Agent     │                  │
│  │   (Rust)    │  │   (Rust)    │  │   (Rust)    │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│     Node 1           Node 2           Node N                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
MetalHive/
├── controller/           # Go - Central API & orchestration
│   ├── cmd/             # Main entry points
│   ├── internal/        # Business logic
│   │   ├── api/         # HTTP handlers (handlers.go, products.go)
│   │   ├── store/       # ClickHouse client
│   │   └── vault/       # HiveVault KV store
│   └── Dockerfile
├── agent/               # Rust - Node agent (deployed on each server)
│   ├── src/
│   └── Dockerfile
├── ai/                  # Python - MetalMind AI (Gemini-powered)
│   ├── src/
│   └── Dockerfile
├── ui/                  # Next.js - Web dashboard
│   ├── src/
│   │   ├── app/         # Next.js app router
│   │   ├── components/  # React components
│   │   ├── lib/         # Utilities
│   │   └── styles/      # CSS
│   └── Dockerfile
├── cli/                 # Rust - mhive CLI tool
├── infra/               # Infrastructure configs (NATS, ClickHouse, Caddy)
├── scripts/             # Deployment scripts
├── docker-compose.yaml  # Development environment
└── config.yaml          # Global configuration
```

### Services & Ports

| Container | Port | Purpose |
|-----------|------|---------|
| `metalhive-controller` | 8080 | Central API |
| `metalhive-ai` | 8082 | AI analysis engine |
| `metalhive-ui` | 3002 | Web dashboard |
| `metalhive-nats` | 4223 | Message bus |
| `metalhive-clickhouse` | 8124 | Time-series DB |
| `metalhive-dragonfly` | 6379 | Cache/KV store |

---

## 📈 AncientReport

> Autonomous eBPF-based System Observability Platform

### Directory Structure

```
AncientReport/
├── agent/               # Rust - eBPF-enabled system agent
│   ├── src/
│   └── Dockerfile
├── analysis/            # Python - AI analysis engine
│   ├── src/
│   └── Dockerfile
├── ui/                  # React/Vite - Dashboard
│   ├── src/
│   └── Dockerfile
├── deploy/              # Deployment scripts
├── docs/                # Documentation
├── docker-compose.yml           # Single-server deployment
├── docker-compose.central.yml   # Central server (distributed)
└── docker-compose.agent.yml     # Agent-only (distributed)
```

### Services & Ports

| Container | Port | Purpose |
|-----------|------|---------|
| `AncientReport-agent` | host network | eBPF metrics collector |
| `AncientReport-analysis` | 6800 | AI analysis API |
| `AncientReport-ui` | 6080 | Web dashboard |
| `AncientReport-nats` | 4222 | Streaming |
| `AncientReport-clickhouse` | 6123 | Metrics DB |

### Key API Endpoints

- `GET /api/metrics` - System metrics
- `GET /api/report` - Latest analysis
- `POST /api/analyze` - Trigger analysis
- `GET /api/servers` - List monitored servers

---

## 📜 MithrilLog

> Multi-tenant Log Analysis with LLM Summarization

### Directory Structure

```
MithrilLog/
├── src/
│   ├── ingester-rs/     # Rust - High-performance log ingester
│   └── mithrillog/      # Python - Core log processing
├── app/                 # FastAPI application
│   ├── main.py
│   ├── static/          # Dashboard assets
│   └── templates/       # HTML templates
├── admin-go/            # Go - Admin panel (high-performance)
├── configs/             # YAML configurations
├── prompts/             # LLM prompt templates
├── models/              # GGUF model weights
├── data/                # Runtime data
│   ├── buckets/         # Ingested log buckets
│   └── reports/         # Generated summaries
└── docker-compose.yml   # Deployment
```

### Services & Ports

| Container | Port | Purpose |
|-----------|------|---------|
| `orchestrator` | - | Log processing & LLM |
| `ingester` | 5515/udp, 5615/tcp | Log ingestion |
| `api` | 9900 | REST API & Dashboard |

### Key API Endpoints

- `GET /health` - Health check
- `GET /summaries/hourly` - Hourly log summaries
- `GET /summaries/daily` - Daily log summaries

---

## 🔗 Integration Points

### MetalHive as Orchestrator

MetalHive manages the other products via:

1. **Status Checking**: `GET /api/v1/products` - Lists all products with container status
2. **Installation**: `POST /api/v1/products/:name/install` - Deploy via docker-compose
3. **Metrics Integration**: `GET /api/v1/products/ancientreport/dashboard` - AncientReport metrics
4. **Log Forwarding**: All containers forward logs to MithrilLog via syslog

### Quick Reference Commands

```bash
# MetalHive
cd MetalHive && docker compose up -d
# UI: http://localhost:3002 | API: http://localhost:8080

# AncientReport
cd AncientReport && docker compose up -d
# UI: http://localhost:6080 | API: http://localhost:6800

# MithrilLog
cd MithrilLog && docker compose up -d
# Dashboard: http://localhost:9900
```
