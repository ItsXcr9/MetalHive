//! MetalHive Agent Library
//!
//! This crate provides the core functionality for the MetalHive agent.

pub mod config;
pub mod docker;
pub mod executor;
pub mod health;
pub mod metrics;
pub mod nats_client;

pub use config::AgentConfig;

/// Agent state shared across tasks
pub struct AgentState {
    pub agent_id: String,
    pub hostname: String,
    pub labels: std::collections::HashMap<String, String>,
    pub docker_client: bollard::Docker,
    pub nats_client: Option<async_nats::Client>,
}
