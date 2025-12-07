//! Health check module
//!
//! Monitors container health and triggers auto-recovery

use crate::AgentState;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Health check result
#[derive(Debug, serde::Serialize)]
pub struct HealthCheckResult {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub hostname: String,
    pub container_id: String,
    pub container_name: String,
    pub status: HealthStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub enum HealthStatus {
    Healthy,
    Unhealthy,
    Starting,
    None,
}

/// Main health check loop
pub async fn check_loop(state: Arc<RwLock<AgentState>>) {
    info!("Starting health check loop");
    
    let interval = tokio::time::Duration::from_secs(30);
    
    loop {
        let state = state.read().await;
        let docker = &state.docker_client;
        let hostname = &state.hostname;
        let nats = state.nats_client.clone();
        
        // Get all running containers
        match check_all_containers(docker, hostname).await {
            Ok(results) => {
                let unhealthy: Vec<_> = results.iter()
                    .filter(|r| r.status == HealthStatus::Unhealthy)
                    .collect();
                
                if !unhealthy.is_empty() {
                    warn!(
                        count = unhealthy.len(),
                        "Found unhealthy containers"
                    );
                    
                    // Publish health alerts
                    if let Some(ref nats) = nats {
                        for result in &unhealthy {
                            let subject = format!("metalhive.health.alert.{}", hostname);
                            if let Ok(payload) = serde_json::to_vec(result) {
                                if let Err(e) = nats.publish(subject, bytes::Bytes::from(payload)).await {
                                    error!(error = %e, "Failed to publish health alert");
                                }
                            }
                        }
                    }
                    
                    // Attempt auto-recovery for unhealthy containers
                    for result in unhealthy {
                        attempt_recovery(docker, &result.container_id, &result.container_name).await;
                    }
                } else {
                    debug!("All containers healthy");
                }
            }
            Err(e) => {
                error!(error = %e, "Failed to check container health");
            }
        }
        
        drop(state);
        tokio::time::sleep(interval).await;
    }
}

/// Check health of all containers
async fn check_all_containers(
    docker: &bollard::Docker,
    hostname: &str,
) -> Result<Vec<HealthCheckResult>, bollard::errors::Error> {
    use bollard::container::{ListContainersOptions, InspectContainerOptions};
    use std::collections::HashMap;
    
    let mut filters = HashMap::new();
    filters.insert("status", vec!["running"]);
    
    let options = ListContainersOptions {
        all: false,
        filters,
        ..Default::default()
    };
    
    let containers = docker.list_containers(Some(options)).await?;
    let mut results = Vec::new();
    
    for container in containers {
        let id = container.id.clone().unwrap_or_default();
        let name = container.names
            .and_then(|n| n.first().cloned())
            .unwrap_or_else(|| id.clone())
            .trim_start_matches('/')
            .to_string();
        
        // Inspect container for health status
        let inspect = docker.inspect_container(&id, None::<InspectContainerOptions>).await?;
        
        let (status, message) = if let Some(state) = inspect.state {
            if let Some(health) = state.health {
                let status = match health.status {
                    Some(bollard::secret::HealthStatusEnum::HEALTHY) => HealthStatus::Healthy,
                    Some(bollard::secret::HealthStatusEnum::UNHEALTHY) => HealthStatus::Unhealthy,
                    Some(bollard::secret::HealthStatusEnum::STARTING) => HealthStatus::Starting,
                    _ => HealthStatus::None,
                };
                
                let message = health.log
                    .and_then(|logs| logs.last().cloned())
                    .and_then(|log| log.output);
                
                (status, message)
            } else {
                // No health check configured - check if container is running
                if state.running.unwrap_or(false) {
                    (HealthStatus::Healthy, None)
                } else {
                    (HealthStatus::Unhealthy, Some("Container not running".to_string()))
                }
            }
        } else {
            (HealthStatus::None, None)
        };
        
        results.push(HealthCheckResult {
            timestamp: chrono::Utc::now(),
            hostname: hostname.to_string(),
            container_id: id,
            container_name: name,
            status,
            message,
        });
    }
    
    Ok(results)
}

/// Attempt to recover an unhealthy container
async fn attempt_recovery(docker: &bollard::Docker, container_id: &str, container_name: &str) {
    info!(
        container = %container_name,
        "Attempting auto-recovery for unhealthy container"
    );
    
    // Get container labels to check recovery policy
    match docker.inspect_container(container_id, None::<bollard::container::InspectContainerOptions>).await {
        Ok(inspect) => {
            let labels = inspect.config
                .and_then(|c| c.labels)
                .unwrap_or_default();
            
            // Check if auto-recovery is enabled
            let auto_recover = labels.get("metalhive.recovery.enabled")
                .map(|v| v == "true")
                .unwrap_or(true); // Default to enabled
            
            if !auto_recover {
                info!(container = %container_name, "Auto-recovery disabled for container");
                return;
            }
            
            let restart_count = inspect.restart_count.unwrap_or(0);
            let max_restarts = labels.get("metalhive.recovery.max_restarts")
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(5);
            
            if restart_count >= max_restarts {
                warn!(
                    container = %container_name,
                    restart_count = restart_count,
                    max_restarts = max_restarts,
                    "Max restart count exceeded, not restarting"
                );
                return;
            }
            
            // Restart the container
            match docker.restart_container(container_id, None).await {
                Ok(_) => {
                    info!(container = %container_name, "Container restarted successfully");
                }
                Err(e) => {
                    error!(
                        container = %container_name,
                        error = %e,
                        "Failed to restart container"
                    );
                }
            }
        }
        Err(e) => {
            error!(
                container = %container_name,
                error = %e,
                "Failed to inspect container for recovery"
            );
        }
    }
}
