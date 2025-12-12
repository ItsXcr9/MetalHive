# MetalHive vs AncientReport Architecture

## Current Setup: Two Separate Systems

You're correct - there are **two separate ClickHouse and NATS instances** running:

| Service | MetalHive | AncientReport |
|---------|-----------|---------------|
| **ClickHouse** | `metalhive-clickhouse` (ports 8124, 9001) | `AncientReport-clickhouse` (ports 6123, 6001) |
| **NATS** | `metalhive-nats` (port 4223) | `AncientReport-nats` (ports 4222, 8222) |
| **UI** | `metalhive-ui` (port 3002) | `AncientReport-ui` (port 6080) |

---

## What Each Service Does

### MetalHive Services

| Service | Purpose |
|---------|---------|
| **metalhive-controller** | Orchestration engine. Manages containers, deployments, HiveShell commands, node registration |
| **metalhive-ai** | AI assistant for DevOps automation |
| **metalhive-nats** | Message broker for agent ↔ controller communication (commands, heartbeats) |
| **metalhive-clickhouse** | Stores node registry, container state, command logs, orchestration data |
| **metalhive-dragonfly** | Redis-compatible cache for sessions, real-time state |
| **metalhive-ui** | Dashboard for orchestration, HiveShell, container management |

### AncientReport Services

| Service | Purpose |
|---------|---------|
| **AncientReport-agent** | Collects metrics from servers (CPU, memory, network, processes) |
| **AncientReport-analysis** | Processes metrics, calculates trends, detects anomalies |
| **AncientReport-nats** | Message broker for agent → analysis data flow |
| **AncientReport-clickhouse** | Stores time-series metrics, network flows, historical data |
| **AncientReport-ui** | Deep observability dashboard with charts, trends, drilldowns |

---

## Key Difference

| Aspect | MetalHive | AncientReport |
|--------|-----------|---------------|
| **Focus** | **Orchestration** (deploy, manage, command) | **Observability** (monitor, analyze, alert) |
| **Data** | Container state, commands, deployments | Metrics, network flows, system health |
| **Actions** | HiveShell, HiveVault, HiveRegistry, deployments | Charts, trends, anomalies, process drilldown |

---

## Why Two of Everything?

Currently, they are **independent systems**. Options:

### Option A: Keep Separate (Current)
- ✅ Clean separation of concerns
- ✅ Can scale independently
- ❌ Duplicated infrastructure (more resources)

### Option B: Share Infrastructure
Could merge:
- Use **one NATS** for both
- Use **one ClickHouse** with separate databases

### Option C: Merge into One Platform
- Combine MetalHive + AncientReport into unified platform
- Single ClickHouse, single NATS
- One UI with both orchestration + observability

---

## Current MetalHive ClickHouse Data

```sql
-- Node registry (from hive-agent heartbeats)
SELECT * FROM metalhive.nodes;

-- Containers managed
SELECT * FROM metalhive.containers;

-- Command execution logs  
SELECT * FROM metalhive.command_logs;

-- Deployment history
SELECT * FROM metalhive.deployments;
```

## Current AncientReport ClickHouse Data

```sql
-- Time-series metrics (CPU, memory, disk, network)
SELECT * FROM AncientReport.metrics;

-- Network flows and connections
SELECT * FROM AncientReport.network_flows;

-- Hourly aggregated reports
SELECT * FROM AncientReport.hourly_reports;
```

---

## Recommendation

**For your proposal to move all monitoring to AncientReport:**

1. MetalHive UI should show **zero charts/metrics** - ✅ Done
2. MetalHive UI links to AncientReport for metrics - ✅ Done  
3. MetalHive ClickHouse still needed for **orchestration data** (nodes, containers, commands)
4. MetalHive NATS still needed for **command/response messaging** with agents
