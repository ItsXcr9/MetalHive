//! Configuration module
//!
//! Handles agent configuration from files and environment

use serde::Deserialize;
use std::collections::HashMap;

/// Agent configuration
#[derive(Debug, Clone, Deserialize)]
pub struct AgentConfig {
    /// Agent identification
    #[serde(default)]
    pub agent: AgentIdentity,
    
    /// Controller settings
    #[serde(default)]
    pub controller: ControllerConfig,
    
    /// NATS settings
    #[serde(default)]
    pub nats: NatsConfig,
    
    /// Metrics settings
    #[serde(default)]
    pub metrics: MetricsConfig,
    
    /// Discovery settings
    #[serde(default)]
    pub discovery: DiscoveryConfig,
    
    /// Recovery settings
    #[serde(default)]
    pub recovery: RecoveryConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentIdentity {
    /// Agent ID (defaults to hostname)
    pub id: Option<String>,
    
    /// Agent labels
    #[serde(default)]
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControllerConfig {
    /// Controller URL
    #[serde(default = "default_controller_url")]
    pub url: String,
    
    /// Heartbeat interval in seconds
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NatsConfig {
    /// NATS URL
    #[serde(default = "default_nats_url")]
    pub url: String,
    
    /// Reconnect on disconnect
    #[serde(default = "default_true")]
    pub reconnect: bool,
    
    /// Max reconnect attempts
    #[serde(default = "default_max_reconnect")]
    pub max_reconnect: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetricsConfig {
    /// Metrics collection interval in seconds
    #[serde(default = "default_metrics_interval")]
    pub interval: u64,
    
    /// Enable container metrics
    #[serde(default = "default_true")]
    pub containers: bool,
    
    /// Enable system metrics
    #[serde(default = "default_true")]
    pub system: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DiscoveryConfig {
    /// Enable mDNS broadcast
    #[serde(default = "default_true")]
    pub mdns_enabled: bool,
    
    /// mDNS service type
    #[serde(default = "default_mdns_service")]
    pub mdns_service: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RecoveryConfig {
    /// Enable auto-recovery
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Max restart attempts
    #[serde(default = "default_max_restarts")]
    pub max_restarts: u32,
    
    /// Cooldown between restarts in seconds
    #[serde(default = "default_cooldown")]
    pub cooldown: u64,
}

// Default value functions
fn default_controller_url() -> String {
    "http://localhost:8080".to_string()
}

fn default_nats_url() -> String {
    "nats://localhost:4222".to_string()
}

fn default_heartbeat_interval() -> u64 {
    10
}

fn default_metrics_interval() -> u64 {
    10
}

fn default_max_reconnect() -> u32 {
    10
}

fn default_max_restarts() -> u32 {
    5
}

fn default_cooldown() -> u64 {
    60
}

fn default_true() -> bool {
    true
}

fn default_mdns_service() -> String {
    "_metalhive._tcp.local.".to_string()
}

// Default implementations
impl Default for AgentIdentity {
    fn default() -> Self {
        Self {
            id: None,
            labels: HashMap::new(),
        }
    }
}

impl Default for ControllerConfig {
    fn default() -> Self {
        Self {
            url: default_controller_url(),
            heartbeat_interval: default_heartbeat_interval(),
        }
    }
}

impl Default for NatsConfig {
    fn default() -> Self {
        Self {
            url: default_nats_url(),
            reconnect: true,
            max_reconnect: default_max_reconnect(),
        }
    }
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            interval: default_metrics_interval(),
            containers: true,
            system: true,
        }
    }
}

impl Default for DiscoveryConfig {
    fn default() -> Self {
        Self {
            mdns_enabled: true,
            mdns_service: default_mdns_service(),
        }
    }
}

impl Default for RecoveryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_restarts: default_max_restarts(),
            cooldown: default_cooldown(),
        }
    }
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            agent: AgentIdentity::default(),
            controller: ControllerConfig::default(),
            nats: NatsConfig::default(),
            metrics: MetricsConfig::default(),
            discovery: DiscoveryConfig::default(),
            recovery: RecoveryConfig::default(),
        }
    }
}

/// Load configuration from file
pub fn load_config(path: &str) -> Result<AgentConfig, config::ConfigError> {
    let settings = config::Config::builder()
        .add_source(config::File::with_name(path).required(false))
        .add_source(config::Environment::with_prefix("METALHIVE"))
        .build()?;
    
    settings.try_deserialize()
}
