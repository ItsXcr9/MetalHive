//! Metrics collection module
//!
//! Collects system and container metrics and publishes them to NATS

use crate::AgentState;
use std::sync::Arc;
use sysinfo::{Disks, System};
use tokio::sync::RwLock;
use tracing::{debug, error, info};

/// System metrics snapshot
#[derive(Debug, serde::Serialize)]
pub struct SystemMetrics {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub hostname: String,
    pub cpu_usage_percent: f32,
    pub memory_total_mb: u64,
    pub memory_used_mb: u64,
    pub memory_usage_percent: f32,
    pub disk_total_gb: u64,
    pub disk_used_gb: u64,
    pub disk_usage_percent: f32,
    pub load_avg_1m: f64,
    pub load_avg_5m: f64,
    pub load_avg_15m: f64,
    pub uptime_seconds: u64,
}

/// Container metrics snapshot
#[derive(Debug, serde::Serialize)]
pub struct ContainerMetrics {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub hostname: String,
    pub container_id: String,
    pub container_name: String,
    pub cpu_percent: f64,
    pub memory_usage_mb: f64,
    pub memory_limit_mb: f64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub disk_read_bytes: u64,
    pub disk_write_bytes: u64,
}

/// Main metrics collection loop
pub async fn collection_loop(state: Arc<RwLock<AgentState>>, interval_secs: u64) {
    // Use System::new() instead of System::new_all() to avoid loading process list
    // This prevents unbounded memory growth from accumulating dead process entries
    let mut sys = System::new();
    let mut disks = Disks::new_with_refreshed_list();
    let interval = tokio::time::Duration::from_secs(interval_secs);
    
    info!(interval_secs = interval_secs, "Starting metrics collection loop");
    
    loop {
        // Only refresh CPU and memory - NOT processes
        // refresh_all() causes memory leak by accumulating dead process entries
        // that are never cleared from the internal HashMap
        sys.refresh_cpu_all();
        sys.refresh_memory();
        disks.refresh();
        
        let state = state.read().await;
        
        // Collect system metrics
        let system_metrics = collect_system_metrics(&sys, &disks, &state.hostname);
        debug!(metrics = ?system_metrics, "Collected system metrics");
        
        // Publish to NATS if connected
        if let Some(ref nats) = state.nats_client {
            let subject = format!("metalhive.metrics.system.{}", state.hostname);
            if let Ok(payload) = serde_json::to_vec(&system_metrics) {
                if let Err(e) = nats.publish(subject, bytes::Bytes::from(payload)).await {
                    error!(error = %e, "Failed to publish system metrics");
                }
            }
        }
        
        // Collect container metrics
        match collect_container_metrics(&state.docker_client, &state.hostname).await {
            Ok(container_metrics) => {
                debug!(count = container_metrics.len(), "Collected container metrics");
                
                if let Some(ref nats) = state.nats_client {
                    for cm in container_metrics {
                        let subject = format!("metalhive.metrics.container.{}", state.hostname);
                        if let Ok(payload) = serde_json::to_vec(&cm) {
                            if let Err(e) = nats.publish(subject.clone(), bytes::Bytes::from(payload)).await {
                                error!(error = %e, "Failed to publish container metrics");
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!(error = %e, "Failed to collect container metrics");
            }
        }
        
        drop(state);
        tokio::time::sleep(interval).await;
    }
}

/// Collect system-level metrics
fn collect_system_metrics(sys: &System, disks: &Disks, hostname: &str) -> SystemMetrics {
    let cpu_usage = sys.global_cpu_usage();
    
    let memory_total = sys.total_memory() / 1024 / 1024; // MB
    let memory_used = sys.used_memory() / 1024 / 1024;
    let memory_percent = if memory_total > 0 {
        (memory_used as f32 / memory_total as f32) * 100.0
    } else {
        0.0
    };
    
    // Get disk usage for root partition
    let mut disk_total: u64 = 0;
    let mut disk_used: u64 = 0;
    for disk in disks.iter() {
        if disk.mount_point().to_string_lossy() == "/" {
            disk_total = disk.total_space() / 1024 / 1024 / 1024; // GB
            disk_used = (disk.total_space() - disk.available_space()) / 1024 / 1024 / 1024;
            break;
        }
    }
    let disk_percent = if disk_total > 0 {
        (disk_used as f32 / disk_total as f32) * 100.0
    } else {
        0.0
    };
    
    let load_avg = System::load_average();
    
    SystemMetrics {
        timestamp: chrono::Utc::now(),
        hostname: hostname.to_string(),
        cpu_usage_percent: cpu_usage,
        memory_total_mb: memory_total,
        memory_used_mb: memory_used,
        memory_usage_percent: memory_percent,
        disk_total_gb: disk_total,
        disk_used_gb: disk_used,
        disk_usage_percent: disk_percent,
        load_avg_1m: load_avg.one,
        load_avg_5m: load_avg.five,
        load_avg_15m: load_avg.fifteen,
        uptime_seconds: System::uptime(),
    }
}

/// Collect metrics for all running containers
async fn collect_container_metrics(
    docker: &bollard::Docker,
    hostname: &str,
) -> Result<Vec<ContainerMetrics>, bollard::errors::Error> {
    use bollard::container::ListContainersOptions;
    use std::collections::HashMap;
    
    let mut filters = HashMap::new();
    filters.insert("status", vec!["running"]);
    
    let options = ListContainersOptions {
        all: false,
        filters,
        ..Default::default()
    };
    
    let containers = docker.list_containers(Some(options)).await?;
    let mut metrics = Vec::new();
    
    for container in containers {
        let container_id = container.id.clone().unwrap_or_default();
        let container_name = container.names
            .and_then(|n| n.first().cloned())
            .unwrap_or_else(|| container_id.clone())
            .trim_start_matches('/')
            .to_string();
        
        // Get container stats
        if let Ok(stats) = get_container_stats(docker, &container_id).await {
            metrics.push(ContainerMetrics {
                timestamp: chrono::Utc::now(),
                hostname: hostname.to_string(),
                container_id: container_id.clone(),
                container_name,
                cpu_percent: stats.cpu_percent,
                memory_usage_mb: stats.memory_usage_mb,
                memory_limit_mb: stats.memory_limit_mb,
                network_rx_bytes: stats.network_rx_bytes,
                network_tx_bytes: stats.network_tx_bytes,
                disk_read_bytes: stats.disk_read_bytes,
                disk_write_bytes: stats.disk_write_bytes,
            });
        }
    }
    
    Ok(metrics)
}

struct ContainerStats {
    cpu_percent: f64,
    memory_usage_mb: f64,
    memory_limit_mb: f64,
    network_rx_bytes: u64,
    network_tx_bytes: u64,
    disk_read_bytes: u64,
    disk_write_bytes: u64,
}

async fn get_container_stats(
    docker: &bollard::Docker,
    container_id: &str,
) -> Result<ContainerStats, bollard::errors::Error> {
    use bollard::container::StatsOptions;
    use futures::StreamExt;
    
    let options = StatsOptions {
        stream: false,
        one_shot: true,
    };
    
    let mut stats_stream = docker.stats(container_id, Some(options));
    
    if let Some(Ok(stats)) = stats_stream.next().await {
        // Calculate CPU percentage
        let cpu_delta = stats.cpu_stats.cpu_usage.total_usage
            .saturating_sub(stats.precpu_stats.cpu_usage.total_usage);
        let system_delta = stats.cpu_stats.system_cpu_usage
            .unwrap_or(0)
            .saturating_sub(stats.precpu_stats.system_cpu_usage.unwrap_or(0));
        let cpu_count = stats.cpu_stats.online_cpus.unwrap_or(1);
        
        let cpu_percent = if system_delta > 0 && cpu_delta > 0 {
            (cpu_delta as f64 / system_delta as f64) * cpu_count as f64 * 100.0
        } else {
            0.0
        };
        
        // Memory
        let memory_usage = stats.memory_stats.usage.unwrap_or(0) as f64 / 1024.0 / 1024.0;
        let memory_limit = stats.memory_stats.limit.unwrap_or(0) as f64 / 1024.0 / 1024.0;
        
        // Network
        let (rx, tx) = stats.networks.map(|nets| {
            nets.values().fold((0u64, 0u64), |(rx, tx), net| {
                (rx + net.rx_bytes, tx + net.tx_bytes)
            })
        }).unwrap_or((0, 0));
        
        // Disk I/O
        let (read, write) = stats.blkio_stats.io_service_bytes_recursive
            .map(|io| {
                io.iter().fold((0u64, 0u64), |(r, w), entry| {
                    match entry.op.as_str() {
                        "read" | "Read" => (r + entry.value, w),
                        "write" | "Write" => (r, w + entry.value),
                        _ => (r, w),
                    }
                })
            })
            .unwrap_or((0, 0));
        
        return Ok(ContainerStats {
            cpu_percent,
            memory_usage_mb: memory_usage,
            memory_limit_mb: memory_limit,
            network_rx_bytes: rx,
            network_tx_bytes: tx,
            disk_read_bytes: read,
            disk_write_bytes: write,
        });
    }
    
    Ok(ContainerStats {
        cpu_percent: 0.0,
        memory_usage_mb: 0.0,
        memory_limit_mb: 0.0,
        network_rx_bytes: 0,
        network_tx_bytes: 0,
        disk_read_bytes: 0,
        disk_write_bytes: 0,
    })
}
