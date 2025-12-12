# Metrics Separation Proposal

**Date:** 2025-12-12  
**Status:** Draft  
**Author:** System  

---

## Overview

This proposal outlines the separation of metrics responsibilities between **MetalHive** (orchestration platform) and **AncientReport** (deep observability platform).

### Current State
- Both platforms collect and display detailed metrics
- Duplication of effort in metrics collection and UI
- MetalHive has a full MetricsPanel with advanced network, CPU, memory charts

### Proposed State
- **AncientReport**: Full metrics panel with all advanced observability features
- **MetalHive**: Basic metrics overview only, linking to AncientReport for details

---

## Goals

1. **Reduce complexity** in MetalHive by removing advanced metrics code
2. **Single source of truth** for deep metrics (AncientReport)
3. **Better user experience** with clear separation of concerns
4. **Easier maintenance** with fewer duplicated features

---

## Proposed Changes

### MetalHive UI Changes

#### Keep (Basic Metrics Only)
- Node status (online/offline)
- Basic CPU/Memory usage percentage (single value, not charts)
- Container count per node
- Quick health indicator badges

#### Remove
- [ ] `ui/src/components/MetricsPanel.tsx` - Full metrics charts
- [ ] Network latency charts
- [ ] Disk I/O charts
- [ ] Connection rate charts
- [ ] Historical time-series data

#### Add
- [ ] Link/embed button: "View Advanced Metrics in AncientReport"
- [ ] Basic stats cards showing:
  - CPU: `45%`
  - Memory: `62%`
  - Containers: `12 running`
  - Status: `Healthy`

### MetalHive Backend Changes (Go Controller)

#### File: `controller/internal/api/handlers.go`

**Remove endpoints:**
- [ ] `GET /api/nodes/{id}/metrics/history` - Time-series charts data
- [ ] `GET /api/nodes/{id}/metrics/network` - Network latency/connections
- [ ] `GET /api/nodes/{id}/metrics/disk` - Disk I/O charts
- [ ] `GET /api/nodes/{id}/metrics/processes` - Top processes

**Keep endpoints:**
- `GET /api/nodes` - Node list with basic stats
- `GET /api/nodes/{id}` - Node detail with basic CPU/Memory %
- `GET /api/nodes/{id}/containers` - Container list

**Simplify response:**
```go
// Before: Full metrics object with history
type NodeStats struct {
    CPU     []TimeSeriesPoint  // REMOVE
    Memory  []TimeSeriesPoint  // REMOVE
    Network NetworkMetrics     // REMOVE
}

// After: Simple current values only
type NodeStats struct {
    CPUPercent    float64 `json:"cpu_percent"`
    MemoryPercent float64 `json:"memory_percent"`
    ContainerCount int    `json:"container_count"`
    Status        string  `json:"status"`
}
```

#### File: `controller/internal/store/clickhouse.go`

**Simplify queries:**
```sql
-- Before: Complex time-series aggregation
SELECT timestamp, avg(value) FROM metrics WHERE ... GROUP BY timestamp

-- After: Just latest values
SELECT argMax(value, timestamp) as latest_value 
FROM metrics 
WHERE metric_name IN ('cpu_usage_percent', 'memory_usage_percent')
  AND hostname = ?
```

---

### MetalHive UI Changes (React/Next.js)

#### File: `ui/src/components/MetricsPanel.tsx`

**Action: REPLACE with BasicStatsCard**

```tsx
// NEW: BasicStatsCard.tsx
interface BasicStatsProps {
  nodeId: string;
  hostname: string;
  cpuPercent: number;
  memoryPercent: number;
  containerCount: number;
  status: 'healthy' | 'warning' | 'critical';
  ancientReportUrl: string;
}

export function BasicStatsCard({ ... }: BasicStatsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <StatBox label="CPU" value={`${cpuPercent}%`} />
      <StatBox label="Memory" value={`${memoryPercent}%`} />
      <StatBox label="Containers" value={containerCount} />
      <StatBox label="Status" value={status} />
      
      <a href={`${ancientReportUrl}?server=${hostname}`} 
         target="_blank" 
         className="col-span-4 btn btn-primary">
        📊 View Advanced Metrics in AncientReport
      </a>
    </div>
  );
}
```

#### File: `ui/src/components/NodesPanel.tsx`

**Changes:**
- Remove `<MetricsPanel>` import and usage
- Add `<BasicStatsCard>` in node detail view
- Update to fetch only basic stats from API

---

### AncientReport (No Changes)

Keep the full MetricsPanel with:
- ✅ CPU/Memory/Disk charts
- ✅ Network latency (p50/p90/p99)
- ✅ Connection rates
- ✅ Top processes
- ✅ Active flows
- ✅ Historical data

---

## UI Mock: MetalHive Basic Stats

```
┌─────────────────────────────────────────────────────────────┐
│  Node: xcr9                                        [Healthy]│
├─────────────────────────────────────────────────────────────┤
│  CPU: 45%  │  Memory: 62%  │  Containers: 12  │  Uptime: 5d │
├─────────────────────────────────────────────────────────────┤
│  [🔗 View Advanced Metrics in AncientReport]                │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Update MetalHive UI
1. Create new `BasicStatsCard.tsx` component
2. Add "View in AncientReport" link using configured URL
3. Remove advanced charts from node details view

### Phase 2: Clean Up MetalHive Backend
1. Remove unused metrics endpoints from controller
2. Simplify ClickHouse queries to latest values only
3. Update API documentation

### Phase 3: Verify Integration
1. Test AncientReport link opens correct server view
2. Ensure basic stats still display correctly
3. Verify no broken UI components

---

## Files to Modify

| Project | File | Action |
|---------|------|--------|
| MetalHive | `ui/src/components/MetricsPanel.tsx` | REMOVE or simplify |
| MetalHive | `ui/src/components/NodesPanel.tsx` | Update to use BasicStats |
| MetalHive | `ui/src/components/BasicStatsCard.tsx` | CREATE |
| MetalHive | `controller/internal/api/handlers.go` | Simplify metrics endpoints |

---

## Questions for Review

1. Should the AncientReport link open in a new tab or embed as iframe?
2. What specific basic stats should MetalHive show? (CPU, Memory, Containers, ?)
3. Should we keep any historical data in MetalHive or fully defer to AncientReport?

---

## Approval

- [ ] Reviewed by: ___________
- [ ] Approved: ___________
- [ ] Ready to implement: ___________
