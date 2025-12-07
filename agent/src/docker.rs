//! Docker integration module
//!
//! Handles Docker API interactions and event streaming

use crate::AgentState;
use bollard::container::{ListContainersOptions, InspectContainerOptions};
use bollard::system::EventsOptions;
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Container information
#[derive(Debug, Clone, serde::Serialize)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub health: Option<String>,
    pub ports: Vec<String>,
    pub labels: HashMap<String, String>,
    pub created_at: String,
    pub started_at: Option<String>,
}

/// Docker event
#[derive(Debug, serde::Serialize)]
pub struct DockerEvent {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub hostname: String,
    pub event_type: String,
    pub action: String,
    pub actor_id: String,
    pub actor_name: String,
    pub attributes: HashMap<String, String>,
}

/// Listen for Docker events and publish to NATS
pub async fn event_listener(state: Arc<RwLock<AgentState>>) {
    info!("Starting Docker event listener");
    
    loop {
        let state = state.read().await;
        let docker = state.docker_client.clone();
        let hostname = state.hostname.clone();
        let nats = state.nats_client.clone();
        drop(state);
        
        let options = EventsOptions::<String> {
            ..Default::default()
        };
        
        let mut events = docker.events(Some(options));
        
        while let Some(event_result) = events.next().await {
            match event_result {
                Ok(event) => {
                    let docker_event = DockerEvent {
                        timestamp: chrono::Utc::now(),
                        hostname: hostname.clone(),
                        event_type: event.typ.map(|t| format!("{:?}", t)).unwrap_or_default(),
                        action: event.action.unwrap_or_default(),
                        actor_id: event.actor.as_ref()
                            .and_then(|a| a.id.clone())
                            .unwrap_or_default(),
                        actor_name: event.actor.as_ref()
                            .and_then(|a| a.attributes.as_ref())
                            .and_then(|attrs| attrs.get("name").cloned())
                            .unwrap_or_default(),
                        attributes: event.actor
                            .and_then(|a| a.attributes)
                            .unwrap_or_default(),
                    };
                    
                    debug!(event = ?docker_event, "Docker event received");
                    
                    // Publish to NATS
                    if let Some(ref nats) = nats {
                        let subject = format!("metalhive.events.docker.{}", hostname);
                        if let Ok(payload) = serde_json::to_vec(&docker_event) {
                            if let Err(e) = nats.publish(subject, payload.into()).await {
                                error!(error = %e, "Failed to publish Docker event");
                            }
                        }
                    }
                }
                Err(e) => {
                    error!(error = %e, "Error receiving Docker event");
                    break;
                }
            }
        }
        
        warn!("Docker event stream ended, reconnecting in 5 seconds");
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}

/// List all containers on this node
pub async fn list_containers(docker: &bollard::Docker) -> Result<Vec<ContainerInfo>, bollard::errors::Error> {
    let options = ListContainersOptions::<String> {
        all: true,
        ..Default::default()
    };
    
    let containers = docker.list_containers(Some(options)).await?;
    let mut result = Vec::new();
    
    for container in containers {
        let id = container.id.clone().unwrap_or_default();
        
        // Get detailed info
        let inspect = docker.inspect_container(&id, None::<InspectContainerOptions>).await?;
        
        let name = inspect.name.unwrap_or_default().trim_start_matches('/').to_string();
        let image = container.image.unwrap_or_default();
        let status = container.status.unwrap_or_default();
        let state = container.state.unwrap_or_default();
        
        let health = inspect.state
            .and_then(|s| s.health)
            .and_then(|h| h.status)
            .map(|s| format!("{:?}", s));
        
        let ports = container.ports.unwrap_or_default()
            .iter()
            .filter_map(|p| {
                let private = p.private_port;
                let public = p.public_port;
                let port_type = p.typ.as_ref().map(|t| format!("{:?}", t)).unwrap_or_default();
                
                if let Some(pub_port) = public {
                    Some(format!("{}:{}/{}", pub_port, private, port_type.to_lowercase()))
                } else {
                    Some(format!("{}/{}", private, port_type.to_lowercase()))
                }
            })
            .collect();
        
        let labels = container.labels.unwrap_or_default();
        
        let created_at = inspect.created.unwrap_or_default();
        let started_at = inspect.state.and_then(|s| s.started_at);
        
        result.push(ContainerInfo {
            id,
            name,
            image,
            status,
            state,
            health,
            ports,
            labels,
            created_at,
            started_at,
        });
    }
    
    Ok(result)
}

/// Start a container
pub async fn start_container(docker: &bollard::Docker, container_id: &str) -> Result<(), bollard::errors::Error> {
    docker.start_container::<String>(container_id, None).await
}

/// Stop a container
pub async fn stop_container(docker: &bollard::Docker, container_id: &str) -> Result<(), bollard::errors::Error> {
    docker.stop_container(container_id, None).await
}

/// Restart a container
pub async fn restart_container(docker: &bollard::Docker, container_id: &str) -> Result<(), bollard::errors::Error> {
    docker.restart_container(container_id, None).await
}

/// Remove a container
pub async fn remove_container(docker: &bollard::Docker, container_id: &str, force: bool) -> Result<(), bollard::errors::Error> {
    use bollard::container::RemoveContainerOptions;
    
    let options = RemoveContainerOptions {
        force,
        ..Default::default()
    };
    
    docker.remove_container(container_id, Some(options)).await
}

/// Pull an image
pub async fn pull_image(docker: &bollard::Docker, image: &str) -> Result<(), bollard::errors::Error> {
    use bollard::image::CreateImageOptions;
    
    let options = CreateImageOptions {
        from_image: image,
        ..Default::default()
    };
    
    let mut stream = docker.create_image(Some(options), None, None);
    
    while let Some(result) = stream.next().await {
        match result {
            Ok(info) => {
                debug!(progress = ?info, "Pulling image");
            }
            Err(e) => {
                error!(error = %e, "Error pulling image");
                return Err(e);
            }
        }
    }
    
    Ok(())
}
