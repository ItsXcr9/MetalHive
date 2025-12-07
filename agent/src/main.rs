//! MetalHive Agent
//!
//! The agent runs on each node in the fleet and is responsible for:
//! - Registering the node with the controller
//! - Collecting system and container metrics
//! - Executing commands from HiveShell
//! - Managing Docker containers
//! - Broadcasting presence via mDNS

use anyhow::Result;
use clap::Parser;
use metalhive_agent::{config, docker, executor, health, metrics, AgentState};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

/// MetalHive Agent - Manages Docker containers on a single node
#[derive(Parser, Debug)]
#[command(name = "metalhive-agent")]
#[command(about = "MetalHive Agent - Docker fleet management agent")]
#[command(version)]
struct Args {
    /// Agent ID (defaults to hostname)
    #[arg(long, env = "AGENT_ID")]
    id: Option<String>,

    /// Controller URL
    #[arg(long, env = "CONTROLLER_URL", default_value = "http://localhost:8080")]
    controller_url: String,

    /// NATS URL
    #[arg(long, env = "NATS_URL", default_value = "nats://localhost:4222")]
    nats_url: String,

    /// Enable mDNS discovery broadcast
    #[arg(long, env = "MDNS_ENABLED", default_value = "true")]
    mdns_enabled: bool,

    /// Metrics collection interval in seconds
    #[arg(long, env = "METRICS_INTERVAL", default_value = "10")]
    metrics_interval: u64,

    /// Agent labels (comma-separated key=value pairs)
    #[arg(long, env = "AGENT_LABELS")]
    labels: Option<String>,

    /// Log level
    #[arg(long, env = "LOG_LEVEL", default_value = "info")]
    log_level: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&args.log_level)),
        )
        .json()
        .init();

    info!("🐝 MetalHive Agent starting...");

    // Get hostname
    let hostname = gethostname::gethostname()
        .to_string_lossy()
        .to_string();
    
    let agent_id = args.id.unwrap_or_else(|| hostname.clone());
    info!(agent_id = %agent_id, hostname = %hostname, "Agent identity");

    // Parse labels
    let labels = parse_labels(args.labels);
    info!(labels = ?labels, "Agent labels");

    // Connect to Docker
    let docker = bollard::Docker::connect_with_socket_defaults()
        .expect("Failed to connect to Docker daemon");
    
    // Verify Docker connection
    let docker_info = docker.info().await?;
    info!(
        containers = docker_info.containers.unwrap_or(0),
        images = docker_info.images.unwrap_or(0),
        "Connected to Docker"
    );

    // Connect to NATS
    let nats_client = match async_nats::connect(&args.nats_url).await {
        Ok(client) => {
            info!(url = %args.nats_url, "Connected to NATS");
            Some(client)
        }
        Err(e) => {
            error!(error = %e, "Failed to connect to NATS, running in standalone mode");
            None
        }
    };

    // Create shared state
    let state = Arc::new(RwLock::new(AgentState {
        agent_id: agent_id.clone(),
        hostname: hostname.clone(),
        labels,
        docker_client: docker,
        nats_client,
    }));

    // Spawn background tasks
    let mut handles = vec![];

    // 1. Metrics collection loop
    let metrics_state = Arc::clone(&state);
    let metrics_interval = args.metrics_interval;
    handles.push(tokio::spawn(async move {
        metrics::collection_loop(metrics_state, metrics_interval).await;
    }));

    // 2. Docker event listener
    let docker_state = Arc::clone(&state);
    handles.push(tokio::spawn(async move {
        docker::event_listener(docker_state).await;
    }));

    // 3. Command executor (listens for HiveShell commands)
    if state.read().await.nats_client.is_some() {
        let executor_state = Arc::clone(&state);
        handles.push(tokio::spawn(async move {
            executor::command_listener(executor_state).await;
        }));
    }

    // 4. Health check loop
    let health_state = Arc::clone(&state);
    handles.push(tokio::spawn(async move {
        health::check_loop(health_state).await;
    }));

    // 5. mDNS broadcast (if enabled)
    if args.mdns_enabled {
        let mdns_hostname = hostname.clone();
        handles.push(tokio::spawn(async move {
            if let Err(e) = broadcast_mdns(&mdns_hostname).await {
                error!(error = %e, "mDNS broadcast failed");
            }
        }));
    }

    // 6. Heartbeat to controller
    let heartbeat_state = Arc::clone(&state);
    let controller_url = args.controller_url.clone();
    handles.push(tokio::spawn(async move {
        heartbeat_loop(heartbeat_state, &controller_url).await;
    }));

    info!("🚀 Agent is running. Press Ctrl+C to stop.");

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    info!("Shutting down agent...");

    // Cancel all tasks
    for handle in handles {
        handle.abort();
    }

    Ok(())
}

/// Parse comma-separated key=value labels
fn parse_labels(labels: Option<String>) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    
    if let Some(labels_str) = labels {
        for pair in labels_str.split(',') {
            if let Some((key, value)) = pair.split_once('=') {
                map.insert(key.trim().to_string(), value.trim().to_string());
            }
        }
    }
    
    map
}

/// Broadcast agent presence via mDNS
async fn broadcast_mdns(hostname: &str) -> Result<()> {
    use mdns_sd::{ServiceDaemon, ServiceInfo};
    
    let mdns = ServiceDaemon::new()?;
    let service_type = "_metalhive._tcp.local.";
    
    let service_info = ServiceInfo::new(
        service_type,
        hostname,
        hostname,
        "",
        8080,
        None,
    )?;
    
    mdns.register(service_info)?;
    info!(hostname = %hostname, "Broadcasting mDNS presence");
    
    // Keep running until cancelled
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}

/// Send heartbeat to controller
async fn heartbeat_loop(state: Arc<RwLock<AgentState>>, controller_url: &str) {
    let client = reqwest::Client::new();
    let heartbeat_url = format!("{}/api/agents/heartbeat", controller_url);
    
    loop {
        let state = state.read().await;
        
        let payload = serde_json::json!({
            "agent_id": state.agent_id,
            "hostname": state.hostname,
            "labels": state.labels,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });
        
        drop(state);
        
        match client.post(&heartbeat_url).json(&payload).send().await {
            Ok(resp) if resp.status().is_success() => {
                tracing::debug!("Heartbeat sent successfully");
            }
            Ok(resp) => {
                tracing::warn!(status = %resp.status(), "Heartbeat failed");
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to send heartbeat");
            }
        }
        
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
    }
}
